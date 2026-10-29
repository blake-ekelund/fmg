/**
 * The monthly Inventory journal entry for QuickBooks Online, from Fishbowl.
 *
 * FMG books vendor bills for inventory to Inventory Asset (Blake, 2026-10-29),
 * so each month the entry moves what LEFT inventory — sold, used in
 * production, scrapped or adjusted — into Cost of Goods Sold:
 *
 *   Dr Cost of Goods Sold / Cr Inventory Asset
 *     = beginning inventory + purchases − ending inventory
 *
 * (If that comes out negative — inventory grew by more than was bought, e.g.
 * a big upward adjustment — the entry flips: Dr Inventory Asset / Cr COGS.)
 *
 * Same sources and rules as the item report (lib/fishbowlQueries.ts
 * inventoryValuationSql), so a month here equals the sum of its item detail:
 *  - beginning / ending value = Fishbowl's nightly cost snapshot
 *    (partcosthistory) on the morning of the 1st / the 1st of next month;
 *  - purchases = PO receipts at the actual PO price;
 *  - the unit roll-forward splits movements from inventorylog (location moves
 *    excluded). Read-only.
 */

import { withFishbowl } from "@/lib/fishbowl";

export const JOURNAL_START = "2026-01-01";
export const ACCOUNTS = { cogs: "Cost of Goods Sold", inventory: "Inventory Asset" } as const;

export type JournalMonth = {
  /** YYYY-MM */
  month: string;
  label: string;
  /** The month isn't over: ending = the latest snapshot so far. */
  inProgress: boolean;
  /** Snapshot dates actually used (a missed night falls back to the one before). */
  begSnapshot: string | null;
  endSnapshot: string | null;
  begValue: number;
  purchases: number;
  endValue: number;
  /** begValue + purchases − endValue. Positive = Dr COGS / Cr Inventory Asset. */
  toCogs: number;
  units: {
    beginning: number;
    purchased: number;
    produced: number;
    returned: number;
    consumed: number;
    shipped: number;
    adjusted: number;
    transferred: number;
    ending: number;
  };
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function monthsSince(start: string, today: Date): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const end = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  for (;;) {
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push(m);
    if (m >= end) break;
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

const nextMonthStart = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
};

let cache: { at: number; data: JournalMonth[] } | null = null;
const CACHE_MS = 10 * 60_000;

export async function loadInventoryJournal(opts: { fresh?: boolean } = {}): Promise<JournalMonth[]> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const today = new Date();
  const months = monthsSince(JOURNAL_START, today);
  // A few days before the start, in case the night of Jan 1 was missed.
  const from = ymd(new Date(new Date(`${JOURNAL_START}T00:00:00Z`).getTime() - 7 * 86_400_000));

  const data = await withFishbowl(async (q) => {
    const nights = await q(`
      SELECT DATE(dateCaptured) AS d, SUM(totalCost) AS v, SUM(quantity) AS qty
      FROM partcosthistory
      WHERE dateCaptured >= '${from}'
      GROUP BY DATE(dateCaptured)
      ORDER BY d`);
    const purchases = await q(`
      SELECT DATE_FORMAT(il.dateCreated, '%Y-%m') AS m, SUM(il.changeQty * pi.unitCost) AS v
      FROM inventorylog il
      JOIN receiptitem ri ON ri.id = il.recordId
      JOIN poitem pi ON pi.id = ri.poItemId
      WHERE il.typeId = 10 AND il.tableId = 1259138490 AND il.info LIKE 'PO%'
        AND il.dateCreated >= '${JOURNAL_START}'
      GROUP BY m`);
    const moves = await q(`
      SELECT DATE_FORMAT(il.dateCreated, '%Y-%m') AS m,
        SUM(CASE WHEN il.typeId = 10 AND il.tableId = 1259138490 AND il.info LIKE 'PO%' THEN il.changeQty ELSE 0 END) AS purchased,
        SUM(CASE WHEN il.typeId = 10 AND il.tableId = -355941248 THEN il.changeQty ELSE 0 END) AS produced,
        SUM(CASE WHEN il.typeId = 10 AND NOT (il.tableId = 1259138490 AND il.info LIKE 'PO%') AND il.tableId <> -355941248 THEN il.changeQty ELSE 0 END) AS returned,
        SUM(CASE WHEN il.typeId = 50 THEN il.changeQty ELSE 0 END) AS consumed,
        SUM(CASE WHEN il.typeId IN (20, 90) THEN il.changeQty ELSE 0 END) AS shipped,
        SUM(CASE WHEN il.typeId IN (15, 60, 64, 65, 67, 73, 74) THEN il.changeQty ELSE 0 END) AS adjusted,
        SUM(CASE WHEN il.typeId = 40 AND il.tableId = 1259138490 THEN il.changeQty ELSE 0 END) AS transferred
      FROM inventorylog il
      WHERE il.dateCreated >= '${JOURNAL_START}'
      GROUP BY m`);

    const nightList = nights.map((n) => ({ d: String(n.d).slice(0, 10), v: num(n.v), qty: num(n.qty) }));
    // The snapshot taken the morning of `day`, or the latest night before it.
    const nightOn = (day: string) => {
      let hit: (typeof nightList)[number] | null = null;
      for (const n of nightList) if (n.d <= day) hit = n;
      return hit;
    };
    const purchOf = new Map(purchases.map((p) => [String(p.m), num(p.v)]));
    const movesOf = new Map(moves.map((m) => [String(m.m), m]));
    const todayStr = ymd(today);

    return months.map((m) => {
      const start = `${m}-01`;
      const next = nextMonthStart(m);
      const inProgress = next > todayStr;
      const beg = nightOn(start);
      const end = nightOn(inProgress ? todayStr : next);
      const begValue = beg?.v ?? 0;
      const endValue = end?.v ?? 0;
      const purch = purchOf.get(m) ?? 0;
      const mv = movesOf.get(m) ?? {};
      const [y, mo] = m.split("-").map(Number);
      return {
        month: m,
        label: new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
        inProgress,
        begSnapshot: beg?.d ?? null,
        endSnapshot: end?.d ?? null,
        begValue: r2(begValue),
        purchases: r2(purch),
        endValue: r2(endValue),
        toCogs: r2(begValue + purch - endValue),
        units: {
          beginning: Math.round(beg?.qty ?? 0),
          purchased: Math.round(num(mv.purchased)),
          produced: Math.round(num(mv.produced)),
          returned: Math.round(num(mv.returned)),
          consumed: Math.round(num(mv.consumed)),
          shipped: Math.round(num(mv.shipped)),
          adjusted: Math.round(num(mv.adjusted)),
          transferred: Math.round(num(mv.transferred)),
          ending: Math.round(end?.qty ?? 0),
        },
      } satisfies JournalMonth;
    });
  });

  cache = { at: Date.now(), data };
  return data;
}

/** First and last day of a YYYY-MM month (inclusive), capped at today. */
export function monthRange(m: string, today = new Date()): [string, string] {
  const next = new Date(`${nextMonthStart(m)}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() - 1);
  const last = ymd(next);
  const t = ymd(today);
  return [`${m}-01`, last < t ? last : t];
}
