import { supabaseServer } from "@/lib/supabaseServer";
import { faireConfigured, listFaireOrdersRaw } from "@/lib/faire";
import { groupPayouts, payoutOrderFromFaire, type FairePayout, type FairePayoutOrder } from "@/lib/fairePayouts";
import { jeNumber } from "@/lib/faireJournal";

/**
 * Accounting → Faire Payouts: payouts rebuilt from paid Faire orders (see
 * lib/fairePayouts.ts for the math), plus the "Entered in QBO" ticks.
 *
 * Walking the Faire API takes ~90s (it pages 50 orders at a time by
 * updated_at and pulls every touched order back to 2019), so the hourly cron
 * /api/cron/faire-payouts-sync copies paid orders into faire_payout_orders and
 * the page reads that. Both tables: migration 20261111010000. Read-only
 * towards Faire.
 */

export const FAIRE_PAYOUTS_PATH = "/accounting/faire-payouts";

/** How far back payouts are listed (and the first sync backfills). */
const LOOKBACK_DAYS = 400;
/** Incremental syncs re-read this much before the last change seen, to be safe. */
const OVERLAP_DAYS = 2;

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const missingTable = (msg?: string) => !!msg && /faire_payout|schema cache|does not exist/i.test(msg);

/**
 * Copy paid Faire orders into faire_payout_orders. Incremental from the newest
 * Faire update already stored (minus an overlap); a full LOOKBACK_DAYS
 * backfill when the table is empty or `full` is set.
 */
export async function syncFairePayoutOrders(opts?: { full?: boolean }): Promise<{ checked: number; saved: number; since: string }> {
  if (!faireConfigured()) throw new Error("No Faire access token configured.");
  const floor = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  let since = floor;
  if (!opts?.full) {
    const { data, error } = await supabaseServer
      .from("faire_payout_orders")
      .select("faire_updated_at")
      .order("faire_updated_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) {
      if (missingTable(error.message)) throw new Error("Faire payouts aren't switched on yet — migration 20261111010000 needs a db push.");
      throw new Error(error.message);
    }
    const last = data?.[0]?.faire_updated_at as string | undefined;
    if (last) since = new Date(Math.max(floor.getTime(), new Date(last).getTime() - OVERLAP_DAYS * 86_400_000));
  }

  const raw = await listFaireOrdersRaw(since.toISOString(), 80);

  // Retailer names: Faire's API has no retailer lookup, so use the app's own
  // imported Faire orders (matched to their Fishbowl customer) first, then the
  // ship-to company on the order, then the buyer's name.
  const ids = raw.map((o) => String(o.display_id ?? "")).filter(Boolean);
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabaseServer
      .from("orders")
      .select("external_ref, business_name, fishbowl_customer")
      .eq("source", "faire")
      .in("external_ref", ids.slice(i, i + 200));
    for (const r of (data ?? []) as Row[]) {
      const name = s(r.fishbowl_customer) ?? s(r.business_name);
      if (name) names.set(String(r.external_ref), name);
    }
  }
  const nameFor = (o: Row) => {
    const a = (o.address ?? {}) as Row;
    const c = (o.customer ?? {}) as Row;
    return (
      names.get(String(o.display_id ?? "")) ??
      s(a.company_name) ??
      s(a.name) ??
      ([s(c.first_name), s(c.last_name)].filter(Boolean).join(" ") || "Faire retailer")
    );
  };

  const rows = raw.flatMap((o) => {
    const p = payoutOrderFromFaire(o, nameFor(o));
    if (!p || new Date(p.paidAt) < floor) return [];
    return [
      {
        display_id: p.displayId,
        payout_date: p.payoutDate,
        paid_at: p.paidAt,
        net: p.net,
        payout: p,
        faire_updated_at: s(o.updated_at),
        synced_at: new Date().toISOString(),
      },
    ];
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseServer.from("faire_payout_orders").upsert(rows.slice(i, i + 500), { onConflict: "display_id" });
    if (error) {
      if (missingTable(error.message)) throw new Error("Faire payouts aren't switched on yet — migration 20261111010000 needs a db push.");
      throw new Error(error.message);
    }
  }
  return { checked: raw.length, saved: rows.length, since: since.toISOString() };
}

/** Payout day → the entry it's in, for the payouts list. */
async function payoutJournalLinks(): Promise<Map<string, { id: string; number: string }>> {
  const { data, error } = await supabaseServer
    .from("faire_payouts")
    .select("payout_date, journal_entry_id, faire_journal_entries(seq)")
    .not("journal_entry_id", "is", null);
  if (error) return new Map(); // not migrated yet → no links
  return new Map(
    ((data ?? []) as Row[]).map((r) => {
      const je = (Array.isArray(r.faire_journal_entries) ? r.faire_journal_entries[0] : r.faire_journal_entries) as Row | null;
      return [String(r.payout_date), { id: String(r.journal_entry_id), number: jeNumber(Number(je?.seq ?? 0)) }];
    }),
  );
}

/** QBO ticks by payout day, with who ticked them. */
async function loadTicks(): Promise<Map<string, { at: string | null; by: string | null }>> {
  const { data, error } = await supabaseServer.from("faire_payouts").select("payout_date, qbo_entered_at, qbo_entered_by");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const userIds = [...new Set(rows.map((r) => r.qbo_entered_by).filter((u): u is string => typeof u === "string"))];
  const people = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await supabaseServer.from("profiles").select("id, first_name").in("id", userIds);
    for (const p of (profiles ?? []) as Row[]) people.set(String(p.id), String(p.first_name ?? ""));
  }
  return new Map(
    rows.map((r) => [
      String(r.payout_date),
      { at: (r.qbo_entered_at as string | null) ?? null, by: people.get(String(r.qbo_entered_by)) || null },
    ]),
  );
}

export async function listFairePayouts(): Promise<{
  /** False until migration 20261111010000 is pushed. */
  ready: boolean;
  payouts: FairePayout[];
  /** When the newest order was copied from Faire (null = never synced). */
  lastSyncedAt: string | null;
}> {
  const floor = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const orders: FairePayoutOrder[] = [];
  let lastSyncedAt: string | null = null;
  // Paged: PostgREST caps a response at 1,000 rows (and needs a stable order to page).
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseServer
      .from("faire_payout_orders")
      .select("display_id, payout, synced_at")
      .gte("payout_date", floor)
      .order("display_id")
      .range(from, from + 999);
    if (error) {
      if (missingTable(error.message)) return { ready: false, payouts: [], lastSyncedAt: null };
      throw new Error(error.message);
    }
    for (const r of (data ?? []) as Row[]) {
      orders.push(r.payout as FairePayoutOrder);
      const at = String(r.synced_at ?? "");
      if (at && (!lastSyncedAt || at > lastSyncedAt)) lastSyncedAt = at;
    }
    if ((data ?? []).length < 1000) break;
  }
  const [ticks, links] = await Promise.all([loadTicks(), payoutJournalLinks()]);
  const payouts = groupPayouts(orders).map((p) => {
    const t = ticks.get(p.date);
    return { ...p, qboEnteredAt: t?.at ?? null, qboEnteredBy: t?.by ?? null, journalEntry: links.get(p.date) ?? null };
  });
  return { ready: true, payouts, lastSyncedAt };
}

export async function getFairePayout(date: string): Promise<FairePayout | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const { data, error } = await supabaseServer
    .from("faire_payout_orders")
    .select("payout")
    .eq("payout_date", date);
  if (error) {
    if (missingTable(error.message)) return null;
    throw new Error(error.message);
  }
  const [p] = groupPayouts(((data ?? []) as Row[]).map((r) => r.payout as FairePayoutOrder));
  if (!p) return null;
  const [ticks, links] = await Promise.all([loadTicks(), payoutJournalLinks()]);
  const t = ticks.get(date);
  return { ...p, qboEnteredAt: t?.at ?? null, qboEnteredBy: t?.by ?? null, journalEntry: links.get(date) ?? null };
}

/** Tick / untick "entered in QBO" for one or more payout days. */
export async function setFairePayoutsInQbo(dates: string[], entered: boolean, userId: string): Promise<void> {
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!valid.length) throw new Error("No payout dates given.");
  const now = new Date().toISOString();
  const { error } = await supabaseServer.from("faire_payouts").upsert(
    valid.map((d) => ({
      payout_date: d,
      qbo_entered_at: entered ? now : null,
      qbo_entered_by: entered ? userId : null,
      updated_at: now,
    })),
    { onConflict: "payout_date" },
  );
  if (error) {
    if (missingTable(error.message)) throw new Error("Faire payouts aren't switched on yet — migration 20261111010000 needs a db push.");
    throw new Error(error.message);
  }
}
