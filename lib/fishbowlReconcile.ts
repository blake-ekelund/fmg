/**
 * Reconcile marketplace orders (Faire / MarketTime) against Fishbowl to catch
 * the ones ops HAND-KEYED into Fishbowl without marking them in the app — they'd
 * otherwise sit forever as "Needs Fishbowl" on the Orders page even though the
 * SO already exists.
 *
 * TWO KEYS, because Fishbowl POs come from two places. Orders WE push carry
 * `<ref>-MKTTIME` / `<ref>-FAIRE`; orders a human keys by hand carry the
 * marketplace's own PO, which is a different identifier entirely. Searching for
 * the ref alone found only our own work. St. Joseph's Hospital South shipped as
 * SO 24280 under customerPO `CF4CFH49XR` and was never matched to MarketTime
 * record 32698933 — it read as unentered business for two months. So we search
 * the bare ref AND `orders.external_po` (migration 20260909020000).
 *
 * A LIKE hit is then confirmed as a WHOLE TOKEN (containsAsToken), which is what
 * stops a numeric MarketTime id matching a longer number that contains it, and
 * any SO that is Voided/Cancelled/Expired is discarded outright — an order must
 * never be stamped "entered" against a dead SO.
 *
 * What makes a surviving match trustworthy, most certain first:
 *   1. the totals agree;
 *   2. we matched the marketplace's own PO — as distinctive as a Faire code;
 *   3. FAIRE, where the random 10-char ref alone has always been definitive;
 *   4. the SO has SHIPPED (Fulfilled/Closed Short), so Fishbowl has added a
 *      shipping amount and its total is EXPECTED to exceed our stored subtotal
 *      (Blake, 2026-08-13).
 *
 * Case 4 used to be a rejection for MarketTime, which demanded an exact total on
 * the theory that these orders are new and unshipped. That is untrue for
 * anything keyed by hand before we imported it — St. Joseph's read $588 against
 * the SO's $647.96 — and it rejected exactly the shipped orders reconciliation
 * exists to find. The token check now does the collision-blocking that the total
 * gate was really there for.
 *
 * Stamps `fishbowl_entered_at` + records the SO number in `fishbowl_entered_by`.
 * That flips Status from "Needs Fishbowl" to "Needs tracking" (the tracking-sync
 * cron then takes it the rest of the way). Also captures the SO's `dateFirstShip`
 * into `scheduled_ship_date` (the Faire/MarketTime ship-by date) for the Orders
 * page. Never un-stamps and never writes to Fishbowl — read-only there,
 * idempotent here (only fills whatever is still missing on an order).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { withFishbowl, fishbowlConfigured } from "./fishbowl";

export type ReconcileResult = {
  checked: number;
  stamped: Array<{ ref: string; soNum: string; total: number; kind: string; shipBy?: string | null }>;
  skipped: Array<{ ref: string; reason: string }>;
  dry: boolean;
  note?: string;
};

/** Bare ref reduced to [A-Za-z0-9] — also the safe LIKE needle (no quotes → no
 *  injection surface for the server-controlled data-query). */
const alnum = (s: string) => (s ?? "").replace(/[^A-Za-z0-9]/g, "");

/** Below this length a numeric/short ref could match unrelated POs — skip it
 *  rather than risk a loose match (Faire codes are 10 chars; MarketTime record
 *  ids are 8+ digits, but those also need the total guard below). */
const MIN_REF_LEN = 6;
const TOTAL_TOLERANCE = 0.01;

/** Leading YYYY-MM-DD of a Fishbowl datetime ("2026-09-15T00:00:00.000-05" →
 *  "2026-09-15"); the malformed tz offset makes new Date() unreliable. */
const parseDateOnly = (v: unknown): string | null => {
  const m = String(v ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

type OrderRow = {
  id: string;
  source: string | null;
  external_ref: string | null;
  business_name: string | null;
  total: number | null;
  fishbowl_entered_at: string | null;
  scheduled_ship_date?: string | null;
  /** The marketplace's own PO — what a human types into Fishbowl when they key
   *  an order by hand. Migration 20260909020000. */
  external_po?: string | null;
};

/** Fishbowl `sostatus`, read live 2026-09-09. */
const SO_STATUS_FULFILLED = 60;
const SO_STATUS_CLOSED_SHORT = 70;
/** Voided (80), Cancelled (85), Expired (90), Historical (95) — an order must
 *  never be stamped as "entered" against one of these. */
const SO_STATUS_DEAD_FROM = 80;

const isShipped = (statusId: unknown): boolean => {
  const s = Number(statusId);
  return s === SO_STATUS_FULFILLED || s === SO_STATUS_CLOSED_SHORT;
};
const isDead = (statusId: unknown): boolean => Number(statusId) >= SO_STATUS_DEAD_FROM;

/**
 * A PO we can safely use as a second search key: alphanumerics and dashes only,
 * long enough not to collide. The character restriction is doing two jobs —
 * it keeps the value injection-safe in the server-built data-query (no quotes),
 * and it keeps LIKE wildcards (`%`, `_`) out of the needle. Anything else falls
 * back to matching on the reference alone.
 */
export function safePoNeedle(po: string | null | undefined): string | null {
  const v = (po ?? "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{4,}$/.test(v) ? v : null;
}

/**
 * Does `needle` sit in `po` as a whole token, rather than inside a longer run?
 *
 * This is what stops a numeric MarketTime record id matching a bigger number
 * that merely contains it — the collision the old exact-total gate was really
 * guarding against. Real conventions all pass: `32617406-MKTTIME`,
 * `32771822-MKTTIME-BO`, `MYZCUWAEYR-FAIRE`, `#ZJUHGM7VPR`, `XZQYTWKZNE-2`,
 * and a bare `CF4CFH49XR`. A stray `132617406` does not.
 */
export function containsAsToken(po: string | null | undefined, needle: string): boolean {
  const hay = (po ?? "").toUpperCase();
  const nee = needle.toUpperCase();
  if (!nee) return false;
  const alnumChar = (c: string | undefined) => !!c && /[A-Z0-9]/.test(c);
  for (let i = hay.indexOf(nee); i >= 0; i = hay.indexOf(nee, i + 1)) {
    if (!alnumChar(hay[i - 1]) && !alnumChar(hay[i + nee.length])) return true;
  }
  return false;
}

export async function reconcileMarketplaceFishbowl(
  admin: SupabaseClient,
  opts: { dry?: boolean } = {},
): Promise<ReconcileResult> {
  const dry = !!opts.dry;

  if (!fishbowlConfigured()) {
    return { checked: 0, stamped: [], skipped: [], dry, note: "Fishbowl isn't configured." };
  }

  // Two optional columns, each a migration that may not be pushed yet:
  // scheduled_ship_date (20260813000000) and external_po (20260909020000).
  // Ask for everything, then drop whichever column the database rejects and try
  // again, so the reconcile degrades a feature at a time instead of failing.
  const BASE_COLS = "id, source, external_ref, business_name, total, fishbowl_entered_at";
  const OPTIONAL = ["scheduled_ship_date", "external_po"] as const;
  const present = new Set<string>(OPTIONAL);
  let rowsData: OrderRow[] = [];
  for (;;) {
    const cols = [BASE_COLS, ...OPTIONAL.filter((c) => present.has(c))].join(", ");
    const res = await admin.from("orders").select(cols).in("source", ["faire", "markettime"]);
    if (!res.error) {
      rowsData = (res.data ?? []) as unknown as OrderRow[];
      break;
    }
    const missing = OPTIONAL.find(
      (c) => present.has(c) && new RegExp(c, "i").test(res.error.message),
    );
    if (missing) {
      present.delete(missing);
      continue;
    }
    if (/source|external_ref|fishbowl_entered_at|schema cache/i.test(res.error.message)) {
      return { checked: 0, stamped: [], skipped: [], dry, note: `orders columns missing: ${res.error.message}` };
    }
    throw new Error(res.error.message);
  }
  const hasDateCol = present.has("scheduled_ship_date");

  // Only orders still missing something we can fill — the FB-entered stamp, or
  // (once the column exists) the scheduled ship date — need a Fishbowl lookup.
  const candidates = rowsData.filter((o) => {
    if (alnum(String(o.external_ref ?? "")).length < MIN_REF_LEN) return false;
    const needEntered = !o.fishbowl_entered_at;
    const needDate = hasDateCol && !o.scheduled_ship_date;
    return needEntered || needDate;
  });
  if (candidates.length === 0) {
    return { checked: 0, stamped: [], skipped: [], dry };
  }

  const refOf = (o: OrderRow) =>
    `${o.external_ref}-${o.source === "markettime" ? "MKTTIME" : "FAIRE"}`;

  // One Fishbowl session for the whole batch (small license seat count).
  const decided = await withFishbowl(async (query) => {
    const out: Array<{ o: OrderRow; soNum: string | null; reason: string; shipBy: string | null }> = [];
    for (const o of candidates) {
      const bareRef = alnum(String(o.external_ref ?? ""));
      const total = Number(o.total ?? NaN);
      // Two keys, because Fishbowl POs come from two places: OUR pushes write
      // `<ref>-MKTTIME` / `<ref>-FAIRE`, and a human keying by hand types the
      // marketplace's own PO. Looking for the ref alone missed every hand-keyed
      // order — St. Joseph's SO 24280 sat under `CF4CFH49XR` for two months.
      const poNeedle = safePoNeedle(o.external_po);
      const needles = [bareRef, ...(poNeedle && poNeedle !== bareRef ? [poNeedle] : [])];
      const rows = await query(
        `SELECT num, customerPO, totalPrice, dateFirstShip, statusId FROM so
          WHERE ${needles.map((n) => `customerPO LIKE '%${n}%'`).join(" OR ")}
          ORDER BY id DESC LIMIT 5`,
      );

      // A LIKE can land inside a longer run of digits, so confirm the needle is
      // a whole token; and never stamp against a voided/cancelled SO.
      const viable = rows.filter(
        (r) =>
          !isDead(r.statusId) &&
          needles.some((n) => containsAsToken(String(r.customerPO ?? ""), n)),
      );
      if (viable.length === 0) {
        const near = rows.length > 0 ? " (only loose or voided matches)" : "";
        out.push({
          o,
          soNum: null,
          reason: `no Fishbowl SO carrying ${needles.join(" or ")} in customerPO${near}`,
          shipBy: null,
        });
        continue;
      }

      const totalHit = Number.isFinite(total)
        ? viable.find((r) => Math.abs(Number(r.totalPrice ?? NaN) - total) < TOTAL_TOLERANCE)
        : undefined;
      // What makes a match trustworthy, in descending order of certainty:
      //   1. the totals agree — nothing more to argue about;
      //   2. we matched the marketplace's own PO, which is as distinctive as a
      //      Faire code and not a digit run;
      //   3. Faire, where the 10-char ref alone has always been definitive;
      //   4. the SO has SHIPPED, so Fishbowl has added shipping to its total and
      //      a difference is expected rather than suspicious. This is the case
      //      the old blanket "MarketTime needs an exact total" rejected — it
      //      assumed these orders were new and unshipped, which is untrue for
      //      anything keyed by hand before we ever imported it.
      const poHit = poNeedle
        ? viable.find((r) => containsAsToken(String(r.customerPO ?? ""), poNeedle))
        : undefined;
      const shippedHit = viable.find((r) => isShipped(r.statusId));
      const chosen =
        totalHit ?? poHit ?? (o.source === "faire" ? viable[0] : undefined) ?? shippedHit;

      if (!chosen) {
        const fb = viable[0];
        out.push({
          o,
          soNum: null,
          reason: `ref in SO ${String(fb.num ?? "?").trim()} but its total $${Number(fb.totalPrice ?? 0).toFixed(2)} ≠ our $${total.toFixed(2)}, and it hasn't shipped — not enough to be sure`,
          shipBy: null,
        });
        continue;
      }

      const fbTotal = Number(chosen.totalPrice ?? NaN);
      const differs =
        Number.isFinite(fbTotal) && Number.isFinite(total) && Math.abs(fbTotal - total) >= TOTAL_TOLERANCE;
      const how = totalHit
        ? "total confirms"
        : poHit === chosen
          ? `PO ${poNeedle} confirms`
          : differs
            ? `shipped/fulfilled — FB $${fbTotal.toFixed(2)} incl. shipping`
            : "ref match";
      out.push({
        o,
        soNum: String(chosen.num ?? "").trim() || "?",
        reason: `match (${how})`,
        shipBy: parseDateOnly(chosen.dateFirstShip),
      });
    }
    return out;
  });

  const stamped: ReconcileResult["stamped"] = [];
  const skipped: ReconcileResult["skipped"] = [];

  for (const d of decided) {
    const ref = refOf(d.o);
    if (!d.soNum) {
      skipped.push({ ref, reason: d.reason });
      continue;
    }
    const total = Number(d.o.total ?? 0);

    const patch: Record<string, unknown> = {};
    if (!d.o.fishbowl_entered_at) {
      patch.fishbowl_entered_at = new Date().toISOString();
      patch.fishbowl_entered_by = `Reconciled from Fishbowl SO ${d.soNum}`;
    }
    if (hasDateCol && !d.o.scheduled_ship_date && d.shipBy) {
      patch.scheduled_ship_date = d.shipBy;
    }
    if (Object.keys(patch).length === 0) continue; // already had everything

    if (dry) {
      stamped.push({ ref, soNum: d.soNum, total, kind: d.reason, shipBy: d.shipBy });
      continue;
    }
    const { error: upErr } = await admin.from("orders").update(patch).eq("id", d.o.id);
    if (upErr) skipped.push({ ref, reason: `stamp failed: ${upErr.message}` });
    else stamped.push({ ref, soNum: d.soNum, total, kind: d.reason, shipBy: d.shipBy });
  }

  return { checked: candidates.length, stamped, skipped, dry };
}
