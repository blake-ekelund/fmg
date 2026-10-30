"use client";

import Link from "next/link";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileUp, Loader2, Plus, RefreshCw, Search, Trash2, AlertTriangle, Sparkles } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useUser } from "@/components/UserContext";
import {
  BUSINESS_UNITS,
  STATUSES,
  STATUS_LABEL,
  draftProposedChart,
  parseAccountListing,
  proposedFullName,
  qboImportRows,
  type CoaStatus,
  type CurrentAccount,
  type ProposedAccount,
} from "@/lib/coa";

/* Chart of accounts workspace for the QuickBooks Desktop → Online move: the
   current QBD chart (imported from QuickBooks' Account Listing export), the
   proposed clean QBO chart (edited here by Julie and Blake), and how every
   current account maps to the new one. Downloads for each. */

type Current = CurrentAccount & { id?: string };
type Proposed = ProposedAccount & { id?: string; updatedBy?: string | null };
type Tab = "proposed" | "current" | "changes";

const QBO_TYPES = [
  "Bank",
  "Accounts receivable (A/R)",
  "Other Current Assets",
  "Fixed Assets",
  "Other Assets",
  "Accounts payable (A/P)",
  "Credit Card",
  "Other Current Liabilities",
  "Long Term Liabilities",
  "Equity",
  "Income",
  "Cost of Goods Sold",
  "Expenses",
  "Other Income",
  "Other Expense",
];

const STATUS_STYLE: Record<CoaStatus, string> = {
  keep: "bg-gray-100 text-gray-700",
  rename: "bg-blue-50 text-blue-700",
  merge: "bg-amber-50 text-amber-800",
  new: "bg-teal-50 text-teal-800",
  retire: "bg-red-50 text-red-700",
};

const money = (n: number | null) =>
  n === null ? "" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api<T>(method: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/accounting/coa", {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const currentRows = (c: Current[]) => [
  ["Number", "Account", "Full name", "Type", "Balance", "Fishbowl default", "Description"],
  ...c.map((a) => [a.number ?? "", a.name, a.fullName, a.type, a.balance ?? "", a.fishbowlDefault ? "Yes" : "", a.description ?? ""]),
];
const proposedRows = (p: Proposed[]) => [
  ["Number", "Account", "Full name", "QBO type", "Detail type", "Business unit", "Status", "Maps from (current)", "Notes"],
  ...p.map((a) => [
    a.number ?? "",
    a.name,
    proposedFullName(a),
    a.type,
    a.detailType ?? "",
    a.businessUnit ?? "",
    STATUS_LABEL[a.status],
    a.mapsFrom.join("; "),
    a.notes ?? "",
  ]),
];

/** For each current account: where it goes in the new chart. */
function changeRows(current: Current[], proposed: Proposed[]) {
  return current.map((c) => {
    const own = proposed.find((p) => p.mapsFrom.includes(c.fullName) && (p.status === "merge" || p.status === "retire"));
    const target = proposed.find((p) => p.mapsFrom.includes(c.fullName) && p.status !== "merge" && p.status !== "retire");
    const status: CoaStatus = own?.status ?? target?.status ?? "keep";
    return { c, status, target, note: own?.notes ?? target?.notes ?? null };
  });
}

export default function ChartOfAccountsPage() {
  const { profile } = useUser();
  const canEdit = profile?.access === "owner" || profile?.access === "admin";
  const [ready, setReady] = useState(true);
  const [current, setCurrent] = useState<Current[]>([]);
  const [proposed, setProposed] = useState<Proposed[]>([]);
  const [importedFrom, setImportedFrom] = useState<{ file: string | null; at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("proposed");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<CoaStatus | "all" | "active">("active");
  const [confirmRedo, setConfirmRedo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = !ready && current.length > 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api<{ ready: boolean; current: Current[]; proposed: Proposed[]; importedFrom: { file: string | null; at: string } | null }>("GET");
      setReady(d.ready);
      if (d.ready) {
        setCurrent(d.current);
        setProposed(d.proposed);
        setImportedFrom(d.importedFrom);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  /* ─── Import ─── */
  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as unknown[][];
      const accounts = parseAccountListing(rows);
      if (!ready) {
        // No table yet: preview in the browser only.
        setCurrent(accounts);
        setProposed(draftProposedChart(accounts));
        setImportedFrom({ file: file.name, at: new Date().toISOString() });
        setNotice(`Read ${accounts.length} accounts — preview only until the database migration is applied.`);
        return;
      }
      await api("POST", { action: "import", accounts, fileName: file.name });
      if (proposed.length === 0) await api("POST", { action: "draft" });
      setNotice(`Imported ${accounts.length} accounts from ${file.name}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function redoDraft() {
    setBusy(true);
    setError(null);
    try {
      await api("POST", { action: "draft", replace: true });
      setConfirmRedo(false);
      setNotice("Started the proposed chart over from the current one.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /* ─── Edits (optimistic) ─── */
  async function save(row: Proposed, fields: Partial<Proposed>) {
    setProposed((list) => list.map((p) => (p === row || (p.id && p.id === row.id) ? { ...p, ...fields } : p)));
    if (!ready || !row.id) return;
    try {
      await api("PATCH", { id: row.id, ...fields });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function addAccount() {
    const blank: Proposed = {
      number: null,
      name: "New account",
      parent: null,
      type: "Expenses",
      detailType: null,
      businessUnit: null,
      status: "new",
      mapsFrom: [],
      description: null,
      notes: null,
      fishbowlDefault: false,
      sort: (proposed[proposed.length - 1]?.sort ?? 0) + 1,
    };
    if (!ready) {
      setProposed((l) => [...l, blank]);
      return;
    }
    try {
      const { account } = await api<{ account: Proposed }>("POST", { action: "add", account: blank });
      setProposed((l) => [...l, account]);
      setStatusFilter("active");
      setQ("");
      setTab("proposed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(row: Proposed) {
    setProposed((l) => l.filter((p) => p !== row));
    if (!ready || !row.id) return;
    try {
      await api("DELETE", { id: row.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load();
    }
  }

  /* ─── Views ─── */
  const needle = q.trim().toLowerCase();
  const shownProposed = useMemo(
    () =>
      proposed.filter((p) => {
        if (statusFilter === "active" && (p.status === "merge" || p.status === "retire")) return false;
        if (statusFilter !== "all" && statusFilter !== "active" && p.status !== statusFilter) return false;
        return !needle || `${p.number ?? ""} ${proposedFullName(p)} ${p.notes ?? ""} ${p.mapsFrom.join(" ")}`.toLowerCase().includes(needle);
      }),
    [proposed, statusFilter, needle],
  );
  const shownCurrent = useMemo(
    () => current.filter((c) => !needle || `${c.number ?? ""} ${c.fullName} ${c.type}`.toLowerCase().includes(needle)),
    [current, needle],
  );
  const changes = useMemo(() => changeRows(current, proposed), [current, proposed]);
  const shownChanges = useMemo(
    () =>
      changes.filter(
        (r) =>
          (statusFilter === "all" || statusFilter === "active" || r.status === statusFilter) &&
          (!needle || `${r.c.number ?? ""} ${r.c.fullName} ${r.target ? proposedFullName(r.target) : ""}`.toLowerCase().includes(needle)),
      ),
    [changes, statusFilter, needle],
  );

  const counts = useMemo(() => {
    const c: Record<CoaStatus, number> = { keep: 0, rename: 0, merge: 0, new: 0, retire: 0 };
    for (const p of proposed) c[p.status]++;
    return c;
  }, [proposed]);
  const activeCount = proposed.length - counts.merge - counts.retire;

  function downloadAll() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(currentRows(current)), "Current (QBD)");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(proposedRows(proposed)), "Proposed (QBO)");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Current number", "Current account", "Change", "New number", "New account", "Note"],
        ...changes.map((r) => [r.c.number ?? "", r.c.fullName, STATUS_LABEL[r.status], r.target?.number ?? "", r.target ? proposedFullName(r.target) : "", r.note ?? ""]),
      ]),
      "Changes",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(qboImportRows(proposed)), "QBO import");
    XLSX.writeFile(wb, `fmg_chart_of_accounts_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const hasData = current.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8">
      <PageMeta
        title="Chart of Accounts"
        description="The current QuickBooks Desktop chart of accounts and the proposed clean chart for QuickBooks Online, with every change and downloads."
      />

      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-gray-900">Chart of accounts</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            The current QuickBooks Desktop chart and the proposed clean chart for QuickBooks Online, side by side. Part of the{" "}
            <Link href="/accounting/qbo-transition" className="font-medium text-teal-700 hover:underline">
              QBO Transition
            </Link>
            ; see{" "}
            <Link href="/accounting/quickbooks-connection" className="font-medium text-teal-700 hover:underline">
              QuickBooks Connection
            </Link>{" "}
            for the accounts Fishbowl posts to.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                title="QuickBooks Desktop: Reports → List → Account Listing → Excel"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
                {hasData ? "Re-import current chart" : "Import current chart"}
              </button>
            </>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={15} className={clsx(loading && "animate-spin")} /> Refresh
          </button>
        </div>
      </div>

      {/* The structure decision, in brief */}
      <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 text-sm text-gray-800">
        <div className="font-semibold text-gray-900">How business units are tracked</div>
        <p className="mt-1 max-w-4xl">
          One chart of accounts for the whole company. Business unit — <b>FMG</b> (core / shared), <b>Natural Inspirations</b>,{" "}
          <b>Sassy and Co</b> — is a tag (QBO class) on transactions, so a P&amp;L by class shows each one&rsquo;s profit. Only{" "}
          <b>Sales</b> and <b>COGS</b> get per-brand sub-accounts, because Fishbowl posts those itself (income account per product, COGS
          account per part). Splitting every expense three ways would roughly triple the chart, break QBO Plus&rsquo;s 250-account limit and
          make every bill harder to code.
        </p>
      </div>

      {!ready && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Saving needs migration <span className="font-mono">20261030000000</span> (supabase db push). Until then you can import the file to
            preview both charts and download them — changes aren&rsquo;t saved.
          </span>
        </div>
      )}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</div>}

      {loading && !hasData ? (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </div>
      ) : !hasData ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <div className="text-base font-semibold text-gray-900">No chart imported yet</div>
          <p className="mx-auto mt-1 max-w-lg text-sm text-gray-600">
            In QuickBooks Desktop: <b>Reports → List → Account Listing</b>, then <b>Excel → Create New Worksheet</b>. Import that file here
            and the page drafts a clean QBO chart from it.
          </p>
          {canEdit && (
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              <FileUp size={15} /> Import current chart
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Summary + downloads */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Stat label="Current accounts" value={current.length} />
            <Stat label="Proposed (active)" value={activeCount} />
            {(Object.keys(counts) as CoaStatus[]).map((s) => (
              <span key={s} className={clsx("rounded-lg px-2.5 py-1 text-xs font-medium", STATUS_STYLE[s])}>
                {STATUS_LABEL[s]} {counts[s]}
              </span>
            ))}
            <span className="text-xs text-gray-500">
              {importedFrom?.file ? `From ${importedFrom.file}` : ""}
              {preview ? " · preview, not saved" : ""}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <DlButton onClick={() => downloadCsv("chart_current_qbd.csv", currentRows(current))}>Current</DlButton>
              <DlButton onClick={() => downloadCsv("chart_proposed_qbo.csv", proposedRows(proposed))}>Proposed</DlButton>
              <DlButton onClick={() => downloadCsv("chart_qbo_import.csv", qboImportRows(proposed))} title="QuickBooks Online: Settings → Import data → Chart of accounts">
                QBO import file
              </DlButton>
              <button
                onClick={downloadAll}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
              >
                <Download size={13} /> Everything (.xlsx)
              </button>
            </div>
          </div>

          {/* Tabs + filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
              {(
                [
                  ["proposed", `Proposed (${activeCount})`],
                  ["current", `Current (${current.length})`],
                  ["changes", "Changes"],
                ] as [Tab, string][]
              ).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={clsx("rounded-md px-3 py-1.5 font-medium", tab === t ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900")}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative w-[240px]">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="coa-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find an account…"
                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            {tab !== "current" && (
              <select
                id="coa-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm"
              >
                <option value="active">{tab === "changes" ? "All changes" : "Active accounts"}</option>
                <option value="all">Everything</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]} only
                  </option>
                ))}
              </select>
            )}
            {tab === "proposed" && canEdit && (
              <div className="ml-auto flex items-center gap-2">
                {ready &&
                  (confirmRedo ? (
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span className="text-gray-600">Replace every proposed account with a fresh draft?</span>
                      <button onClick={() => setConfirmRedo(false)} className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100">
                        Cancel
                      </button>
                      <button onClick={() => void redoDraft()} disabled={busy} className="rounded-md bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700">
                        Start over
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmRedo(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                      title="Throw away the proposed chart and draft it again from the current one"
                    >
                      <Sparkles size={14} /> Start over from current
                    </button>
                  ))}
                <button
                  onClick={() => void addAccount()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
                >
                  <Plus size={14} /> Add account
                </button>
              </div>
            )}
          </div>

          {tab === "proposed" && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="w-[84px] px-2 py-2 font-semibold">Number</th>
                    <th className="px-2 py-2 font-semibold">Account</th>
                    <th className="px-2 py-2 font-semibold">Parent</th>
                    <th className="w-[170px] px-2 py-2 font-semibold">QBO type</th>
                    <th className="w-[160px] px-2 py-2 font-semibold">Business unit</th>
                    <th className="w-[150px] px-2 py-2 font-semibold">Change</th>
                    <th className="px-2 py-2 font-semibold">Notes / comes from</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shownProposed.map((p, i) => (
                    <tr key={p.id ?? `new-${i}`} className={clsx("align-top", (p.status === "merge" || p.status === "retire") && "bg-gray-50/70 text-gray-500")}>
                      <td className="px-2 py-1.5">
                        <Cell value={p.number ?? ""} disabled={!canEdit} mono onCommit={(v) => void save(p, { number: v || null })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Cell value={p.name} disabled={!canEdit} onCommit={(v) => void save(p, { name: v || p.name })} />
                        {p.fishbowlDefault && <div className="mt-0.5 text-[10px] font-medium text-violet-700">Fishbowl default — re-map in its wizard</div>}
                      </td>
                      <td className="px-2 py-1.5">
                        <Cell value={p.parent ?? ""} disabled={!canEdit} placeholder="Top level" onCommit={(v) => void save(p, { parent: v || null })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={p.type}
                          disabled={!canEdit}
                          onChange={(e) => void save(p, { type: e.target.value })}
                          className="w-full rounded-md border border-gray-200 bg-white px-1.5 py-1 text-sm"
                        >
                          {!QBO_TYPES.includes(p.type) && <option value={p.type}>{p.type}</option>}
                          {QBO_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={p.businessUnit ?? ""}
                          disabled={!canEdit}
                          onChange={(e) => void save(p, { businessUnit: (e.target.value || null) as Proposed["businessUnit"] })}
                          className="w-full rounded-md border border-gray-200 bg-white px-1.5 py-1 text-sm"
                        >
                          <option value="">All (tag by class)</option>
                          {BUSINESS_UNITS.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={p.status}
                          disabled={!canEdit}
                          onChange={(e) => void save(p, { status: e.target.value as CoaStatus })}
                          className={clsx("w-full rounded-md border border-gray-200 px-1.5 py-1 text-sm font-medium", STATUS_STYLE[p.status])}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Cell value={p.notes ?? ""} disabled={!canEdit} placeholder="Add a note" onCommit={(v) => void save(p, { notes: v || null })} />
                        {p.mapsFrom.length > 0 && (p.mapsFrom.length > 1 || p.mapsFrom[0] !== proposedFullName(p)) && (
                          <div className="mt-0.5 text-[11px] text-gray-500">From: {p.mapsFrom.join(", ")}</div>
                        )}
                      </td>
                      <td className="px-1 py-1.5">
                        {canEdit && p.status === "new" && (
                          <button onClick={() => void remove(p)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${p.name}`}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shownProposed.length === 0 && <div className="p-6 text-center text-sm text-gray-400">No accounts match.</div>}
            </div>
          )}

          {tab === "current" && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="w-[84px] px-3 py-2 font-semibold">Number</th>
                    <th className="px-3 py-2 font-semibold">Account</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 text-right font-semibold">Balance</th>
                    <th className="px-3 py-2 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shownCurrent.map((c, i) => {
                    const depth = c.fullName.split(":").length - 1;
                    return (
                      <tr key={c.id ?? `${c.fullName}-${i}`} className="align-top">
                        <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-gray-600">{c.number ?? ""}</td>
                        <td className="px-3 py-1.5 text-gray-900" style={{ paddingLeft: 12 + depth * 18 }}>
                          {c.name}
                          {c.fishbowlDefault && <span className="ml-2 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">Fishbowl default</span>}
                        </td>
                        <td className="px-3 py-1.5 text-gray-600">{c.type}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-800">{money(c.balance)}</td>
                        <td className="max-w-[360px] truncate px-3 py-1.5 text-gray-500" title={c.description ?? ""}>
                          {c.description ?? ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === "changes" && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="px-3 py-2 font-semibold">Current account (QBD)</th>
                    <th className="w-[150px] px-3 py-2 font-semibold">Change</th>
                    <th className="px-3 py-2 font-semibold">New account (QBO)</th>
                    <th className="px-3 py-2 font-semibold">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shownChanges.map(({ c, status, target, note }, i) => (
                    <tr key={`${c.fullName}-${i}`} className="align-top">
                      <td className="px-3 py-1.5 text-gray-900">
                        <span className="mr-2 font-mono text-xs text-gray-500">{c.number ?? ""}</span>
                        {c.fullName}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={clsx("rounded px-1.5 py-0.5 text-[11px] font-semibold", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>
                      </td>
                      <td className="px-3 py-1.5 text-gray-900">
                        {status === "retire" ? (
                          <span className="text-gray-400">—</span>
                        ) : target ? (
                          <>
                            <span className="mr-2 font-mono text-xs text-gray-500">{target.number ?? ""}</span>
                            {proposedFullName(target)}
                          </>
                        ) : (
                          <span className="text-gray-400">Not mapped</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600">{note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Pieces ──────────────────────────────────────────────────────────────── */

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600">
      {label} <b className="tabular-nums text-gray-900">{value}</b>
    </span>
  );
}

function DlButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      <Download size={13} /> {children}
    </button>
  );
}

/** A text cell that saves when you leave it (or press Enter). */
function Cell({
  value,
  onCommit,
  disabled,
  placeholder,
  mono,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  mono?: boolean;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  return (
    <input
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== value && onCommit(text.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={clsx(
        "w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-gray-200 focus:border-gray-300 focus:bg-white focus:outline-none disabled:hover:border-transparent",
        mono && "font-mono tabular-nums",
      )}
    />
  );
}
