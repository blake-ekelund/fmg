/* QuickBooks Desktop → Online transition checklist (Accounting → QBO
   Transition). The SEED is the plan as written Oct 30, 2026; migration
   20261101000000 inserts it into qbo_transition_tasks, after which the rows
   are edited on the page. Until the migration is pushed the page shows the
   seed read-only. */

export const TASK_TYPES = ["Decision", "Clean-up", "Fishbowl", "QBO setup", "Migration", "Training", "Year-end", "Milestone"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const SYSTEMS = ["QBD", "QBO", "Fishbowl", "Portal", "Banks", "Payroll", "Point B"] as const;
export type System = (typeof SYSTEMS)[number];

export const STATUSES = ["todo", "doing", "blocked", "done"] as const;
export type TaskStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: "Not started", doing: "In progress", blocked: "Blocked", done: "Done" };

export const OWNERS = ["Julie Ekelund", "Blake Ekelund", "CPA", "Bookkeeper", "Fishbowl"] as const;

export type QboTask = {
  id?: string;
  type: TaskType;
  name: string;
  description: string | null;
  systems: System[];
  owner: string | null;
  helpers: string | null; // others involved, free text
  startDate: string | null; // YYYY-MM-DD
  dueDate: string | null;
  status: TaskStatus;
  recommendation: string | null; // our call, highlighted on the page
  mustFix: boolean;
  notes: string | null;
  sort: number;
  updatedBy?: string | null;
  updatedAt?: string | null;
};

const JULIE = "Julie Ekelund";
const BLAKE = "Blake Ekelund";

type S = Omit<QboTask, "sort" | "status" | "notes" | "mustFix" | "helpers" | "recommendation" | "description"> & {
  description?: string;
  helpers?: string;
  recommendation?: string;
  mustFix?: boolean;
};

const PLAN: S[] = [
  // ── Decide · Nov 2 – 6 ──
  { type: "Decision", name: "Kickoff with the CPA", description: "Walk through plan, term, approach A or B, discounts, fills, payroll, sales tax and 1099s.", systems: [], owner: JULIE, helpers: "CPA, Blake", startDate: "2026-11-02", dueDate: "2026-11-03" },
  { type: "Decision", name: "Plan: QBO Plus or Advanced", description: "Plus fits our ~180 accounts and 13 classes; Advanced only if more than 5 people need logins, custom roles or higher limits.", systems: ["QBO"], owner: JULIE, helpers: "CPA", startDate: "2026-11-02", dueDate: "2026-11-06", recommendation: "QBO Plus — $1,355 for the first year. Our 13 classes and ~180 accounts fit; revisit Advanced only if we pass 5 named users." },
  { type: "Decision", name: "Term: 1, 2 or 3 years", description: "Longer terms cost slightly more per year at these discounts, and there are no refunds on cancellation.", systems: ["QBO"], owner: JULIE, startDate: "2026-11-02", dueDate: "2026-11-06", recommendation: "1 year. It is the cheapest per year ($1,355 vs $1,430 / $1,480) and keeps us flexible for the first year on QBO." },
  { type: "Decision", name: "Migration approach: full conversion or fresh start", description: "A = Fishbowl/Intuit full conversion ($1,000, moves history). B = fresh start at 12/31 with open balances only. C = DIY conversion.", systems: ["QBD", "QBO"], owner: JULIE, helpers: "CPA", startDate: "2026-11-02", dueDate: "2026-11-06", recommendation: "A — paid full conversion, with a test migration first. Fall back to B (fresh start) if the test shows heavy or unexplained differences. Don't do C on a holiday timeline." },
  { type: "Decision", name: "Discount reporting", description: "QBO can't post each of our 22 discount reasons to its own account — all discounts go to one Discount Income / Expense pair.", systems: ["QBO", "Fishbowl", "Portal"], owner: "CPA", helpers: "Julie", startDate: "2026-11-02", dueDate: "2026-12-04", recommendation: "Accept the single Discount Income/Expense pair in QBO and report discounts by reason from Fishbowl or the portal." },
  { type: "Decision", name: "Fill-cost treatment", description: "177 fill parts post inventory and COGS to \"FB Fill Costs Accrual\" (a liability). Keep it, or move fills to Inventory Asset / COGS before go-live.", systems: ["Fishbowl", "QBD", "QBO"], owner: "CPA", helpers: "Blake", startDate: "2026-11-02", dueDate: "2026-12-04", recommendation: "Settle the accrual's balance before cutover and point fills at Inventory Asset / COGS like every other part, unless the CPA has a reason to keep the liability." },
  { type: "Decision", name: "Payroll, sales tax and 1099s", description: "Conversion does not move payroll. Confirm the payroll provider, how sales tax is filed, and who issues 2026 1099s from which file.", systems: ["Payroll", "QBD", "QBO"], owner: JULIE, helpers: "CPA", startDate: "2026-11-02", dueDate: "2026-11-06", recommendation: "Settle this by Nov 6 — a payroll gap in January is the risk. Issue 2026 1099s from whichever file holds 2026 (QBO with approach A)." },
  { type: "Decision", name: "Who gets QBO access", description: "Plus allows 5 named users plus 2 accountants. The Fishbowl connection needs a QBO admin user.", systems: ["QBO", "Fishbowl"], owner: JULIE, startDate: "2026-11-02", dueDate: "2026-11-06", recommendation: "Julie, Blake and the bookkeeper as users; the CPA on an accountant seat. Blake is the QBO admin who connects Fishbowl." },
  { type: "Decision", name: "Keep a QBD license for history", description: "Needed to open the 2026-and-earlier file after cutover (audits, taxes).", systems: ["QBD"], owner: JULIE, startDate: "2026-11-02", dueDate: "2026-11-06", recommendation: "Yes — keep one QBD license. Essential with a fresh start (B), still useful with A for audits." },
  { type: "Clean-up", name: "Check the QBD target count (F2)", description: "Must be under 2,500,000 for the paid conversion.", systems: ["QBD"], owner: "Bookkeeper", startDate: "2026-11-02", dueDate: "2026-11-06" },
  { type: "Clean-up", name: "Run Verify / Rebuild Data in QBD", description: "Data corruption makes post-conversion differences larger.", systems: ["QBD"], owner: "Bookkeeper", startDate: "2026-11-02", dueDate: "2026-11-06" },
  { type: "Decision", name: "Reply to Fishbowl and buy QBO", description: "Send our choices to Fishbowl's Intuit solution specialist and purchase.", systems: ["QBO"], owner: JULIE, startDate: "2026-11-05", dueDate: "2026-11-06" },
  { type: "Clean-up", name: "List everything else connected to QBD", description: "Bank feeds, payroll, bill pay, add-ons. Each needs a QBO plan.", systems: ["QBD", "Banks", "Payroll"], owner: JULIE, startDate: "2026-11-02", dueDate: "2026-11-06" },
  { type: "Milestone", name: "Decisions made, QBO bought", systems: ["QBO"], owner: JULIE, startDate: null, dueDate: "2026-11-06" },

  // ── Clean up · Nov 9 – 13 ──
  { type: "Migration", name: "Book the test migration for Nov 16", description: "Needs at least 1 week's notice.", systems: ["QBD", "QBO"], owner: JULIE, startDate: "2026-11-09", dueDate: "2026-11-09" },
  { type: "Clean-up", name: "Fix the $3,808,441 cost-of-goods posting", mustFix: true, description: "SO 23786 (Harvest To Home / Funky Zebra), posted Apr 29, 2026 as Dr 50000 COGS / Cr 12101 Inventory Asset. Every other shipment this year posted a few cents to $326. Correct the cost in Fishbowl and the entry in QBD.", systems: ["Fishbowl", "QBD"], owner: "CPA", helpers: "Blake", startDate: "2026-11-09", dueDate: "2026-11-13", recommendation: "Fix before the test migration — otherwise the bad entry converts into QBO and every balance comparison is off by $3.8M." },
  { type: "Clean-up", name: "Tie Inventory Asset to Fishbowl", description: "Fishbowl values inventory at about $406,160 (Oct 29). Compare to QBD account 12101 and explain the difference.", systems: ["Fishbowl", "QBD"], owner: "CPA", startDate: "2026-11-09", dueDate: "2026-11-13" },
  { type: "Clean-up", name: "Reconcile banks and cards through Oct 31", description: "Then Nov 30, then Dec 31.", systems: ["QBD", "Banks"], owner: "Bookkeeper", startDate: "2026-11-09", dueDate: "2026-11-13" },
  { type: "Clean-up", name: "Clean AR and AP aging", description: "Apply stray payments and credits, write off what won't be collected, clear old open bills.", systems: ["QBD"], owner: "Bookkeeper", startDate: "2026-11-09", dueDate: "2026-11-13" },
  { type: "Clean-up", name: "Clear Undeposited Funds", description: "Every payment should be matched to a deposit.", systems: ["QBD"], owner: "Bookkeeper", startDate: "2026-11-09", dueDate: "2026-11-13" },
  { type: "Clean-up", name: "Inactivate unused accounts, items, customers and vendors", description: "Fewer lists means a cleaner conversion and a smaller target count.", systems: ["QBD"], owner: "Bookkeeper", startDate: "2026-11-09", dueDate: "2026-11-13" },
  { type: "Fishbowl", name: "Export and save the Default Account Mapping report", description: "Fishbowl → Accounting Integration. Keep a copy with this plan.", systems: ["Fishbowl"], owner: BLAKE, startDate: "2026-11-09", dueDate: "2026-11-13" },
  { type: "Fishbowl", name: "Export the Part, Product & Vendor Pricing (PPVP) CSV", description: "Preserves the part- and product-level account overrides (testers, displays, fills).", systems: ["Fishbowl"], owner: BLAKE, startDate: "2026-11-09", dueDate: "2026-11-13" },
  { type: "QBO setup", name: "Set up QBO company basics", description: "Users, class tracking on (13 classes), custom transaction numbers on — otherwise QBO ignores the Fishbowl SO number.", systems: ["QBO"], owner: "Bookkeeper", startDate: "2026-11-09", dueDate: "2026-11-13", recommendation: "Turn on custom transaction numbers so the invoice number = the Fishbowl SO number." },

  // ── Test · Nov 16 – 20 ──
  { type: "Migration", name: "Test migration runs", description: "1–3 business days; work continues in QBD.", systems: ["QBD", "QBO"], owner: "Fishbowl", startDate: "2026-11-16", dueDate: "2026-11-20" },
  { type: "Fishbowl", name: "Hosted server RAM upgrade and API update", description: "From the Oct 22 call. Finish well before cutover.", systems: ["Fishbowl"], owner: "Fishbowl", helpers: "Blake", startDate: "2026-11-16", dueDate: "2026-11-20", recommendation: "Do it in November, away from cutover week, so any breakage is found early." },
  { type: "Fishbowl", name: "Retest the portal's Fishbowl syncs and order push", description: "After the RAM/API work: order push, inventory and sales syncs.", systems: ["Fishbowl", "Portal"], owner: BLAKE, startDate: "2026-11-18", dueDate: "2026-11-20" },
  { type: "Fishbowl", name: "Draft the Fishbowl → QBO mapping worksheet", description: "Each Fishbowl default (Inventory Asset, COGS, AR, AP, sales, shipping income, discounts, adjustment, scrap, variance, undeposited funds) → its QBO account.", systems: ["Fishbowl", "QBO"], owner: BLAKE, helpers: "CPA", startDate: "2026-11-16", dueDate: "2026-11-20" },
  { type: "Milestone", name: "Test migration complete", systems: ["QBO"], owner: "Fishbowl", startDate: null, dueDate: "2026-11-20" },

  // ── Review · Nov 23 – 25 ──
  { type: "Migration", name: "Compare QBD vs test QBO", description: "Trial balance, balance sheet, P&L, AR/AP aging, Inventory Asset. Log every difference and its fix.", systems: ["QBD", "QBO"], owner: "CPA", helpers: "Julie", startDate: "2026-11-23", dueDate: "2026-11-25" },
  { type: "Milestone", name: "Go / no-go on approach A", description: "Switch to B if the differences are heavy or unexplained.", systems: ["QBO"], owner: JULIE, helpers: "CPA", startDate: null, dueDate: "2026-11-25", recommendation: "Go with A if the CPA can explain and fix every difference; otherwise switch to B now, not in January." },

  // ── Prepare · Nov 30 – Dec 11 ──
  { type: "Clean-up", name: "Close November in QBD", description: "Reconcile and review.", systems: ["QBD", "Banks"], owner: "Bookkeeper", startDate: "2026-11-30", dueDate: "2026-12-04" },
  { type: "Fishbowl", name: "Finalize the mapping worksheet and QBO item plan", systems: ["Fishbowl", "QBO"], owner: BLAKE, helpers: "CPA", startDate: "2026-11-30", dueDate: "2026-12-04" },
  { type: "Fishbowl", name: "Make the Fishbowl changes for discounts and fills", description: "Per the discount-reporting and fill-cost decisions.", systems: ["Fishbowl"], owner: BLAKE, startDate: "2026-11-30", dueDate: "2026-12-04" },
  { type: "Migration", name: "Request the go-live migration slot for Mon Jan 4", description: "Option A only.", systems: ["QBO"], owner: JULIE, startDate: "2026-11-30", dueDate: "2026-12-04" },
  { type: "Training", name: "QBO training for daily users", description: "Fishbowl / Intuit on-demand training.", systems: ["QBO"], owner: JULIE, helpers: "Bookkeeper", startDate: "2026-12-07", dueDate: "2026-12-11" },
  { type: "Training", name: "Write the one-page \"how we do it in QBO\"", description: "Deposits, bills, reconciling.", systems: ["QBO"], owner: "Bookkeeper", startDate: "2026-12-07", dueDate: "2026-12-11" },
  { type: "QBO setup", name: "Build the portal changes for 2027", description: "Inventory Journal as a check, QuickBooks Connection reading QBO, account names on Stripe and Amazon entries, Sage's notes.", systems: ["Portal", "QBO"], owner: BLAKE, startDate: "2026-12-07", dueDate: "2026-12-11" },

  // ── Confirm · Dec 14 – 18 ──
  { type: "Milestone", name: "Go-live slot confirmed with Fishbowl", description: "Needs at least 1 week's notice.", systems: ["QBO"], owner: JULIE, startDate: null, dueDate: "2026-12-18" },
  { type: "Year-end", name: "Year-end prep", description: "1099 vendor list, payroll year-end plan, 12/31 inventory count plan (Point B count vs Fishbowl).", systems: ["Payroll", "Point B", "Fishbowl"], owner: JULIE, helpers: "CPA, Blake", startDate: "2026-12-14", dueDate: "2026-12-18" },
  { type: "Training", name: "Tell staff the freeze window", description: "No QBD work from Dec 31 evening until told.", systems: ["QBD"], owner: JULIE, startDate: "2026-12-14", dueDate: "2026-12-18" },

  // ── Ready · Dec 21 – 24 ──
  { type: "Clean-up", name: "Reconcile banks and cards through Nov 30; final AR/AP clean-up", systems: ["QBD", "Banks"], owner: "Bookkeeper", startDate: "2026-12-21", dueDate: "2026-12-24" },
  { type: "Migration", name: "Walk through the cutover runbook (Dec 31 – Jan 6)", description: "With everyone involved.", systems: ["QBD", "QBO", "Fishbowl"], owner: BLAKE, startDate: "2026-12-21", dueDate: "2026-12-24" },

  // ── Cutover · Dec 28 – 31 ──
  { type: "Year-end", name: "Year-end inventory count / Point B reconciliation", systems: ["Point B", "Fishbowl"], owner: BLAKE, startDate: "2026-12-31", dueDate: "2026-12-31" },
  { type: "Fishbowl", name: "Last Fishbowl → QBD export at 6 PM; queue empty", description: "Check that nothing is left \"Entered\" for 2026.", systems: ["Fishbowl", "QBD"], owner: BLAKE, startDate: "2026-12-31", dueDate: "2026-12-31" },
  { type: "Migration", name: "Full QBD backup (.qbb) saved in two places; freeze QBD", systems: ["QBD"], owner: "Bookkeeper", startDate: "2026-12-31", dueDate: "2026-12-31" },
  { type: "Milestone", name: "QBO is the book of record for 2027", description: "Fishbowl keeps working; its postings wait in its queue.", systems: ["QBO"], owner: JULIE, startDate: null, dueDate: "2027-01-01" },

  // ── Go live · Jan 4 – 6 ──
  { type: "Migration", name: "Go-live migration (A) or enter opening lists (B)", description: "A: users out of QBD for 1–3 business days. B: enter lists, open invoices and bills in QBO.", systems: ["QBD", "QBO"], owner: "Fishbowl", helpers: "Bookkeeper", startDate: "2027-01-04", dueDate: "2027-01-06" },
  { type: "Fishbowl", name: "Disconnect Fishbowl from QBD, connect to QBO", description: "Run Fishbowl's integration wizard as a QBO admin; fetch QuickBooks accounts, then map every default from the worksheet.", systems: ["Fishbowl", "QBO"], owner: BLAKE, startDate: "2027-01-06", dueDate: "2027-01-06" },
  { type: "Fishbowl", name: "Re-check part and product overrides", description: "Testers, displays, fills, and the four one-offs (shipping charge, freight in, plates & dies, rep samples).", systems: ["Fishbowl", "QBO"], owner: BLAKE, startDate: "2027-01-06", dueDate: "2027-01-06" },
  { type: "Fishbowl", name: "Align QBO items with Fishbowl", description: "In QBO an item's own accounts can override Fishbowl's mapping. Reclassify converted inventory items as Fishbowl advises.", systems: ["Fishbowl", "QBO"], owner: BLAKE, helpers: "Bookkeeper", startDate: "2027-01-06", dueDate: "2027-01-06", recommendation: "Always create and change parts and products in Fishbowl first — never edit item accounts directly in QBO." },
  { type: "Fishbowl", name: "Export the queued January postings and spot-check", description: "Invoices, their cost-of-goods entries, payments and an adjustment: right accounts, right class, SO number as invoice number.", systems: ["Fishbowl", "QBO"], owner: BLAKE, helpers: "Bookkeeper", startDate: "2027-01-06", dueDate: "2027-01-06" },
  { type: "QBO setup", name: "Connect bank feeds in QBO", systems: ["QBO", "Banks"], owner: "Bookkeeper", startDate: "2027-01-04", dueDate: "2027-01-06" },
  { type: "Milestone", name: "Fishbowl posting to QBO", systems: ["Fishbowl", "QBO"], owner: BLAKE, startDate: null, dueDate: "2027-01-06" },

  // ── Settle · Jan 7 – 15 ──
  { type: "Migration", name: "Intuit post-migration tasks; tie opening balances", description: "Compare QBO opening balances to the QBD 12/31 trial balance.", systems: ["QBO", "QBD"], owner: "Bookkeeper", helpers: "CPA", startDate: "2027-01-07", dueDate: "2027-01-15" },
  { type: "Clean-up", name: "Reconcile the first week of 2027 in QBO", systems: ["QBO", "Banks"], owner: "Bookkeeper", startDate: "2027-01-07", dueDate: "2027-01-15" },
  { type: "QBO setup", name: "Switch the portal's accounting pages to QBO mode", description: "Stop booking the Inventory Journal entry — Fishbowl now posts COGS to QBO.", systems: ["Portal", "QBO"], owner: BLAKE, startDate: "2027-01-07", dueDate: "2027-01-15", recommendation: "The portal's Inventory Journal becomes a check only, so cost of goods is never counted twice." },

  // ── Close 2026 · Jan 18 – 29 ──
  { type: "Year-end", name: "CPA year-end adjustments for 2026", description: "A: in QBO dated 12/31. B: in QBD, then opening balances into QBO.", systems: ["QBO", "QBD"], owner: "CPA", startDate: "2027-01-18", dueDate: "2027-01-29" },
  { type: "Year-end", name: "1099s and payroll year-end filings", systems: ["Payroll", "QBO"], owner: "CPA", helpers: "Julie", startDate: "2027-01-18", dueDate: "2027-01-29" },
  { type: "Year-end", name: "Set QBD to read-only archive", description: "Keep the license for history.", systems: ["QBD"], owner: "Bookkeeper", startDate: "2027-01-25", dueDate: "2027-01-29" },
  { type: "Fishbowl", name: "Set 90-day Fishbowl ↔ QBO re-authorization reminders", description: "QBO requires it. Suggested: Apr 1, Jul 1, Sep 29, Dec 28, 2027.", systems: ["Fishbowl", "QBO"], owner: BLAKE, startDate: "2027-01-18", dueDate: "2027-01-29", recommendation: "Put them on the calendar now — an expired authorization stops postings silently." },
  { type: "Milestone", name: "2026 closed, opening balances tie, QBD archived", systems: ["QBO", "QBD"], owner: "CPA", helpers: "Julie", startDate: null, dueDate: "2027-01-29" },
];

export const SEED: QboTask[] = PLAN.map((t, i) => ({
  ...t,
  description: t.description ?? null,
  helpers: t.helpers ?? null,
  recommendation: t.recommendation ?? null,
  mustFix: !!t.mustFix,
  status: "todo",
  notes: null,
  sort: (i + 1) * 10,
}));

/** Days from today (local) to a YYYY-MM-DD date; negative = past. */
export function daysUntil(date: string, today = new Date()): number {
  const [y, m, d] = date.split("-").map(Number);
  const a = Date.UTC(y, m - 1, d);
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86_400_000);
}
