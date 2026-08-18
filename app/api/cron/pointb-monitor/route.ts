import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { resolveSystemSenderUserId } from "@/lib/email/systemSender";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import { sendEmail } from "@/lib/email/send";
import { fishbowlConfigured, withFishbowl } from "@/lib/fishbowl";
import {
  synapseConfigured,
  feesConfigured,
  getRecentShippedOrders,
  getOrderFeesMany,
} from "@/lib/pointb";
import { KNOWN_FEE_CODES } from "@/lib/pointbFieldMap";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/pointb-monitor
 *
 * Daily Point B health check. Cross-checks the last few days of Point B
 * shipments against Fishbowl and emails Blake ONLY when something's off:
 *  - a Point B charge code we don't recognize (freight math may drift),
 *  - an order shipped at Point B but not found in Fishbowl,
 *  - tracking that shipped at Point B but isn't on the Fishbowl order,
 *  - a wholesale freight line that doesn't equal order/fees.totalAmount × 1.25.
 * Silent when everything reconciles, so a clean inbox means all clear.
 *
 * Auth: Vercel cron (Bearer CRON_SECRET) or a signed-in user. `?dry=1` reports
 * without sending; `?force=1` runs off-hour. Safe to deploy before the Point B
 * env is set — it no-ops until Synapse + fees creds are present.
 */

const TO = [{ address: "blake.ekelund@fragrancemarketinggroup.com", name: "Blake Ekelund" }];
const TZ = "America/New_York";
const SEND_HOUR = 7; // 7 AM Eastern
const LOOKBACK_DAYS = 3; // covers weekends / a missed run

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const near = (a: number, b: number) => Math.abs(a - b) < 0.02;
const split = (s: unknown) =>
  String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function hourInTz(tz: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(
    new Date(),
  );
  return Number(h) % 24;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";

  if (!dry && !force && hourInTz(TZ) !== SEND_HOUR) {
    return NextResponse.json({ skipped: true, hour: hourInTz(TZ), tz: TZ });
  }
  if (!fishbowlConfigured() || !synapseConfigured() || !feesConfigured()) {
    return NextResponse.json({ skipped: true, reason: "Point B / Fishbowl not fully configured yet." });
  }

  const issues: string[] = [];
  const drift: string[] = [];

  // 1. Point B shipments in the window
  let shipped: Awaited<ReturnType<typeof getRecentShippedOrders>> = [];
  try {
    shipped = await getRecentShippedOrders(LOOKBACK_DAYS);
  } catch (e) {
    issues.push(`Couldn't reach Point B (Synapse): ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Their fees (one token) → drift on charge codes
  const feesMap = shipped.length
    ? await getOrderFeesMany(shipped.map((s) => s.orderid)).catch(() => new Map())
    : new Map();
  const seen = new Map<number, string>();
  for (const f of feesMap.values()) for (const d of f.detail) if (!seen.has(d.code)) seen.set(d.code, d.description);
  for (const [code, desc] of seen) {
    if (!(code in KNOWN_FEE_CODES)) drift.push(`New Point B charge code ${code} "${desc}" — freight math may be affected.`);
  }

  // 3. Fishbowl side for those SO#s (one session)
  const nums = Array.from(new Set(shipped.map((s) => s.po).filter(Boolean)));
  const fbByNum = new Map<string, Record<string, unknown>>();
  if (nums.length) {
    try {
      const rows = await withFishbowl((query) =>
        query(
          `SELECT so.num, qbclass.name AS channel, sostatus.name AS status,
            (SELECT GROUP_CONCAT(si.totalPrice)
               FROM soitem si JOIN soitemtype st ON si.typeId = st.id
               WHERE si.soId = so.id AND st.name = 'Shipping') AS shipLines,
            (SELECT GROUP_CONCAT(DISTINCT sc.trackingNum)
               FROM shipcarton sc JOIN ship sh ON sc.shipId = sh.id
               WHERE sh.soId = so.id AND sc.trackingNum IS NOT NULL AND sc.trackingNum <> '') AS tracking
           FROM so
           LEFT JOIN customer ON so.customerId = customer.id
           LEFT JOIN qbclass ON customer.qbClassId = qbclass.id
           LEFT JOIN sostatus ON so.statusId = sostatus.id
           WHERE so.num IN (${nums.map(q).join(",")})`,
        ),
      );
      for (const r of rows) fbByNum.set(String((r as Record<string, unknown>).num), r as Record<string, unknown>);
    } catch (e) {
      issues.push(`Fishbowl lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 4. Per-order reconciliation
  for (const s of shipped) {
    const fb = fbByNum.get(s.po);
    if (!fb) {
      issues.push(`Order ${s.po} shipped at Point B but isn't in Fishbowl.`);
      continue;
    }
    const fbTracking = split(fb.tracking);
    if (s.tracking.length && !s.tracking.some((t) => fbTracking.includes(t))) {
      issues.push(`Order ${s.po} shipped (${s.tracking[0]}) but that tracking isn't on the Fishbowl order.`);
    }
    // Freight markup only applies to wholesale (D2C/WEB is tracking-only).
    if (String(fb.channel || "").toUpperCase() !== "WEB") {
      const fees = feesMap.get(s.orderid);
      if (fees) {
        const expected = Math.round(fees.totalAmount * 1.25 * 100) / 100;
        const fbLines = split(fb.shipLines).map(num);
        if (!fbLines.some((v) => near(v, expected)))
          issues.push(
            `Order ${s.po} freight mismatch — expected $${expected.toFixed(2)} (Point B $${fees.totalAmount.toFixed(2)} × 1.25), Fishbowl has ${fbLines.map((v) => "$" + v.toFixed(2)).join(" / ") || "none"}.`,
          );
      }
    }
  }

  const clean = issues.length === 0 && drift.length === 0;
  const report = { checked: shipped.length, issues, drift, clean };

  if (dry) return NextResponse.json({ dry: true, ...report });
  if (clean) return NextResponse.json({ sent: false, ...report }); // silent = all good

  const senderUserId = await resolveSystemSenderUserId();
  if (!senderUserId) {
    return NextResponse.json({ error: "No connected Outlook account to send from.", ...report }, { status: 500 });
  }
  const origin =
    (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") ||
    "https://app.fragrancemarketinggroup.com";
  try {
    const { accessToken } = await getAccessTokenForUser(senderUserId);
    const count = issues.length + drift.length;
    await sendEmail(accessToken, {
      subject: `⚠ Point B check — ${count} item${count === 1 ? "" : "s"} to review`,
      bodyHtml: buildHtml(report, origin),
      to: TO,
    });
    return NextResponse.json({ sent: true, ...report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), ...report }, { status: 500 });
  }
}

function buildHtml(
  report: { checked: number; issues: string[]; drift: string[] },
  origin: string,
): string {
  const li = (s: string) => `<li style="margin:4px 0;">${s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</li>`;
  const section = (title: string, items: string[], color: string) =>
    items.length
      ? `<h3 style="margin:16px 0 4px;color:${color};">${title}</h3><ul style="margin:0;padding-left:18px;color:#333;font-size:14px;">${items.map(li).join("")}</ul>`
      : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:720px;">
  <h2 style="margin:0 0 4px;">Point B daily check</h2>
  <p style="margin:0 0 8px;color:#666;font-size:13px;">Checked ${report.checked} recent Point B shipment${report.checked === 1 ? "" : "s"}.</p>
  ${section("Field / charge drift", report.drift, "#b45309")}
  ${section("Order reconciliation", report.issues, "#b91c1c")}
  <p style="margin:18px 0 0;font-size:13px;">
    <a href="${origin}/pointb-check" style="color:#4f46e5;">Open Order Check →</a>
  </p>
</div>`;
}
