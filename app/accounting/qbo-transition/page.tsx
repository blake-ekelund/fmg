"use client";

import Link from "next/link";
import clsx from "clsx";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Flag, Loader2, Plus, Search, Star, Trash2 } from "lucide-react";
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
  type System,
  type TaskStatus,
} from "@/lib/qboTransition";

/* The QuickBooks Desktop → QuickBooks Online transition plan (Oct 30, 2026):
   an editable checklist (type, owner, systems, dates, status, our
   recommendation) in qbo_transition_tasks via /api/accounting/qbo-transition,
   our recommendations pulled up top, and the static reference below — where
   we are today, pricing, migration approach, after go-live, risks. Facts were
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
const PHASES: { name: string; dates: string; end: string }[] = [
  { name: "Decide", dates: "Nov 2 – 6", end: "2026-11-06" },
  { name: "Clean up", dates: "Nov 9 – 13", end: "2026-11-13" },
  { name: "Test", dates: "Nov 16 – 20", end: "2026-11-20" },
  { name: "Review", dates: "Nov 23 – 25", end: "2026-11-25" },
  { name: "Prepare", dates: "Nov 30 – Dec 11", end: "2026-12-11" },
  { name: "Confirm", dates: "Dec 14 – 18", end: "2026-12-18" },
  { name: "Ready", dates: "Dec 21 – 24", end: "2026-12-24" },
  { name: "Cutover", dates: "Dec 28 – 31", end: "2026-12-31" },
  { name: "Go live", dates: "Jan 1 – 6", end: "2027-01-06" },
  { name: "Settle", dates: "Jan 7 – 15", end: "2027-01-15" },
  { name: "Close 2026", dates: "Jan 18 – 29", end: "2027-01-29" },
];
const phaseOf = (due: string | null) => (due ? (PHASES.find((p) => due <= p.end)?.name ?? "After Jan 29") : "No date");

const TODAY: [string, string, string][] = [
  ["Connection", "Fishbowl → QuickBooks Desktop, nightly at 6 PM. Fishbowl's QuickBooks Online link is empty.", "Fishbowl must be disconnected from QBD and connected to QBO at cutover."],
  ["What Fishbowl sends", "Shipments (invoice + cost of goods entry), payments, inventory adjustments, customer and vendor updates.", "The same five keep flowing, now to QBO."],
  ["What it doesn't send", "Purchase orders, receipts and vendor bills — keyed into QuickBooks by hand.", "Stays manual in QBO unless we choose otherwise."],
  ["Default accounts", "40000 Gross Sales · 40300 Freight Revenue · 40400 Deductions · Accounts Receivable · 12000 Undeposited Funds · 12101 Inventory Asset · 50000 COGS · 50250 Inventory Adj/Cycle Count · 50500 Scrap/Damages · 20010 Cost Variance · 20000 Accounts Payable", "Each must be re-mapped to a QBO account in Fishbowl's integration wizard."],
  ["Items with their own accounts", "Testers → 40200 Tester Sales / 50050 Tester COGS. Displays → 40201 Display Sales / 50040 Display Costs. 177 fill parts → \"FB Fill Costs Accrual\" (a liability) for inventory and COGS.", "Re-check every override after reconnecting. In QBO, the item's own accounts can override Fishbowl's."],
  ["Discount reasons", "47 reasons; 22 post to their own Deductions sub-accounts (PPP, Display Offset, Free Shipping, Shopify, Faire promos…).", "QBO can't do per-reason discount accounts — all discounts go to one Discount Income / Discount Expense pair."],
  ["Classes", "13 QuickBooks classes in use (GIFT, HOSPITAL, PHARMACY, SALON/SPA, DISTRIBUTOR, WEB, CASINOS…).", "Needs QBO Plus or Advanced (Essentials has no classes)."],
  ["Chart of accounts", "About 180 accounts (about 170 active).", "Fits QBO Plus's 250-account limit."],
  ["Payments", "Every payment lands in Undeposited Funds (no method has its own bank account).", "In QBO this becomes \"Payments to deposit\" — same workflow."],
];

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

const AFTER: [string, string, string][] = [
  ["Customer invoices", "Fishbowl sends them nightly", "Same, to QBO. Invoice number = Fishbowl SO number (with custom numbers on)."],
  ["Cost of goods", "Fishbowl entry per shipment", "Same. The portal's Inventory Journal becomes a check, not an entry to book."],
  ["Customer payments", "Undeposited Funds, then a deposit", "\"Payments to deposit\", then a bank deposit."],
  ["Vendor bills and POs", "Keyed by hand", "Keyed by hand in QBO (unchanged)."],
  ["Discounts", "22 reasons have their own Deductions accounts", "One Discount Income / Expense pair; report by reason from Fishbowl or the portal."],
  ["Fishbowl connection", "Stays connected", "Re-authorize about every 90 days."],
  ["Changing items or accounts", "Fishbowl mapping wins", "Change in Fishbowl first — the item's own settings in QBO can override Fishbowl."],
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
  ["recommendations", "Our recommendations"],
  ["checklist", "Checklist"],
  ["today", "Where we are"],
  ["plans", "Plans & pricing"],
  ["approach", "Migration approach"],
  ["after", "After go-live"],
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
  const [open, setOpen] = useState<Set<string>>(new Set());
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
      setOpen((s) => new Set(s).add(key));
      setGroupBy("phase");
      setTimeout(() => document.getElementById(`task-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const jumpTo = (key: string) => {
    setOwner("all");
    setType("all");
    setStatus("all");
    setOnlyRecs(false);
    setQ("");
    setOpen((s) => new Set(s).add(key));
    setTimeout(() => document.getElementById(`task-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
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

  const recs = useMemo(() => tasks.filter((t) => t.recommendation).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")), [tasks]);
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
            <a
              key={id}
              href={`#${id}`}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-medium hover:border-teal-600",
                id === "recommendations" ? "border-teal-300 bg-teal-50 text-teal-800" : "border-gray-200 bg-white text-gray-700",
              )}
            >
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

      {/* ── Our recommendations ── */}
      <section id="recommendations" className="scroll-mt-20 space-y-4 rounded-2xl border-2 border-teal-600 bg-teal-50/60 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Star size={18} className="fill-teal-600 text-teal-600" /> Our recommendations
          </h2>
          <span className="text-xs text-gray-600">Every task with a recommendation, by due date. Accounting treatments to be confirmed with the CPA.</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Headline label="Plan" value="QBO Plus · 1 year" detail="$1,355 — cheapest per year and no lock-in. Our 13 classes and ~180 accounts fit." />
          <Headline label="Migration" value="A · Full conversion" detail="$1,000 with a test migration in mid-November. Fall back to a fresh start (B) only if the test doesn't tie." />
          <Headline label="Total first-year cost" value="$2,355" detail="Plus 1-year subscription + one-time data conversion. Keep one QBD license for history." />
        </div>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {recs.map((t) => (
            <button
              key={t.key}
              onClick={() => jumpTo(t.key)}
              className="group space-y-1.5 rounded-xl border border-teal-200 bg-white p-3 text-left hover:border-teal-500 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900 group-hover:text-teal-800">{t.name}</span>
                <StatusPill status={t.status} />
              </div>
              <p className="text-sm text-teal-900">{t.recommendation}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <OwnerChip owner={t.owner} />
                <span>Due {fmtDate(t.dueDate)}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

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
                <span />
              </div>
              {groups.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-500">No tasks match these filters.</div>}
              {groups.map((g) => {
                const phase = groupBy === "phase" ? PHASES.find((p) => p.name === g.name) : undefined;
                const doneN = g.tasks.filter((t) => t.status === "done").length;
                return (
                  <Fragment key={g.name}>
                    <div className="flex items-baseline gap-3 border-b border-gray-200 bg-gray-100/70 px-3 py-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-800">{g.name}</span>
                      {phase && <span className="font-mono text-xs text-gray-500">{phase.dates}</span>}
                      <span className="ml-auto text-xs text-gray-500">
                        {doneN}/{g.tasks.length} done
                      </span>
                    </div>
                    {g.tasks.map((t) => (
                      <TaskRow
                        key={t.key}
                        task={t}
                        owners={ownerList}
                        canEdit={canEdit}
                        expanded={open.has(t.key)}
                        onToggle={() =>
                          setOpen((s) => {
                            const n = new Set(s);
                            if (n.has(t.key)) n.delete(t.key);
                            else n.add(t.key);
                            return n;
                          })
                        }
                        onSave={(patch) => save(t.key, patch)}
                        onDelete={() => remove(t.key)}
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
      <div className="grid gap-10 2xl:grid-cols-2">
        <Section id="today" title="Where we are today" intro="Read from Fishbowl on Oct 30, 2026.">
          <Table head={["Area", "Today", "What it means for the move"]} rows={TODAY} />
        </Section>

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
      </div>

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

      <div className="grid gap-10 2xl:grid-cols-2">
        <Section id="after" title="After go-live: what changes day to day">
          <Table head={["Task", "In QBD today", "In QBO"]} rows={AFTER} />
        </Section>
        <Section id="risks" title="Risks and how we handle them">
          <Table head={["Risk", "Impact", "Mitigation"]} rows={RISKS} />
        </Section>
      </div>

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
    </div>
  );
}

/* ─── Checklist pieces ────────────────────────────────────────────────────── */

const ROW = "grid grid-cols-[32px_110px_minmax(0,1fr)_190px_150px_118px_118px_120px_28px] items-start gap-2 px-3";

function TaskRow({
  task: t,
  owners,
  canEdit,
  expanded,
  onToggle,
  onSave,
  onDelete,
}: {
  task: Task;
  owners: string[];
  canEdit: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSave: (patch: Partial<QboTask>) => void;
  onDelete: () => void;
}) {
  const done = t.status === "done";
  const due = t.dueDate ? daysUntil(t.dueDate) : null;
  const overdue = !done && due !== null && due < 0;
  const soon = !done && due !== null && due >= 0 && due <= 7;
  const milestone = t.type === "Milestone";

  return (
    <div
      id={`task-${t.key}`}
      className={clsx(
        "scroll-mt-24 border-b border-gray-100 last:border-b-0",
        t.recommendation && "border-l-4 border-l-teal-600",
        milestone && "bg-teal-50/40",
        done && "bg-gray-50/60",
      )}
    >
      <div className={clsx(ROW, "py-2")}>
        <input
          type="checkbox"
          checked={done}
          disabled={!canEdit}
          onChange={(e) => onSave({ status: e.target.checked ? "done" : "todo" })}
          aria-label={`Mark "${t.name}" done`}
          className="mt-2 h-4 w-4 cursor-pointer accent-teal-700 disabled:cursor-default"
        />
        <MiniSelect value={t.type} disabled={!canEdit} onChange={(v) => onSave({ type: v as QboTask["type"] })} options={TASK_TYPES.map((x) => [x, x])} bold={milestone} />
        <div className="min-w-0">
          <div className="flex items-start gap-1">
            <button onClick={onToggle} className="mt-1.5 shrink-0 text-gray-400 hover:text-gray-700" aria-label={expanded ? "Collapse" : "Expand"}>
              {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
            <div className="min-w-0 flex-1">
              <TextCell
                value={t.name}
                disabled={!canEdit}
                onCommit={(v) => onSave({ name: v })}
                className={clsx("font-semibold", done ? "text-gray-500 line-through" : "text-gray-900")}
              />
              {!expanded && (t.description || t.mustFix || t.recommendation) && (
                <div className="space-y-1 px-1.5 pb-0.5">
                  {t.mustFix && <span className="mr-1.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">Must fix</span>}
                  {t.description && <span className="text-[13px] text-gray-600">{t.description}</span>}
                  {t.recommendation && (
                    <div className="flex gap-1.5 rounded-md bg-teal-50 px-2 py-1 text-[13px] text-teal-900">
                      <Star size={13} className="mt-0.5 shrink-0 fill-teal-600 text-teal-600" />
                      <span>
                        <b>Recommend:</b> {t.recommendation}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {t.helpers && !expanded && <div className="px-1.5 text-xs text-gray-500">With {t.helpers}</div>}
            </div>
          </div>
        </div>
        <Systems value={t.systems} disabled={!canEdit} onChange={(systems) => onSave({ systems })} />
        <div className="pt-1">
          <OwnerSelect value={t.owner} owners={owners} disabled={!canEdit} onChange={(owner) => onSave({ owner })} />
        </div>
        <DateCell value={t.startDate} disabled={!canEdit} onChange={(startDate) => onSave({ startDate })} />
        <div>
          <DateCell value={t.dueDate} disabled={!canEdit} onChange={(dueDate) => onSave({ dueDate })} tone={overdue ? "over" : soon ? "soon" : undefined} />
          {overdue && <div className="px-1.5 text-[11px] font-semibold text-red-700">{-due!} day{due === -1 ? "" : "s"} late</div>}
          {soon && <div className="px-1.5 text-[11px] font-medium text-amber-700">{due === 0 ? "Today" : `In ${due} day${due === 1 ? "" : "s"}`}</div>}
        </div>
        <div className="pt-1">
          <select
            value={t.status}
            disabled={!canEdit}
            onChange={(e) => onSave({ status: e.target.value as TaskStatus })}
            className={clsx("w-full rounded-md border px-1.5 py-1 text-xs font-semibold focus:outline-none disabled:opacity-100", STATUS_STYLE[t.status])}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <span />
      </div>

      {expanded && (
        <div className="grid gap-3 border-t border-dashed border-gray-200 bg-gray-50/60 px-3 py-3 pl-[52px] lg:grid-cols-2">
          <Field label="Description">
            <TextArea value={t.description ?? ""} disabled={!canEdit} onCommit={(v) => onSave({ description: v || null })} placeholder="What needs doing and why" />
          </Field>
          <Field label={<span className="inline-flex items-center gap-1 text-teal-800"><Star size={12} className="fill-teal-600 text-teal-600" /> Our recommendation</span>}>
            <TextArea
              value={t.recommendation ?? ""}
              disabled={!canEdit}
              onCommit={(v) => onSave({ recommendation: v || null })}
              placeholder="Leave blank if there's no call to make"
              tone="rec"
            />
          </Field>
          <Field label="Also involved">
            <TextCell value={t.helpers ?? ""} disabled={!canEdit} onCommit={(v) => onSave({ helpers: v || null })} placeholder="e.g. CPA, Blake" boxed />
          </Field>
          <Field label="Notes">
            <TextArea value={t.notes ?? ""} disabled={!canEdit} onCommit={(v) => onSave({ notes: v || null })} placeholder="Progress, links, what's blocking" />
          </Field>
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 lg:col-span-2">
            <label className="inline-flex items-center gap-1.5 font-medium text-gray-700">
              <input type="checkbox" checked={t.mustFix} disabled={!canEdit} onChange={(e) => onSave({ mustFix: e.target.checked })} className="accent-red-600" />
              <Flag size={12} className="text-red-600" /> Must fix
            </label>
            {t.updatedBy && t.updatedAt && t.updatedBy !== "seed" && (
              <span>
                Last edited by {t.updatedBy} · {new Date(t.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            )}
            {canEdit && (
              <button onClick={onDelete} className="ml-auto inline-flex items-center gap-1 font-medium text-red-700 hover:underline">
                <Trash2 size={12} /> Delete task
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Systems({ value, disabled, onChange }: { value: System[]; disabled: boolean; onChange: (v: System[]) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing && !disabled) {
    return (
      <div className="flex flex-wrap gap-1 pt-1" onMouseLeave={() => setEditing(false)}>
        {SYSTEMS.map((s) => {
          const on = value.includes(s);
          return (
            <button
              key={s}
              onClick={() => onChange(on ? value.filter((x) => x !== s) : SYSTEMS.filter((x) => x === s || value.includes(x)))}
              className={clsx(
                "rounded border px-1.5 py-0.5 text-[11px] font-medium",
                on ? "border-gray-800 bg-gray-800 text-white" : "border-dashed border-gray-300 text-gray-500 hover:border-gray-500",
              )}
            >
              {s}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      disabled={disabled}
      title={disabled ? undefined : "Edit systems"}
      className="flex min-h-[28px] w-full flex-wrap items-start gap-1 rounded-md border border-transparent p-0.5 pt-1 text-left hover:border-gray-200 disabled:hover:border-transparent"
    >
      {value.length === 0 && <span className="px-1 text-xs text-gray-400">—</span>}
      {value.map((s) => (
        <span key={s} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">
          {s}
        </span>
      ))}
    </button>
  );
}

function OwnerSelect({ value, owners, disabled, onChange }: { value: string | null; owners: string[]; disabled: boolean; onChange: (v: string | null) => void }) {
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === "__other") {
          const name = prompt("Owner's name")?.trim();
          if (name) onChange(name);
          return;
        }
        onChange(e.target.value || null);
      }}
      className={clsx(
        "w-full rounded-md border-0 px-1.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-gray-300 disabled:opacity-100",
        value ? (OWNER_STYLE[value] ?? "bg-gray-100 text-gray-800") : "bg-red-50 text-red-700",
      )}
    >
      <option value="">No owner</option>
      {owners.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__other">Someone else…</option>
    </select>
  );
}

function OwnerChip({ owner }: { owner: string | null }) {
  return (
    <span className={clsx("rounded px-1.5 py-0.5 text-[11px] font-semibold", owner ? (OWNER_STYLE[owner] ?? "bg-gray-100 text-gray-800") : "bg-red-50 text-red-700")}>
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
  return <span className={clsx("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}

function RecBadge() {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
      <Star size={10} className="fill-white" /> Recommended
    </span>
  );
}

function Headline({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="space-y-1 rounded-xl bg-teal-700 p-4 text-white">
      <div className="text-[11px] font-bold uppercase tracking-wider text-teal-100">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-sm text-teal-50">{detail}</div>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-teal-600 focus:outline-none">
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function MiniSelect({ value, onChange, options, disabled, bold }: { value: string; onChange: (v: string) => void; options: string[][]; disabled: boolean; bold?: boolean }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(
        "mt-0.5 w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-xs hover:border-gray-200 focus:border-gray-300 focus:outline-none disabled:opacity-100 disabled:hover:border-transparent",
        bold ? "font-bold text-teal-800" : "text-gray-600",
      )}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function DateCell({ value, onChange, disabled, tone }: { value: string | null; onChange: (v: string | null) => void; disabled: boolean; tone?: "over" | "soon" }) {
  return (
    <input
      type="date"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className={clsx(
        "mt-0.5 w-full rounded-md border border-transparent bg-transparent px-1 py-1 font-mono text-xs tabular-nums hover:border-gray-200 focus:border-gray-300 focus:outline-none disabled:opacity-100 disabled:hover:border-transparent",
        tone === "over" ? "font-semibold text-red-700" : tone === "soon" ? "font-semibold text-amber-700" : "text-gray-700",
      )}
    />
  );
}

/** A text input that saves when you leave it (or press Enter). */
function TextCell({
  value,
  onCommit,
  disabled,
  placeholder,
  className,
  boxed,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  boxed?: boolean;
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
        "w-full rounded-md border px-1.5 py-1 text-sm focus:border-gray-300 focus:bg-white focus:outline-none disabled:bg-transparent",
        boxed ? "border-gray-200 bg-white" : "border-transparent bg-transparent hover:border-gray-200 disabled:hover:border-transparent",
        className,
      )}
    />
  );
}

function TextArea({ value, onCommit, disabled, placeholder, tone }: { value: string; onCommit: (v: string) => void; disabled?: boolean; placeholder?: string; tone?: "rec" }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  return (
    <textarea
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      rows={3}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== value && onCommit(text.trim())}
      className={clsx(
        "w-full resize-y rounded-md border px-2 py-1.5 text-sm focus:outline-none disabled:opacity-100",
        tone === "rec" ? "border-teal-300 bg-teal-50 text-teal-900 focus:border-teal-600" : "border-gray-200 bg-white text-gray-800 focus:border-gray-400",
      )}
    />
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      {children}
    </label>
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
