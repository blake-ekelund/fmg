"use client";

import Link from "next/link";
import clsx from "clsx";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Flag, Loader2, Plus, Search, Star, Trash2, X } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  OWNERS,
  SEED,
  STATUSES,
  STATUS_LABEL,
  SYSTEMS,
  TASK_TYPES,
  daysUntil,
  type QboTask,
  type TaskStatus,
} from "@/lib/qboTransition";

/* The QuickBooks Desktop → QuickBooks Online transition plan (Oct 30, 2026):
   an editable checklist (type, owner, systems, dates, status, our
   recommendation) in qbo_transition_tasks via /api/accounting/qbo-transition,
   each task edited in a modal, and the static reference below — where we are
   today, pricing, migration approach, after go-live, risks. Facts were
   read from Fishbowl on Oct 30 (see the QuickBooks Connection page for the
   live view) and pricing is from Fishbowl/Intuit's Oct 29 email. */

const KEY_DATES: { date: string; what: string; note: string; big?: boolean }[] = [
  { date: "Fri Nov 6", what: "Decisions made, QBO bought", note: "Plan, term, approach" },
  { date: "Mon Nov 16", what: "Test migration starts", note: "Book by Nov 9" },
  { date: "Wed Nov 25", what: "Test reviewed: go / no-go", note: "With CPA" },
  { date: "Fri Dec 18", what: "Go-live slot confirmed", note: "≥1 week notice" },
  { date: "Thu Dec 31", what: "Last Fishbowl → QBD export", note: "6 PM, then freeze QBD" },
  { date: "Fri Jan 1", what: "QBO is the book of record", note: "All 2027 activity", big: true },
  { date: "Jan 4 – 6", what: "Go-live migration + Fishbowl → QBO", note: "Users out of QBD" },
  { date: "Fri Jan 29", what: "2026 closed, QBD archived", note: "Opening balances tie" },
];

/** Calendar phases; a task falls in the first phase whose end is on/after its due date. */
const PHASES: { name: string; dates: string; start: string; end: string; goal: string }[] = [
  { name: "Decide", dates: "Nov 2 – 6", start: "2026-11-02", end: "2026-11-06", goal: "Decisions made with the CPA; QBO bought." },
  { name: "Clean up", dates: "Nov 9 – 13", start: "2026-11-09", end: "2026-11-13", goal: "QBD cleaned, $3.8M posting fixed, test migration booked." },
  { name: "Test", dates: "Nov 16 – 20", start: "2026-11-16", end: "2026-11-20", goal: "Test migration done; Fishbowl server work retested." },
  { name: "Review", dates: "Nov 23 – 25", start: "2026-11-23", end: "2026-11-25", goal: "CPA reviews the test; go / no-go on approach A." },
  { name: "Prepare", dates: "Nov 30 – Dec 11", start: "2026-11-30", end: "2026-12-11", goal: "November closed, mapping final, training done." },
  { name: "Confirm", dates: "Dec 14 – 18", start: "2026-12-14", end: "2026-12-18", goal: "Go-live slot confirmed; year-end plan set." },
  { name: "Ready", dates: "Dec 21 – 24", start: "2026-12-21", end: "2026-12-24", goal: "Books reconciled through Nov; runbook walked through." },
  { name: "Cutover", dates: "Dec 28 – 31", start: "2026-12-28", end: "2026-12-31", goal: "Last export Dec 31 at 6 PM; QBD backed up and frozen." },
  { name: "Go live", dates: "Jan 1 – 6", start: "2027-01-01", end: "2027-01-06", goal: "QBO is the book of record; Fishbowl posting to QBO." },
  { name: "Settle", dates: "Jan 7 – 15", start: "2027-01-07", end: "2027-01-15", goal: "Opening balances tie; first week reconciled." },
  { name: "Close 2026", dates: "Jan 18 – 29", start: "2027-01-18", end: "2027-01-29", goal: "2026 closed and filed; QBD archived." },
];
const phaseOf = (due: string | null) => (due ? (PHASES.find((p) => due <= p.end)?.name ?? "After Jan 29") : "No date");

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Where a phase sits relative to today; "next" is the first phase still ahead when none is current. */
function phaseWhen(p: (typeof PHASES)[number]): "past" | "now" | "next" | "later" {
  const today = todayIso();
  if (today > p.end) return "past";
  if (today >= p.start) return "now";
  const upcoming = PHASES.find((x) => today <= x.end);
  return upcoming?.name === p.name ? "next" : "later";
}

const PRICING: { plan: string; term: string; msrp: string; disc: string; price: string; perYear: string; rec?: boolean }[] = [
  { plan: "QBO Plus", term: "1 year", msrp: "$1,680.00", disc: "$325.00", price: "$1,355.00", perYear: "$1,355", rec: true },
  { plan: "QBO Plus", term: "2 years", msrp: "$3,360.00", disc: "$500.00", price: "$2,860.00", perYear: "$1,430" },
  { plan: "QBO Plus", term: "3 years", msrp: "$5,040.00", disc: "$600.00", price: "$4,440.00", perYear: "$1,480" },
  { plan: "QBO Advanced", term: "1 year", msrp: "$4,080.00", disc: "$1,000.00", price: "$3,080.00", perYear: "$3,080" },
  { plan: "QBO Advanced", term: "2 years", msrp: "$8,160.00", disc: "$1,625.00", price: "$6,535.00", perYear: "$3,268" },
  { plan: "QBO Advanced", term: "3 years", msrp: "$12,240.00", disc: "$1,825.00", price: "$10,415.00", perYear: "$3,472" },
  { plan: "Data conversion (QBD → QBO)", term: "One time", msrp: "—", disc: "—", price: "$1,000.00", perYear: "per company file", rec: true },
];

const APPROACHES: { label: string; title: string; points: string[]; chosen?: boolean }[] = [
  {
    label: "A · Recommended",
    title: "Full conversion by Fishbowl / Intuit",
    chosen: true,
    points: [
      "$1,000. Moves transaction history, lists and balances.",
      "A test migration first (1–3 business days, we keep working in QBD), then the go-live migration (1–3 business days, everyone out of QBD).",
      "Each needs at least 1 week's notice to schedule.",
      "Year-over-year reports work in QBO from day one.",
      "Differences after conversion are common; the CPA reviews them. Item types may need reclassifying.",
      "File must be under 2,500,000 targets (F2 in QBD shows the count).",
    ],
  },
  {
    label: "B · Fallback",
    title: "Fresh start at 12/31/2026",
    points: [
      "No conversion fee. QBO starts clean on Jan 1.",
      "Bring in: chart of accounts, classes, terms, customers and vendors with open balances, open invoices and bills, outstanding checks, credit memos, opening balances.",
      "History stays in QBD (keep a license to read it).",
      "Cleanest for Fishbowl: no old inventory items in QBO to conflict.",
      "Opening balances are entered once December is closed (late January).",
    ],
  },
  {
    label: "C · Not recommended",
    title: "Do-it-yourself conversion",
    points: ["Intuit's own tool, no fee.", "Same result as A, but we troubleshoot alone.", "Risky on a holiday timeline with an active Fishbowl integration."],
  },
];

const RISKS: [string, string, string][] = [
  ["Holiday timeline slips", "Go-live moves past Jan 1", "Decide by Nov 6, test in mid-November, book the go-live slot by Dec 18. QBO still starts Jan 1 even if the migration runs Jan 4–6."],
  ["Converted balances don't tie", "Messy opening balances", "Clean QBD first, test-migrate, CPA review; fall back to a fresh start (B)."],
  ["QBO items override Fishbowl's accounts", "Sales or COGS land in the wrong account", "Set up and change items in Fishbowl first; spot-check the first postings."],
  ["Per-reason discount accounts lost", "Less detail in the P&L", "Decide reporting from Fishbowl or the portal before go-live."],
  ["Cost of goods counted twice", "Overstated COGS", "Stop booking the portal's inventory entry once Fishbowl posts to QBO."],
  ["Fishbowl ↔ QBO authorization expires", "Postings stop silently", "90-day reminders; the QuickBooks Connection page shows the last export."],
  ["Payroll isn't moved by conversion", "Payroll gap in January", "Confirm the payroll provider and plan by Nov 6."],
  ["Hosted Fishbowl changes break the portal", "Orders or syncs stop", "Do the RAM and API work in November, then retest, away from cutover week."],
];

const CONTACTS: { who: string; for: string }[] = [
  { who: "Fishbowl Intuit solution specialist", for: "QBO purchase, pricing, test and go-live migration scheduling" },
  { who: "Fishbowl account manager", for: "Hosted server RAM upgrade, Fishbowl API update, training hours" },
  { who: "Fishbowl Support", for: "QuickBooks & accounting integration issues (Mon–Fri, business hours)" },
];

const SECTIONS = [
  ["checklist", "Checklist"],
  ["plans", "Plans & pricing"],
  ["approach", "Migration approach"],
  ["risks", "Risks"],
  ["contacts", "Contacts"],
] as const;

const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "border-gray-200 bg-white text-gray-700",
  doing: "border-blue-200 bg-blue-50 text-blue-800",
  blocked: "border-red-200 bg-red-50 text-red-700",
  done: "border-teal-200 bg-teal-50 text-teal-800",
};

const OWNER_STYLE: Record<string, string> = {
  "Julie Ekelund": "bg-violet-100 text-violet-800",
  "Blake Ekelund": "bg-sky-100 text-sky-800",
  CPA: "bg-amber-100 text-amber-800",
  Bookkeeper: "bg-emerald-100 text-emerald-800",
  Fishbowl: "bg-orange-100 text-orange-800",
};

type GroupBy = "phase" | "type" | "owner";
type Task = QboTask & { key: string };

const keyOf = (t: QboTask) => t.id ?? `seed-${t.sort}`;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api<T>(method: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/accounting/qbo-transition", {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" }) : "—";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function downloadCsv(tasks: Task[]) {
  const rows = [
    ["Phase", "Type", "Task", "Description", "Systems", "Owner", "Also involved", "Start", "Due", "Status", "Our recommendation", "Notes"],
    ...tasks.map((t) => [
      phaseOf(t.dueDate),
      t.type,
      t.name,
      t.description ?? "",
      t.systems.join("; "),
      t.owner ?? "",
      t.helpers ?? "",
      t.startDate ?? "",
      t.dueDate ?? "",
      STATUS_LABEL[t.status],
      t.recommendation ?? "",
      t.notes ?? "",
    ]),
  ];
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "qbo-transition-checklist.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function QboTransitionPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("phase");
  const [owner, setOwner] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<TaskStatus | "all" | "open">("all");
  const [onlyRecs, setOnlyRecs] = useState(false);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ ready: boolean; tasks: QboTask[] }>("GET");
      setReady(res.ready);
      const list = res.ready ? res.tasks : SEED;
      setTasks(list.map((t) => ({ ...t, key: keyOf(t) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTasks(SEED.map((t) => ({ ...t, key: keyOf(t) })));
      setReady(false);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const canEdit = ready && !loading;

  const save = useCallback(
    async (key: string, patch: Partial<QboTask>) => {
      const before = tasks.find((t) => t.key === key);
      if (!before?.id || !canEdit) return;
      setTasks((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)));
      try {
        const res = await api<{ task: QboTask }>("PATCH", { id: before.id, ...patch });
        setTasks((ts) => ts.map((t) => (t.key === key ? { ...res.task, key } : t)));
      } catch (e) {
        setTasks((ts) => ts.map((t) => (t.key === key ? before : t)));
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [tasks, canEdit],
  );

  const remove = async (key: string) => {
    const t = tasks.find((x) => x.key === key);
    if (!t?.id || !confirm(`Delete "${t.name}"?`)) return;
    setTasks((ts) => ts.filter((x) => x.key !== key));
    try {
      await api("DELETE", { id: t.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      load();
    }
  };

  const add = async () => {
    setAdding(true);
    try {
      const res = await api<{ task: QboTask }>("POST", { task: { name: "New task", owner: owner !== "all" ? owner : null } });
      const key = keyOf(res.task);
      setTasks((ts) => [...ts, { ...res.task, key }]);
      setEditing(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const ownerList = useMemo(() => {
    const extra = tasks.map((t) => t.owner).filter((o): o is string => !!o && !(OWNERS as readonly string[]).includes(o));
    return [...OWNERS, ...Array.from(new Set(extra)).sort()];
  }, [tasks]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (owner === "all" || (owner === "none" ? !t.owner : t.owner === owner)) &&
        (type === "all" || t.type === type) &&
        (status === "all" || (status === "open" ? t.status !== "done" : t.status === status)) &&
        (!onlyRecs || !!t.recommendation) &&
        (!needle || [t.name, t.description, t.recommendation, t.notes, t.helpers].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [tasks, owner, type, status, onlyRecs, q]);

  const groups = useMemo(() => {
    const byDue = [...filtered].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.sort - b.sort);
    const keyFn = (t: Task) => (groupBy === "phase" ? phaseOf(t.dueDate) : groupBy === "type" ? t.type : (t.owner ?? "No owner"));
    const order =
      groupBy === "phase"
        ? [...PHASES.map((p) => p.name), "After Jan 29", "No date"]
        : groupBy === "type"
          ? [...TASK_TYPES]
          : [...ownerList, "No owner"];
    const map = new Map<string, Task[]>();
    for (const t of byDue) {
      const k = keyFn(t);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...order.filter((k) => map.has(k)), ...[...map.keys()].filter((k) => !order.includes(k))].map((k) => ({ name: k, tasks: map.get(k)! }));
  }, [filtered, groupBy, ownerList]);

  const stats = useMemo(() => {
    const done = tasks.filter((t) => t.status === "done").length;
    const overdue = tasks.filter((t) => t.status !== "done" && t.dueDate && daysUntil(t.dueDate) < 0).length;
    const week = tasks.filter((t) => t.status !== "done" && t.dueDate && daysUntil(t.dueDate) >= 0 && daysUntil(t.dueDate) <= 7).length;
    const blocked = tasks.filter((t) => t.status === "blocked").length;
    const byOwner = ownerList.map((o) => ({
      owner: o,
      open: tasks.filter((t) => t.owner === o && t.status !== "done").length,
      total: tasks.filter((t) => t.owner === o).length,
    }));
    return { done, total: tasks.length, overdue, week, blocked, byOwner };
  }, [tasks, ownerList]);

  const editingTask = editing ? tasks.find((t) => t.key === editing) : undefined;
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div className="space-y-10 px-4 py-6 md:px-8">
      <PageMeta
        title="QBO Transition"
        description="Plan, decisions, checklist and calendar for moving from QuickBooks Desktop to QuickBooks Online by January 1, 2027."
      />

      <header className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-teal-700">Accounting · Plan prepared Oct 30, 2026</div>
        <h1 className="text-2xl font-bold text-gray-900">Moving from QuickBooks Desktop to QuickBooks Online</h1>
        <p className="max-w-4xl text-[15px] text-gray-600">
          Every 2027 transaction booked in QuickBooks Online, with Fishbowl posting to it, starting{" "}
          <b className="text-gray-900">January 1, 2027</b>. The checklist below is the plan — edit owners, dates and status as work moves. See{" "}
          <Link href="/accounting/quickbooks-connection" className="font-medium text-teal-700 hover:underline">
            QuickBooks Connection
          </Link>{" "}
          for what Fishbowl sends today, and{" "}
          <Link href="/accounting/chart-of-accounts" className="font-medium text-teal-700 hover:underline">
            Chart of Accounts
          </Link>{" "}
          for the current and proposed charts.
        </p>
        <nav className="flex flex-wrap gap-1.5 pt-1" aria-label="Sections">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:border-teal-600">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 sm:grid-cols-4 xl:grid-cols-8">
        {KEY_DATES.map((d) => (
          <div key={d.date} className={clsx("space-y-0.5 p-3", d.big ? "bg-teal-50" : "bg-white")}>
            <div className="font-mono text-xs font-semibold text-teal-700">{d.date}</div>
            <div className="text-sm font-semibold text-gray-900">{d.what}</div>
            <div className="text-xs text-gray-500">{d.note}</div>
          </div>
        ))}
      </div>

      {/* ── Checklist ── */}
      <section id="checklist" className="scroll-mt-20 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-gray-900 pb-2">
          <h2 className="text-lg font-bold text-gray-900">Checklist</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadCsv(groups.flatMap((g) => g.tasks))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download size={13} /> CSV
            </button>
            <button
              onClick={add}
              disabled={!canEdit || adding}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add task
            </button>
          </div>
        </div>

        {!ready && !loading && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              Showing the plan read-only — the checklist table isn&rsquo;t there yet. Run <code className="font-mono">supabase db push</code> to apply
              migration 20261101000000, then edits save for everyone.
            </span>
          </div>
        )}
        {error && ready && (
          <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-semibold underline">
              Dismiss
            </button>
          </div>
        )}

        {/* progress + owners */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-gray-900">
                {stats.done} of {stats.total} done
              </span>
              <span className="font-mono text-sm font-semibold text-teal-700">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
              <button onClick={() => setStatus("open")} className={clsx("font-medium", stats.overdue ? "text-red-700" : "text-gray-500")}>
                {stats.overdue} overdue
              </button>
              <span className="font-medium text-gray-700">{stats.week} due in the next 7 days</span>
              <button onClick={() => setStatus("blocked")} className={clsx("font-medium", stats.blocked ? "text-red-700" : "text-gray-500")}>
                {stats.blocked} blocked
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-3">
            <OwnerFilter label="Everyone" active={owner === "all"} onClick={() => setOwner("all")} open={stats.total - stats.done} total={stats.total} />
            {stats.byOwner
              .filter((o) => o.total > 0)
              .map((o) => (
                <OwnerFilter
                  key={o.owner}
                  label={o.owner}
                  active={owner === o.owner}
                  onClick={() => setOwner(owner === o.owner ? "all" : o.owner)}
                  open={o.open}
                  total={o.total}
                />
              ))}
          </div>
        </div>

        {/* filters */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tasks"
              className="w-56 rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>
          <Select value={type} onChange={setType} options={[["all", "All types"], ...TASK_TYPES.map((t) => [t, t] as [string, string])]} />
          <Select
            value={status}
            onChange={(v) => setStatus(v as typeof status)}
            options={[["all", "Any status"], ["open", "Not done"], ...STATUSES.map((s) => [s, STATUS_LABEL[s]] as [string, string])]}
          />
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-800">
            <input type="checkbox" checked={onlyRecs} onChange={(e) => setOnlyRecs(e.target.checked)} className="accent-teal-700" />
            Only recommendations
          </label>
          <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs font-medium">
            {(["phase", "type", "owner"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={clsx("px-3 py-1.5", groupBy === g ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50")}
              >
                By {g === "phase" ? "week" : g}
              </button>
            ))}
          </div>
        </div>

        {groupBy === "phase" && !loading && <WeekStrip tasks={tasks} />}

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" /> Loading the checklist…
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <div className="min-w-[1080px]">
              <div className={clsx(ROW, "border-b border-gray-200 bg-gray-50 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500")}>
                <span />
                <span>Type</span>
                <span>Task</span>
                <span>Systems</span>
                <span>Owner</span>
                <span>Start</span>
                <span>Due</span>
                <span>Status</span>
              </div>
              {groups.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-500">No tasks match these filters.</div>}
              {groups.map((g) => {
                const phase = groupBy === "phase" ? PHASES.find((p) => p.name === g.name) : undefined;
                const doneN = g.tasks.filter((t) => t.status === "done").length;
                const lateN = g.tasks.filter((t) => t.status !== "done" && t.dueDate && daysUntil(t.dueDate) < 0).length;
                const when = phase ? phaseWhen(phase) : null;
                return (
                  <Fragment key={g.name}>
                    <div
                      id={`week-${g.name}`}
                      className={clsx(
                        "flex scroll-mt-20 flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 px-3 py-2",
                        when === "now" ? "bg-gray-900 text-white" : "bg-gray-100",
                      )}
                    >
                      <span className="text-xs font-bold uppercase tracking-wider">{g.name}</span>
                      {phase && <span className={clsx("font-mono text-xs", when === "now" ? "text-gray-300" : "text-gray-500")}>{phase.dates}</span>}
                      {when === "now" && <span className="rounded bg-teal-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">This week</span>}
                      {when === "next" && <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-teal-800">Up next</span>}
                      {phase && <span className={clsx("text-xs", when === "now" ? "text-gray-200" : "text-gray-600")}>{phase.goal}</span>}
                      <span className="ml-auto flex items-center gap-2 text-xs">
                        {lateN > 0 && <span className="font-semibold text-red-500">{lateN} late</span>}
                        <span className={when === "now" ? "text-gray-300" : "text-gray-500"}>
                          {doneN}/{g.tasks.length} done
                        </span>
                        <span className={clsx("h-1.5 w-20 overflow-hidden rounded-full", when === "now" ? "bg-gray-700" : "bg-gray-200")}>
                          <span className="block h-full rounded-full bg-teal-500" style={{ width: `${g.tasks.length ? (doneN / g.tasks.length) * 100 : 0}%` }} />
                        </span>
                      </span>
                    </div>
                    {g.tasks.map((t) => (
                      <TaskRow
                        key={t.key}
                        task={t}
                        canEdit={canEdit}
                        onOpen={() => setEditing(t.key)}
                        onSave={(patch) => save(t.key, patch)}
                      />
                    ))}
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}
        <Callout title="Don't double-count cost of goods" tone="warn">
          Once Fishbowl posts shipment COGS to QBO, the portal&rsquo;s monthly{" "}
          <Link href="/accounting/inventory-journal" className="font-medium underline">
            Inventory Journal
          </Link>{" "}
          entry must not also be booked for the same months. That page will switch to a checking role for 2027.
        </Callout>
      </section>

      {/* ── Reference ── */}
      <Section
          id="plans"
          title="Plans & pricing"
          intro="Quoted by Fishbowl's Intuit solution specialist on Oct 29, 2026. Subject to managed-account terms; MSRP applies after the initial period; no refunds on cancellation."
        >
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="px-3 py-2 font-semibold">Plan</th>
                  <th className="px-3 py-2 font-semibold">Term</th>
                  <th className="px-3 py-2 text-right font-semibold">MSRP</th>
                  <th className="px-3 py-2 text-right font-semibold">Discount</th>
                  <th className="px-3 py-2 text-right font-semibold">Price</th>
                  <th className="px-3 py-2 text-right font-semibold">Per year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {PRICING.map((p) => (
                  <tr key={`${p.plan}-${p.term}`} className={p.rec ? "bg-teal-50" : undefined}>
                    <td className={clsx("px-3 py-2 font-medium text-gray-900", p.rec && "border-l-4 border-teal-600")}>
                      {p.plan}
                      {p.rec && <RecBadge />}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{p.term}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-600">{p.msrp}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-600">{p.disc}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-gray-900">{p.price}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-600">{p.perYear}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">
            At these discounts, multi-year terms cost slightly more per year than the 1-year term, so 1 year is both the cheapest per year and the most
            flexible.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Option
              label="Recommended"
              title="Plus, 1 year · $1,355"
              chosen
              points={["Up to 5 named users + 2 external accountants", "Classes and locations (our 13 classes fit)", "250-account limit (we use about 180)", "Works with Fishbowl's QBO integration"]}
            />
            <Option
              label="Choose instead if"
              title="Advanced, 1 year · $3,080"
              points={["More than 5 people need their own login", "We want custom user roles and workflow automation", "Premium support, backup and restore, higher usage limits", "We expect to outgrow Plus's limits in 1–2 years"]}
            />
          </div>
      </Section>

      <Section id="approach" title="Migration approach">
        <div className="grid gap-3 md:grid-cols-3">
          {APPROACHES.map((a) => (
            <Option key={a.label} label={a.label} title={a.title} points={a.points} chosen={a.chosen} />
          ))}
        </div>
        <Callout title="How we choose between A and B">
          Run the test migration (A) in mid-November. If the CPA finds the converted balances tie out with fixable differences, go live with A. If the
          test shows heavy or unexplained differences, switch to B. The checklist works for both up to Dec 31; the January steps differ only where
          marked.
        </Callout>
      </Section>

      <Section id="risks" title="Risks and how we handle them">
        <Table head={["Risk", "Impact", "Mitigation"]} rows={RISKS} />
      </Section>

      <Section id="contacts" title="Contacts">
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white text-sm">
          {CONTACTS.map((c) => (
            <li key={c.who} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[260px_1fr]">
              <span className="font-semibold text-gray-900">{c.who}</span>
              <span className="text-gray-600">{c.for}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500">
          Names, emails and phone numbers are in Fishbowl&rsquo;s Oct 29, 2026 email to Julie and Blake. Fishbowl does not give accounting advice; for a
          Fishbowl-savvy accountant, its Partner Directory lists consulting partners.
        </p>
      </Section>

      <p className="border-t border-gray-200 pt-4 text-xs text-gray-500">
        Account names, counts and the $3.8M posting were read from Fishbowl on Oct 30, 2026. Pricing and timelines are from Fishbowl&rsquo;s Oct 29,
        2026 email. Confirm accounting treatments (fills, discounts, year-end entries) with the CPA.
      </p>

      {editingTask && (
        <TaskModal
          key={editingTask.key}
          task={editingTask}
          owners={ownerList}
          canEdit={canEdit}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            save(editingTask.key, patch);
            setEditing(null);
          }}
          onDelete={() => {
            setEditing(null);
            remove(editingTask.key);
          }}
        />
      )}
    </div>
  );
}

/* ─── Checklist pieces ────────────────────────────────────────────────────── */

const ROW = "grid grid-cols-[32px_110px_minmax(0,1fr)_190px_150px_100px_110px_110px] items-start gap-2 px-3";

/** A read-only row; clicking it opens the task in the edit modal. */
function TaskRow({
  task: t,
  canEdit,
  onOpen,
  onSave,
}: {
  task: Task;
  canEdit: boolean;
  onOpen: () => void;
  onSave: (patch: Partial<QboTask>) => void;
}) {
  const done = t.status === "done";
  const due = t.dueDate ? daysUntil(t.dueDate) : null;
  const overdue = !done && due !== null && due < 0;
  const soon = !done && due !== null && due >= 0 && due <= 7;
  const milestone = t.type === "Milestone";

  return (
    <div
      id={`task-${t.key}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={clsx(
        ROW,
        "cursor-pointer border-b border-gray-100 py-2.5 last:border-b-0 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none",
        t.recommendation && "border-l-4 border-l-teal-600",
        milestone && "bg-teal-50/40",
        done && "bg-gray-50/60",
      )}
    >
      <input
        type="checkbox"
        checked={done}
        disabled={!canEdit}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onSave({ status: e.target.checked ? "done" : "todo" })}
        aria-label={`Mark "${t.name}" done`}
        className="mt-0.5 h-4 w-4 cursor-pointer accent-teal-700 disabled:cursor-default"
      />
      <span className={clsx("pt-0.5 text-xs", milestone ? "font-bold text-teal-800" : "text-gray-600")}>{t.type}</span>
      <div className="min-w-0 space-y-1">
        <div className={clsx("text-sm font-semibold", done ? "text-gray-500 line-through" : "text-gray-900")}>
          {t.name}
          {t.mustFix && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-red-700">Must fix</span>}
        </div>
        {t.description && <div className="line-clamp-2 text-[13px] text-gray-600">{t.description}</div>}
        {t.recommendation && (
          <div className="flex gap-1.5 rounded-md bg-teal-50 px-2 py-1 text-[13px] text-teal-900">
            <Star size={13} className="mt-0.5 shrink-0 fill-teal-600 text-teal-600" />
            <span className="line-clamp-2">
              <b>Recommend:</b> {t.recommendation}
            </span>
          </div>
        )}
        {t.helpers && <div className="text-xs text-gray-500">With {t.helpers}</div>}
      </div>
      <div className="flex flex-wrap gap-1">
        {t.systems.length === 0 && <span className="text-xs text-gray-400">—</span>}
        {t.systems.map((s) => (
          <span key={s} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">
            {s}
          </span>
        ))}
      </div>
      <div>
        <OwnerChip owner={t.owner} />
      </div>
      <span className="pt-0.5 font-mono text-xs tabular-nums text-gray-700">{fmtDate(t.startDate)}</span>
      <div className="pt-0.5">
        <div className={clsx("font-mono text-xs tabular-nums", overdue ? "font-semibold text-red-700" : soon ? "font-semibold text-amber-700" : "text-gray-700")}>
          {fmtDate(t.dueDate)}
        </div>
        {overdue && <div className="text-[11px] font-semibold text-red-700">{-due!} day{due === -1 ? "" : "s"} late</div>}
        {soon && <div className="text-[11px] font-medium text-amber-700">{due === 0 ? "Today" : `In ${due} day${due === 1 ? "" : "s"}`}</div>}
      </div>
      <div>
        <StatusPill status={t.status} />
      </div>
    </div>
  );
}

type Draft = Omit<QboTask, "id" | "sort" | "updatedBy" | "updatedAt">;
const DRAFT_KEYS: (keyof Draft)[] = ["type", "name", "description", "systems", "owner", "helpers", "startDate", "dueDate", "status", "recommendation", "mustFix", "notes"];

const blank = (v: string | null) => (v && v.trim() ? v.trim() : null);

/** Edits one task. Same size for every task; the body scrolls. */
function TaskModal({
  task,
  owners,
  canEdit,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task;
  owners: string[];
  canEdit: boolean;
  onClose: () => void;
  onSave: (patch: Partial<QboTask>) => void;
  onDelete: () => void;
}) {
  const [d, setD] = useState<Draft>(() => Object.fromEntries(DRAFT_KEYS.map((k) => [k, task[k]])) as Draft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const patch = useMemo(() => {
    const clean: Draft = {
      ...d,
      name: d.name.trim() || "Untitled task",
      description: blank(d.description),
      helpers: blank(d.helpers),
      recommendation: blank(d.recommendation),
      notes: blank(d.notes),
    };
    const out: Record<string, unknown> = {};
    for (const k of DRAFT_KEYS) if (JSON.stringify(clean[k]) !== JSON.stringify(task[k])) out[k] = clean[k];
    return out as Partial<QboTask>;
  }, [d, task]);
  const dirty = Object.keys(patch).length > 0;

  const close = useCallback(() => {
    if (dirty && !confirm("Discard your changes to this task?")) return;
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const input = "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-teal-600 focus:outline-none disabled:bg-gray-50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label="Edit task" className="flex h-[min(720px,calc(100vh-2rem))] w-[min(760px,100%)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {phaseOf(d.dueDate)} · {d.type}
            </div>
            <div className="truncate text-base font-bold text-gray-900">{d.name || "Untitled task"}</div>
          </div>
          <button onClick={close} aria-label="Close" className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Field label="Task">
            <input value={d.name} disabled={!canEdit} onChange={(e) => set("name", e.target.value)} className={clsx(input, "font-semibold")} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Type">
              <select value={d.type} disabled={!canEdit} onChange={(e) => set("type", e.target.value as Draft["type"])} className={input}>
                {TASK_TYPES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select value={d.status} disabled={!canEdit} onChange={(e) => set("status", e.target.value as TaskStatus)} className={input}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Owner">
              <select
                value={d.owner ?? ""}
                disabled={!canEdit}
                onChange={(e) => {
                  if (e.target.value === "__other") {
                    const name = prompt("Owner's name")?.trim();
                    if (name) set("owner", name);
                    return;
                  }
                  set("owner", e.target.value || null);
                }}
                className={input}
              >
                <option value="">No owner</option>
                {[...owners, ...(d.owner && !owners.includes(d.owner) ? [d.owner] : [])].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
                <option value="__other">Someone else…</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Start">
              <input type="date" value={d.startDate ?? ""} disabled={!canEdit} onChange={(e) => set("startDate", e.target.value || null)} className={input} />
            </Field>
            <Field label="Due">
              <input type="date" value={d.dueDate ?? ""} disabled={!canEdit} onChange={(e) => set("dueDate", e.target.value || null)} className={input} />
            </Field>
            <Field label="Also involved">
              <input value={d.helpers ?? ""} disabled={!canEdit} onChange={(e) => set("helpers", e.target.value)} placeholder="e.g. CPA, Blake" className={input} />
            </Field>
          </div>

          <Field label="Systems involved">
            <div className="flex flex-wrap gap-1.5">
              {SYSTEMS.map((s) => {
                const on = d.systems.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => set("systems", on ? d.systems.filter((x) => x !== s) : SYSTEMS.filter((x) => x === s || d.systems.includes(x)))}
                    className={clsx(
                      "rounded-md border px-2.5 py-1 text-xs font-medium",
                      on ? "border-gray-800 bg-gray-800 text-white" : "border-dashed border-gray-300 text-gray-600 hover:border-gray-500",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Description">
            <textarea
              value={d.description ?? ""}
              disabled={!canEdit}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder="What needs doing and why"
              className={clsx(input, "resize-none")}
            />
          </Field>

          <Field
            label={
              <span className="inline-flex items-center gap-1 text-teal-800">
                <Star size={12} className="fill-teal-600 text-teal-600" /> Our recommendation
              </span>
            }
          >
            <textarea
              value={d.recommendation ?? ""}
              disabled={!canEdit}
              onChange={(e) => set("recommendation", e.target.value)}
              rows={3}
              placeholder="Leave blank if there's no call to make"
              className={clsx(input, "resize-none border-teal-300 bg-teal-50 text-teal-900")}
            />
          </Field>

          <Field label="Notes">
            <textarea
              value={d.notes ?? ""}
              disabled={!canEdit}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              placeholder="Progress, links, what's blocking"
              className={clsx(input, "resize-none")}
            />
          </Field>

          <label className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={d.mustFix} disabled={!canEdit} onChange={(e) => set("mustFix", e.target.checked)} className="accent-red-600" />
            <Flag size={13} className="text-red-600" /> Must fix
          </label>
        </div>

        <div className="flex items-center gap-3 border-t border-gray-200 px-5 py-3">
          {canEdit && (
            <button
              onClick={() => {
                if (confirm(`Delete "${task.name}"?`)) onDelete();
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline"
            >
              <Trash2 size={13} /> Delete
            </button>
          )}
          {task.updatedBy && task.updatedAt && task.updatedBy !== "seed" && (
            <span className="truncate text-xs text-gray-500">
              Edited by {task.updatedBy} · {new Date(task.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={close} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              {canEdit ? "Cancel" : "Close"}
            </button>
            {canEdit && (
              <button
                onClick={() => (dirty ? onSave(patch) : onClose())}
                className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800"
              >
                Save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The 11 weeks of the plan side by side: progress, late tasks and milestones per week; click to jump. */
function WeekStrip({ tasks }: { tasks: Task[] }) {
  return (
    <div className="overflow-x-auto">
      <ol className="grid min-w-[1080px] grid-cols-11 gap-1.5">
        {PHASES.map((p) => {
          const ts = tasks.filter((t) => phaseOf(t.dueDate) === p.name);
          const done = ts.filter((t) => t.status === "done").length;
          const late = ts.filter((t) => t.status !== "done" && t.dueDate && daysUntil(t.dueDate) < 0).length;
          const milestone = ts.find((t) => t.type === "Milestone");
          const when = phaseWhen(p);
          const complete = ts.length > 0 && done === ts.length;
          return (
            <li key={p.name}>
              <button
                onClick={() => document.getElementById(`week-${p.name}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className={clsx(
                  "flex h-full w-full flex-col gap-1 rounded-lg border p-2 text-left transition hover:shadow-sm",
                  when === "now"
                    ? "border-gray-900 bg-gray-900 text-white"
                    : late
                      ? "border-red-200 bg-red-50"
                      : complete
                        ? "border-teal-200 bg-teal-50"
                        : when === "next"
                          ? "border-teal-500 bg-white"
                          : "border-gray-200 bg-white",
                )}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="truncate text-[11px] font-bold uppercase tracking-wider">{p.name}</span>
                  {when === "now" && <span className="rounded bg-teal-500 px-1 text-[9px] font-bold uppercase text-white">Now</span>}
                  {when === "next" && <span className="rounded bg-teal-100 px-1 text-[9px] font-bold uppercase text-teal-800">Next</span>}
                  {complete && when !== "now" && <span className="text-[11px] font-bold text-teal-700">✓</span>}
                </span>
                <span className={clsx("font-mono text-[11px]", when === "now" ? "text-gray-300" : "text-gray-500")}>{p.dates}</span>
                <span className={clsx("h-1 overflow-hidden rounded-full", when === "now" ? "bg-gray-700" : "bg-gray-200")}>
                  <span className="block h-full rounded-full bg-teal-500" style={{ width: `${ts.length ? (done / ts.length) * 100 : 0}%` }} />
                </span>
                <span className={clsx("text-[11px]", when === "now" ? "text-gray-300" : "text-gray-600")}>
                  {done}/{ts.length} done{late > 0 && <b className="text-red-600"> · {late} late</b>}
                </span>
                {milestone && (
                  <span className={clsx("line-clamp-2 text-[11px] font-medium", when === "now" ? "text-teal-300" : "text-teal-800")}>◆ {milestone.name}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function OwnerChip({ owner }: { owner: string | null }) {
  return (
    <span
      className={clsx(
        "inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold",
        owner ? (OWNER_STYLE[owner] ?? "bg-gray-100 text-gray-800") : "bg-red-50 text-red-700",
      )}
    >
      {owner ?? "No owner"}
    </span>
  );
}

function OwnerFilter({ label, active, onClick, open, total }: { label: string; active: boolean; onClick: () => void; open: number; total: number }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex min-w-[120px] flex-col items-start rounded-lg border px-3 py-1.5 text-left",
        active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 hover:border-gray-400",
      )}
    >
      <span className="text-xs font-semibold">{label}</span>
      <span className={clsx("text-[11px]", active ? "text-gray-300" : "text-gray-500")}>
        {open} open · {total - open} done
      </span>
    </button>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span className={clsx("inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>
  );
}

function RecBadge() {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
      <Star size={10} className="fill-white" /> Recommended
    </span>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-teal-600 focus:outline-none"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      {children}
    </div>
  );
}

/* ─── Reference pieces ────────────────────────────────────────────────────── */

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <h2 className="border-b-2 border-gray-900 pb-2 text-lg font-bold text-gray-900">{title}</h2>
      {intro && <p className="max-w-4xl text-sm text-gray-600">{intro}</p>}
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: [string, string, string]; rows: [string, string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(([a, b, c]) => (
            <tr key={a} className="align-top">
              <td className="px-3 py-2 font-medium text-gray-900">{a}</td>
              <td className="px-3 py-2 text-gray-700">{b}</td>
              <td className="px-3 py-2 text-gray-700">{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Option({ label, title, points, chosen }: { label: string; title: string; points: string[]; chosen?: boolean }) {
  return (
    <div className={clsx("space-y-2 rounded-xl p-4", chosen ? "border-2 border-teal-600 bg-teal-50/60" : "border border-gray-200 bg-white")}>
      <div className={clsx("flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider", chosen ? "text-teal-700" : "text-gray-500")}>
        {chosen && <Star size={11} className="fill-teal-600 text-teal-600" />}
        {label}
      </div>
      <div className="font-semibold text-gray-900">{title}</div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

function Callout({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={clsx("space-y-1 border-l-4 px-4 py-3", tone === "warn" ? "border-amber-500 bg-amber-50" : "border-teal-600 bg-white")}>
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <p className="text-sm text-gray-700">{children}</p>
    </div>
  );
}
