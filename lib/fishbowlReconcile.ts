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
};

export async function reconcileMarketplaceFishbowl(
  admin: SupabaseClient,
  opts: { dry?: boolean } = {},
): Promise<ReconcileResult> {
  const dry = !!opts.dry;

  if (!fishbowlConfigured()) {
    return { checked: 0, stamped: [], skipped: [], dry, note: "Fishbowl isn't configured." };
  }

  // scheduled_ship_date is a fresh column (migration 20260813000000). Read it
  // when present; degrade to entered-stamp-only until the migration is pushed.
  const baseCols = "id, source, external_ref, business_name, total, fishbowl_entered_at";
  let hasDateCol = true;
  let rowsData: OrderRow[] = [];
  const withDate = await admin
    .from("orders")
    .select(`${baseCols}, scheduled_ship_date`)
    .in("source", ["faire", "markettime"]);
  if (withDate.error) {
    if (/scheduled_ship_date/i.test(withDate.error.message)) {
      hasDateCol = false;
      const plain = await admin.from("orders").select(baseCols).in("source", ["faire", "markettime"]);
      if (plain.error) {
        if (/source|external_ref|fishbowl_entered_at|schema cache/i.test(plain.error.message)) {
          return { checked: 0, stamped: [], skipped: [], dry, note: `orders columns missing: ${plain.error.message}` };
        }
        throw new Error(plain.error.message);
      }
      rowsData = (plain.data ?? []) as OrderRow[];
    } else if (/source|external_ref|fishbowl_entered_at|schema cache/i.test(withDate.error.message)) {
      return { checked: 0, stamped: [], skipped: [], dry, note: `orders columns missing: ${withDate.error.message}` };
    } else {
      throw new Error(withDate.error.message);
    }
  } else {
    rowsData = (withDate.data ?? []) as OrderRow[];
  }

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
      const requireTotal = o.source === "markettime"; // see header: total-gate MarketTime only
      const rows = await query(
        `SELECT num, customerPO, totalPrice, dateFirstShip FROM so WHERE customerPO LIKE '%${bareRef}%' ORDER BY id DESC LIMIT 5`,
      );
      if (rows.length === 0) {
        out.push({ o, soNum: null, reason: "no Fishbowl SO with that ref in customerPO", shipBy: null });
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
          shipBy: null,
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
