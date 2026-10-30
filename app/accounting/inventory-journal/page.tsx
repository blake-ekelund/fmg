"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown, Copy, Check, Download, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { JournalMonth } from "@/lib/inventoryJournal";

/* One journal entry a month for QuickBooks Online. FMG books inventory bills
   to Inventory Asset, so each month moves what LEFT inventory — sold, used in
   production, scrapped or adjusted — into Cost of Goods Sold:
     beginning inventory + purchases − ending inventory.
   Everything comes from Fishbowl (lib/inventoryJournal.ts). */

type Accounts = { cogs: string; inventory: string };
type Item = Record<string, unknown>;

const money = (n: number) => {
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${s})` : s;
};
const dollars = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const units = (n: number) => n.toLocaleString("en-US");
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Last day of the month, or today for the month in progress (MM/DD/YYYY). */
function entryDate(m: JournalMonth): string {
  const [y, mo] = m.month.split("-").map(Number);
  const d = m.inProgress && m.endSnapshot ? new Date(`${m.endSnapshot}T00:00:00Z`) : new Date(Date.UTC(y, mo, 0));
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** The entry's two lines. A negative month flips sides. */
function lines(m: JournalMonth, a: Accounts) {
  const amt = Math.abs(m.toCogs);
  return m.toCogs >= 0
    ? [
        { account: a.cogs, debit: amt, credit: 0 },
        { account: a.inventory, debit: 0, credit: amt },
      ]
    : [
        { account: a.inventory, debit: amt, credit: 0 },
        { account: a.cogs, debit: 0, credit: amt },
      ];
}

const memo = (m: JournalMonth) =>
  `Inventory relief — ${m.label}${m.inProgress ? " (so far)" : ""}: beginning ${dollars(m.begValue)} + purchases ${dollars(m.purchases)} + added in production ${dollars(m.productionAdded)} − ending ${dollars(m.endValue)}`;

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function download(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** QuickBooks Online's journal-entry import layout (Settings → Import data → Journal entries). */
function qboRows(months: JournalMonth[], a: Accounts): unknown[][] {
  const out: unknown[][] = [["Journal No", "Journal Date", "Account Name", "Debits", "Credits", "Description"]];
  for (const m of months) {
    if (m.toCogs === 0) continue;
    for (const l of lines(m, a)) {
      out.push([`INV-${m.month}`, entryDate(m), l.account, l.debit ? l.debit.toFixed(2) : "", l.credit ? l.credit.toFixed(2) : "", memo(m)]);
    }
  }
  return out;
}

export default function InventoryJournalPage() {
  const [months, setMonths] = useState<JournalMonth[] | null>(null);
  const [accounts, setAccounts] = useState<Accounts>({ cogs: "Cost of Goods Sold", inventory: "Inventory Asset" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, { loading: boolean; items?: Item[]; error?: string }>>({});

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounting/inventory-journal${fresh ? "?fresh=1" : ""}`, { headers: await authHeader(), cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Couldn't load (${res.status})`);
      setMonths(json.months);
      if (json.accounts) setAccounts(json.accounts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadDetail(month: string) {
    setDetails((d) => ({ ...d, [month]: { loading: true } }));
    try {
      const res = await fetch(`/api/accounting/inventory-journal?month=${month}`, { headers: await authHeader(), cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Couldn't load (${res.status})`);
      const items = (json.items as Item[]).sort((x, y) => Math.abs(num(y.other_value_out)) - Math.abs(num(x.other_value_out)));
      setDetails((d) => ({ ...d, [month]: { loading: false, items } }));
    } catch (e) {
      setDetails((d) => ({ ...d, [month]: { loading: false, error: e instanceof Error ? e.message : String(e) } }));
    }
  }

  async function copyEntry(m: JournalMonth) {
    const text = [
      `Journal entry ${entryDate(m)} — ${memo(m)}`,
      ...lines(m, accounts).map((l) => `${l.account}\t${l.debit ? l.debit.toFixed(2) : ""}\t${l.credit ? l.credit.toFixed(2) : ""}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(m.month);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  const totals = useMemo(() => {
    if (!months?.length) return null;
    return {
      toCogs: months.reduce((s, m) => s + m.toCogs, 0),
      purchases: months.reduce((s, m) => s + m.purchases, 0),
      added: months.reduce((s, m) => s + m.productionAdded, 0),
      begin: months[0].begValue,
      now: months[months.length - 1].endValue,
    };
  }, [months]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8">
      <PageMeta
        title="Inventory Journal"
        description="The monthly Inventory journal entry for QuickBooks Online, from Fishbowl: what was sold, used or adjusted moves from Inventory Asset to Cost of Goods Sold."
      />

      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-gray-900">Inventory journal entry</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            One entry a month for QuickBooks Online. Inventory bills already go to <b>{accounts.inventory}</b>, so this moves what left
            inventory — sold, used in production, scrapped or adjusted — to <b>{accounts.cogs}</b>:{" "}
            <span className="whitespace-nowrap">beginning + purchases + added in production − ending</span>. From Fishbowl, since January 1, 2026.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {months && (
            <button
              onClick={() => download("qbo_inventory_journal_entries.csv", qboRows(months.filter((m) => !m.inProgress), accounts))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              title="Every finished month, in QuickBooks Online's journal entry import format"
            >
              <Download size={15} /> All months for QBO import
            </button>
          )}
          <button
            onClick={() => void load(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={15} className={clsx(loading && "animate-spin")} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {totals && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Inventory Jan 1" value={dollars(totals.begin)} />
          <Stat label="Purchases + production since" value={dollars(totals.purchases + totals.added)} />
          <Stat label="Inventory now" value={dollars(totals.now)} />
          <Stat label="To COGS since Jan 1" value={dollars(totals.toCogs)} />
        </div>
      )}

      {loading && !months ? (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          <Loader2 size={15} className="animate-spin" /> Reading Fishbowl…
        </div>
      ) : months ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3 font-medium">Month</th>
                <th className="px-4 py-3 text-right font-medium">Beginning</th>
                <th className="px-4 py-3 text-right font-medium">+ Purchases</th>
                <th className="px-4 py-3 text-right font-medium" title="Finished goods made minus the parts they used — mainly Kapra fill &amp; filling">+ Added in production</th>
                <th className="px-4 py-3 text-right font-medium">− Ending</th>
                <th className="px-4 py-3 text-right font-medium">= To COGS</th>
                <th className="px-4 py-3 font-medium">Entry</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const isOpen = open === m.month;
                const ls = lines(m, accounts);
                const det = details[m.month];
                return (
                  <Fragment key={m.month}>
                    <tr
                      onClick={() => setOpen(isOpen ? null : m.month)}
                      className={clsx("cursor-pointer border-b border-gray-100 hover:bg-gray-50", isOpen && "bg-gray-50")}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{m.label}</div>
                        {m.inProgress && <div className="text-xs text-amber-700">So far — not final until the month ends</div>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(m.begValue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(m.purchases)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(m.productionAdded)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(m.endValue)}</td>
                      <td className={clsx("px-4 py-3 text-right font-semibold tabular-nums", m.toCogs < 0 ? "text-amber-700" : "text-gray-900")}>
                        {money(m.toCogs)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {m.toCogs >= 0 ? `Dr ${accounts.cogs} / Cr ${accounts.inventory}` : `Dr ${accounts.inventory} / Cr ${accounts.cogs}`}
                      </td>
                      <td className="px-2">
                        <ChevronDown size={16} className={clsx("text-gray-400 transition-transform", isOpen && "rotate-180")} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-gray-200 bg-gray-50/60">
                        <td colSpan={8} className="px-4 py-5">
                          <div className="grid gap-5 lg:grid-cols-2">
                            {/* The entry */}
                            <div className="rounded-xl border border-gray-200 bg-white">
                              <div className="border-b border-gray-100 px-4 py-3">
                                <div className="text-xs font-medium uppercase tracking-wider text-gray-400">Journal entry · {entryDate(m)}</div>
                                <div className="mt-1 text-sm text-gray-600">{memo(m)}</div>
                              </div>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400">
                                    <th className="px-4 py-2 font-medium">Account</th>
                                    <th className="px-4 py-2 text-right font-medium">Debit</th>
                                    <th className="px-4 py-2 text-right font-medium">Credit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ls.map((l) => (
                                    <tr key={l.account} className="border-t border-gray-100">
                                      <td className="px-4 py-2 font-medium text-gray-900">{l.account}</td>
                                      <td className="px-4 py-2 text-right tabular-nums">{l.debit ? money(l.debit) : ""}</td>
                                      <td className="px-4 py-2 text-right tabular-nums">{l.credit ? money(l.credit) : ""}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {m.toCogs < 0 && (
                                <p className="border-t border-gray-100 px-4 py-2 text-xs text-amber-800">
                                  Inventory grew by more than came in this month — usually an upward count adjustment — so the entry
                                  runs the other way.
                                </p>
                              )}
                              <div className="flex flex-wrap gap-2 border-t border-gray-100 px-4 py-3">
                                <button
                                  onClick={() => void copyEntry(m)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  {copied === m.month ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                                  {copied === m.month ? "Copied" : "Copy entry"}
                                </button>
                                <button
                                  onClick={() => download(`qbo_inventory_je_${m.month}.csv`, qboRows([m], accounts))}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                  title="QuickBooks Online journal entry import file"
                                >
                                  <Download size={14} /> QBO import file
                                </button>
                              </div>
                            </div>

                            {/* How it adds up */}
                            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
                              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">How it adds up</div>
                              <Row label={`Inventory on ${m.begSnapshot ?? "—"}`} value={dollars(m.begValue)} sub={`${units(m.units.beginning)} units`} />
                              <Row label="+ Purchases (PO receipts at PO price)" value={dollars(m.purchases)} sub={`${units(m.units.purchased)} units`} />
                              <Row
                                label="+ Added in production (Kapra fill & filling)"
                                value={dollars(m.productionAdded)}
                                sub={`made ${dollars(m.madeValue)} − parts ${dollars(m.usedValue)}`}
                              />
                              <Row label={`− Inventory on ${m.endSnapshot ?? "—"}${m.inProgress ? " (latest)" : ""}`} value={dollars(m.endValue)} sub={`${units(m.units.ending)} units`} />
                              <Row label="= To Cost of Goods Sold" value={dollars(m.toCogs)} strong />
                              <div className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
                                Units in the month: made {units(m.units.produced)} · used in production {units(-m.units.consumed)} · shipped{" "}
                                {units(-m.units.shipped)} · adjusted {units(m.units.adjusted)} · returns {units(m.units.returned)}
                              </div>
                            </div>
                          </div>

                          {/* Item detail */}
                          <div className="mt-5">
                            {!det ? (
                              <button
                                onClick={() => void loadDetail(m.month)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Show item detail <span className="text-gray-400">(about 40 seconds)</span>
                              </button>
                            ) : det.loading ? (
                              <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Loader2 size={14} className="animate-spin" /> Pulling every item from Fishbowl — about 40 seconds…
                              </div>
                            ) : det.error ? (
                              <div className="text-sm text-red-700">{det.error}</div>
                            ) : (
                              <ItemDetail month={m} items={det.items ?? []} />
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-xs text-gray-500">
        Values are Fishbowl&rsquo;s average cost, from its nightly snapshot of every item (all locations). Purchases are what was received
        on POs, at the PO price — if a bill differs from its PO (freight, price changes), that difference stays in Inventory Asset until
        adjusted. Added in production is what Fishbowl&rsquo;s work orders valued finished goods at, minus the parts they used — mostly Kapra fill &amp; filling, which is billed to Inventory Asset but never received as a part. If Fishbowl is also sending shipment COGS to QuickBooks Online, don&rsquo;t book this too — it would count COGS twice.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">{value}</div>
    </div>
  );
}

function Row({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={clsx("flex items-baseline gap-3 py-1", strong && "mt-1 border-t border-gray-200 pt-2")}>
      <span className={clsx("flex-1", strong ? "font-semibold text-gray-900" : "text-gray-600")}>{label}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
      <span className={clsx("w-32 text-right tabular-nums", strong ? "font-semibold text-gray-900" : "text-gray-800")}>{value}</span>
    </div>
  );
}

function ItemDetail({ month, items }: { month: JournalMonth; items: Item[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? items : items.slice(0, 25);
  const sum = items.reduce((s, i) => s + num(i.other_value_out), 0);
  const cols: [string, string][] = [
    ["part", "Part"],
    ["description", "Description"],
    ["beg_value", "Beginning $"],
    ["purchased_value", "Purchases $"],
    ["production_added", "Added in production $"],
    ["end_value", "Ending $"],
    ["other_value_out", "To COGS $"],
    ["beg_qty", "Beg units"],
    ["purchased_qty", "Bought"],
    ["produced_qty", "Made"],
    ["consumed_qty", "Used"],
    ["shipped_qty", "Shipped"],
    ["adjusted_qty", "Adjusted"],
    ["end_qty", "End units"],
  ];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm font-medium text-gray-900">
          {items.length} items · to COGS {dollars(sum)}
          <span className="ml-2 font-normal text-gray-500">(matches the entry, give or take rounding)</span>
        </div>
        <button
          onClick={() =>
            download(`inventory_detail_${month.month}.csv`, [
              cols.map(([, h]) => h).concat("Check units"),
              ...items.map((i) => cols.map(([k]) => i[k]).concat(i.check_qty)),
            ])
          }
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download size={14} /> Download item detail
        </button>
      </div>
      <div className="max-h-[520px] overflow-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 text-left text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              {cols.map(([k, h]) => (
                <th key={k} className={clsx("whitespace-nowrap px-3 py-2 font-medium", k !== "part" && k !== "description" && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((i) => (
              <tr key={String(i.part)}>
                {cols.map(([k]) => (
                  <td
                    key={k}
                    className={clsx(
                      "whitespace-nowrap px-3 py-1.5",
                      k === "description" ? "max-w-[260px] truncate text-gray-600" : k === "part" ? "font-mono text-gray-800" : "text-right tabular-nums text-gray-700",
                      k === "other_value_out" && "font-medium text-gray-900",
                    )}
                    title={k === "description" ? String(i[k] ?? "") : undefined}
                  >
                    {k.endsWith("_value") || k === "other_value_out" ? money(num(i[k])) : k.endsWith("_qty") ? units(Math.round(num(i[k]))) : String(i[k] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > 25 && (
        <button onClick={() => setShowAll((s) => !s)} className="text-sm font-medium text-gray-600 hover:text-gray-900">
          {showAll ? "Show the top 25" : `Show all ${items.length} items`}
        </button>
      )}
    </div>
  );
}
