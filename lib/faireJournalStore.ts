import { supabaseServer } from "@/lib/supabaseServer";
import { buildJournalEntry, type FaireJournalEntry, type JeLine } from "@/lib/faireJournal";
import { getFairePayout } from "@/lib/fairePayoutsStore";
import type { FaireJeColumn, FairePayout } from "@/lib/fairePayouts";

/**
 * Saved Faire journal entries (faire_journal_entries, migration
 * 20261111020000). Creating one snapshots the selected payouts and links each
 * payout to it, so a payout can't land in two entries.
 */

type Row = Record<string, unknown>;
const missing = (msg?: string) => !!msg && /faire_journal|journal_entry_id|schema cache|does not exist/i.test(msg);
const NOT_READY = "Faire journal entries aren't switched on yet — migration 20261111020000 needs a db push.";

import { jeNumber } from "@/lib/faireJournal";
export { jeNumber };

async function firstNames(ids: unknown[]): Promise<Map<string, string>> {
  const uuids = [...new Set(ids.filter((u): u is string => typeof u === "string"))];
  const out = new Map<string, string>();
  if (!uuids.length) return out;
  const { data } = await supabaseServer.from("profiles").select("id, first_name").in("id", uuids);
  for (const p of (data ?? []) as Row[]) out.set(String(p.id), String(p.first_name ?? ""));
  return out;
}

function fromRow(r: Row, people: Map<string, string>, withPayouts: boolean): FaireJournalEntry {
  return {
    id: String(r.id),
    number: jeNumber(Number(r.seq)),
    date: String(r.entry_date),
    memo: String(r.memo ?? ""),
    createdAt: String(r.created_at ?? ""),
    createdBy: people.get(String(r.created_by)) || null,
    qboEnteredAt: (r.qbo_entered_at as string | null) ?? null,
    qboEnteredBy: people.get(String(r.qbo_entered_by)) || null,
    payoutDates: ((r.payout_dates as string[] | null) ?? []).map(String),
    columns: r.columns as Record<FaireJeColumn, number>,
    net: Number(r.net ?? 0),
    lines: (r.lines as JeLine[]) ?? [],
    payouts: withPayouts ? ((r.payouts as FairePayout[]) ?? []) : [],
  };
}

/** Every entry, newest first (without the payout snapshots — the list doesn't need them). */
export async function listFaireJournalEntries(): Promise<{ ready: boolean; entries: FaireJournalEntry[] }> {
  const { data, error } = await supabaseServer
    .from("faire_journal_entries")
    .select("id, seq, entry_date, memo, payout_dates, columns, net, lines, created_by, created_at, qbo_entered_at, qbo_entered_by")
    .order("seq", { ascending: false });
  if (error) {
    if (missing(error.message)) return { ready: false, entries: [] };
    throw new Error(error.message);
  }
  const rows = (data ?? []) as Row[];
  const people = await firstNames(rows.flatMap((r) => [r.created_by, r.qbo_entered_by]));
  return { ready: true, entries: rows.map((r) => fromRow(r, people, false)) };
}

export async function getFaireJournalEntry(id: string): Promise<FaireJournalEntry | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabaseServer.from("faire_journal_entries").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (missing(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  const people = await firstNames([data.created_by, data.qbo_entered_by]);
  return fromRow(data as Row, people, true);
}

/** One entry for the selected payouts; refuses payouts already in an entry. */
export async function createFaireJournalEntry(dates: string[], userId: string): Promise<FaireJournalEntry> {
  const wanted = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  if (!wanted.length) throw new Error("Select at least one payout.");

  const { data: linked, error: linkErr } = await supabaseServer
    .from("faire_payouts")
    .select("payout_date, journal_entry_id")
    .in("payout_date", wanted)
    .not("journal_entry_id", "is", null);
  if (linkErr) throw new Error(missing(linkErr.message) ? NOT_READY : linkErr.message);
  if (linked?.length) {
    throw new Error(`Already in a journal entry: ${linked.map((r) => r.payout_date).join(", ")}. Deselect them or delete that entry first.`);
  }

  const payouts: FairePayout[] = [];
  for (const d of wanted) {
    const p = await getFairePayout(d);
    if (!p) throw new Error(`No Faire payout on ${d}.`);
    payouts.push(p);
  }
  const je = buildJournalEntry(payouts);

  const { data, error } = await supabaseServer
    .from("faire_journal_entries")
    .insert({
      entry_date: je.date,
      memo: je.memo,
      payout_dates: je.payoutDates,
      columns: je.columns,
      net: je.net,
      lines: je.lines,
      payouts,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(missing(error?.message) ? NOT_READY : (error?.message ?? "Couldn't save the entry."));

  const { error: upErr } = await supabaseServer.from("faire_payouts").upsert(
    wanted.map((d) => ({ payout_date: d, journal_entry_id: data.id, updated_at: new Date().toISOString() })),
    { onConflict: "payout_date" },
  );
  if (upErr) {
    await supabaseServer.from("faire_journal_entries").delete().eq("id", data.id);
    throw new Error(upErr.message);
  }
  const people = await firstNames([userId]);
  return fromRow(data as Row, people, true);
}

/** Tick / untick "Entered in QBO" on an entry — and on every payout it covers. */
export async function setFaireJournalEntryInQbo(id: string, entered: boolean, userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseServer
    .from("faire_journal_entries")
    .update({ qbo_entered_at: entered ? now : null, qbo_entered_by: entered ? userId : null })
    .eq("id", id)
    .select("payout_dates")
    .maybeSingle();
  if (error) throw new Error(missing(error.message) ? NOT_READY : error.message);
  if (!data) throw new Error("No such journal entry.");
  const dates = ((data.payout_dates as string[] | null) ?? []).map(String);
  if (dates.length) {
    const { error: pErr } = await supabaseServer.from("faire_payouts").upsert(
      dates.map((d) => ({
        payout_date: d,
        journal_entry_id: id,
        qbo_entered_at: entered ? now : null,
        qbo_entered_by: entered ? userId : null,
        updated_at: now,
      })),
      { onConflict: "payout_date" },
    );
    if (pErr) throw new Error(pErr.message);
  }
}

/** Delete an entry; its payouts become free to go in another one (their QBO ticks stay). */
export async function deleteFaireJournalEntry(id: string): Promise<void> {
  await supabaseServer.from("faire_payouts").update({ journal_entry_id: null }).eq("journal_entry_id", id);
  const { error } = await supabaseServer.from("faire_journal_entries").delete().eq("id", id);
  if (error) throw new Error(missing(error.message) ? NOT_READY : error.message);
}
