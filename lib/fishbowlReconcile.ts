/**
 * Reconcile marketplace orders (Faire / MarketTime) against Fishbowl to catch
 * the ones ops HAND-KEYED into Fishbowl without marking them in the app — they'd
 * otherwise sit forever as "Needs Fishbowl" on the Orders page even though the
 * SO already exists.
 *
 * Signal: Fishbowl stores the bare marketplace ref (e.g. `ZJUHGM7VPR`, not
 * `…-FAIRE`) as the SO's `customerPO`. Match gate is per source:
 *
 *  • FAIRE — ref-in-customerPO ALONE is definitive. A Faire ref is a random
 *    10-char code; a Fishbowl customerPO only contains it if it IS that order.
 *    We deliberately do NOT gate on total: Fishbowl adds a shipping amount once
 *    an order is shipped/fulfilled, so a shipped SO's total legitimately differs
 *    from our stored subtotal (Blake, 2026-08-13). Gating on total would drop
 *    exactly the already-shipped orders we're trying to reconcile.
 *
 *  • MARKETTIME — ref-in-customerPO AND equal total. MarketTime record ids are
 *    plain digits (looser as a substring), and these orders are brand-new /
 *    unshipped, so a real Fishbowl estimate's total should still equal ours.
 *    Keeping the total guard here costs nothing and blocks a digit-run collision.
 *
 * Stamps `fishbowl_entered_at` + records the SO number in `fishbowl_entered_by`.
 * That flips Status from "Needs Fishbowl" to "Needs tracking" (the tracking-sync
 * cron then takes it the rest of the way). Never un-stamps and never writes to
 * Fishbowl — read-only there, idempotent here (only touches unstamped orders).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { withFishbowl, fishbowlConfigured } from "./fishbowl";

export type ReconcileResult = {
  checked: number;
  stamped: Array<{ ref: string; soNum: string; total: number; kind: string }>;
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

export async function reconcileMarketplaceFishbowl(
  admin: SupabaseClient,
  opts: { dry?: boolean } = {},
): Promise<ReconcileResult> {
  const dry = !!opts.dry;

  if (!fishbowlConfigured()) {
    return { checked: 0, stamped: [], skipped: [], dry, note: "Fishbowl isn't configured." };
  }

  const { data, error } = await admin
    .from("orders")
    .select("id, source, external_ref, business_name, total, fishbowl_entered_at")
    .in("source", ["faire", "markettime"])
    .is("fishbowl_entered_at", null);
  if (error) {
    if (/fishbowl_entered_at|source|external_ref|schema cache/i.test(error.message)) {
      return { checked: 0, stamped: [], skipped: [], dry, note: `orders columns missing: ${error.message}` };
    }
    throw new Error(error.message);
  }

  const candidates = (data ?? []).filter((o) => alnum(String(o.external_ref ?? "")).length >= MIN_REF_LEN);
  if (candidates.length === 0) {
    return { checked: 0, stamped: [], skipped: [], dry };
  }

  const refOf = (o: (typeof candidates)[number]) =>
    `${o.external_ref}-${o.source === "markettime" ? "MKTTIME" : "FAIRE"}`;

  // One Fishbowl session for the whole batch (small license seat count).
  const decided = await withFishbowl(async (query) => {
    const out: Array<{ o: (typeof candidates)[number]; soNum: string | null; reason: string }> = [];
    for (const o of candidates) {
      const bareRef = alnum(String(o.external_ref ?? ""));
      const total = Number(o.total ?? NaN);
      const requireTotal = o.source === "markettime"; // see header: total-gate MarketTime only
      const rows = await query(
        `SELECT num, customerPO, totalPrice FROM so WHERE customerPO LIKE '%${bareRef}%' ORDER BY id DESC LIMIT 5`,
      );
      if (rows.length === 0) {
        out.push({ o, soNum: null, reason: "no Fishbowl SO with that ref in customerPO" });
        continue;
      }
      const totalHit =
        Number.isFinite(total) ? rows.find((r) => Math.abs(Number(r.totalPrice ?? NaN) - total) < TOTAL_TOLERANCE) : undefined;

      if (requireTotal && !totalHit) {
        const fb = rows[0];
        out.push({
          o,
          soNum: null,
          reason: `ref in SO ${String(fb.num ?? "?").trim()} but its total $${Number(fb.totalPrice ?? 0).toFixed(2)} ≠ our $${total.toFixed(2)} (MarketTime needs a total match)`,
        });
        continue;
      }
      // Faire (or MarketTime with a total hit): ref match is definitive. Prefer
      // the exact-total SO when there is one, else the most recent ref match.
      const chosen = totalHit ?? rows[0];
      const fbTotal = Number(chosen.totalPrice ?? NaN);
      const shipped = Number.isFinite(fbTotal) && Number.isFinite(total) && Math.abs(fbTotal - total) >= TOTAL_TOLERANCE;
      out.push({
        o,
        soNum: String(chosen.num ?? "").trim() || "?",
        reason: shipped ? `match (shipped/fulfilled — FB $${fbTotal.toFixed(2)} incl. shipping)` : "match (total confirms)",
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
    if (dry) {
      stamped.push({ ref, soNum: d.soNum, total, kind: d.reason });
      continue;
    }
    const now = new Date().toISOString();
    const { error: upErr } = await admin
      .from("orders")
      .update({
        fishbowl_entered_at: now,
        fishbowl_entered_by: `Reconciled from Fishbowl SO ${d.soNum}`,
      })
      .eq("id", d.o.id);
    if (upErr) skipped.push({ ref, reason: `stamp failed: ${upErr.message}` });
    else stamped.push({ ref, soNum: d.soNum, total, kind: d.reason });
  }

  return { checked: candidates.length, stamped, skipped, dry };
}
