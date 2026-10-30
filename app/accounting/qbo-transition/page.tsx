"use client";

import Link from "next/link";
import clsx from "clsx";


import PageMeta from "@/components/PageMeta";

/* The QuickBooks Desktop → QuickBooks Online transition plan (Oct 30, 2026):
   decisions, pricing, migration approach, clean-up and Fishbowl switch-over
   checklists, and the week-by-week calendar to a Jan 1, 2027 go-live. Static
   content — facts were read from Fishbowl on Oct 30 (see the QuickBooks
   Connection page for the live view) and pricing is from Fishbowl/Intuit's
   Oct 29 email. */

type Item = { title: string; detail: string; who: string; flag?: "fix" };

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

const DECISIONS: Item[] = [
  { title: "Plan: Plus or Advanced", detail: "Plus fits our account and class counts; Advanced if we need more than 5 users, custom roles or higher limits.", who: "Julie + CPA" },
  { title: "Term: 1, 2 or 3 years", detail: "Longer terms save more, but there are no refunds on cancellation. Recommend 1 year for the first year on QBO.", who: "Julie" },
  { title: "Migration approach: full history or fresh start", detail: "See options below. This drives the calendar's January steps.", who: "Julie + CPA" },
  { title: "Discount reporting", detail: "Accept one Discount Income/Expense pair in QBO, or report discounts by reason from Fishbowl or the portal instead.", who: "CPA" },
  { title: "Fill costs", detail: "Keep fills posting to \"FB Fill Costs Accrual\" (liability), or move them to Inventory Asset / COGS before go-live.", who: "CPA" },
  { title: "Payroll, sales tax and 1099s", detail: "Confirm whether payroll runs in QBD (conversion does not move payroll), how sales tax is filed, and who issues 2026 1099s from which file.", who: "Julie + CPA" },
  { title: "Who gets QBO access", detail: "Named users (Plus: 5, plus 2 accountants). The Fishbowl connection needs a QBO admin user.", who: "Julie" },
  { title: "Keep a QBD license for history", detail: "Needed to open the 2026-and-earlier file after cutover (audits, taxes), especially with a fresh start.", who: "Julie" },
];

const PRICING: { plan: string; term: string; msrp: string; disc: string; price: string; perYear: string; rec?: boolean }[] = [
  { plan: "QBO Plus", term: "1 year", msrp: "$1,680.00", disc: "$325.00", price: "$1,355.00", perYear: "$1,355", rec: true },
  { plan: "QBO Plus", term: "2 years", msrp: "$3,360.00", disc: "$500.00", price: "$2,860.00", perYear: "$1,430" },
  { plan: "QBO Plus", term: "3 years", msrp: "$5,040.00", disc: "$600.00", price: "$4,440.00", perYear: "$1,480" },
  { plan: "QBO Advanced", term: "1 year", msrp: "$4,080.00", disc: "$1,000.00", price: "$3,080.00", perYear: "$3,080" },
  { plan: "QBO Advanced", term: "2 years", msrp: "$8,160.00", disc: "$1,625.00", price: "$6,535.00", perYear: "$3,268" },
  { plan: "QBO Advanced", term: "3 years", msrp: "$12,240.00", disc: "$1,825.00", price: "$10,415.00", perYear: "$3,472" },
  { plan: "Data conversion (QBD → QBO)", term: "One time", msrp: "—", disc: "—", price: "$1,000.00", perYear: "per company file" },
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

const CLEANUP: Item[] = [
  { title: "Fix the $3,808,441 cost-of-goods posting", flag: "fix", detail: "SO 23786 (Harvest To Home / Funky Zebra), posted Apr 29, 2026 as Dr 50000 COGS / Cr 12101 Inventory Asset. Every other shipment this year posted a few cents to $326. Correct the cost in Fishbowl and the entry in QBD.", who: "CPA + Blake" },
  { title: "Tie Inventory Asset to Fishbowl", detail: "Fishbowl values inventory at about $406,160 (Oct 29). Compare to QBD account 12101 and explain the difference.", who: "CPA" },
  { title: "Decide the fill-cost accrual", detail: "177 fill parts post to \"FB Fill Costs Accrual\". Settle its balance and treatment before cutover.", who: "CPA" },
  { title: "Reconcile every bank and credit card through Oct 31", detail: "Then Nov 30, then Dec 31.", who: "Bookkeeper" },
  { title: "Clean AR and AP aging", detail: "Apply stray payments and credits, write off what won't be collected, clear old open bills.", who: "Bookkeeper" },
  { title: "Clear Undeposited Funds", detail: "Every payment should be matched to a deposit.", who: "Bookkeeper" },
  { title: "Inactivate unused accounts, items, customers and vendors", detail: "Fewer lists means a cleaner conversion and a smaller target count.", who: "Bookkeeper" },
  { title: "Check the file's target count (F2)", detail: "Must be under 2,500,000 for the paid conversion.", who: "Bookkeeper" },
  { title: "Run Verify / Rebuild Data in QBD", detail: "Data corruption makes post-conversion differences larger.", who: "Bookkeeper" },
  { title: "List everything else connected to QBD", detail: "Bank feeds, payroll, bill pay, add-ons. Each needs a QBO plan.", who: "Julie" },
];

const FB_BEFORE: Item[] = [
  { title: "Export and save the Default Account Mapping report", detail: "Fishbowl → Accounting Integration. Keep a copy with this plan.", who: "Blake" },
  { title: "Export the Part, Product & Vendor Pricing (PPVP) CSV", detail: "Preserves the part- and product-level account overrides (testers, displays, fills).", who: "Blake" },
  { title: "Write the mapping worksheet", detail: "Each Fishbowl default (Inventory Asset, COGS, AR, AP, sales, shipping income, discounts, adjustment, scrap, variance, undeposited funds) → its QBO account.", who: "Blake + CPA" },
  { title: "Hosted server RAM and API update done in November", detail: "From the Oct 22 call. Finish well before cutover, then retest the portal's order push, inventory and sales syncs.", who: "Fishbowl + Blake" },
  { title: "Final export Dec 31 at 6 PM, and the queue is empty", detail: "Check that nothing is left \"Entered\" for 2026.", who: "Blake" },
];

const FB_CONNECT: Item[] = [
  { title: "QBO: turn on custom transaction numbers", detail: "Otherwise QBO ignores the Fishbowl SO number and numbers invoices itself.", who: "Bookkeeper" },
  { title: "QBO: turn on class tracking", detail: "Set up the 13 classes (they come across with option A).", who: "Bookkeeper" },
  { title: "Run Fishbowl's integration wizard for QBO as a QBO admin", detail: "Fetch QuickBooks accounts, then map every default from the worksheet.", who: "Blake" },
  { title: "Re-check part and product overrides", detail: "Testers, displays, fills, and the four one-offs (shipping charge, freight in, plates & dies, rep samples).", who: "Blake" },
  { title: "Align QBO items with Fishbowl", detail: "In QBO an item's own accounts can override Fishbowl's mapping. Create and change parts and products in Fishbowl first; reclassify converted inventory items as Fishbowl advises.", who: "Blake + Bookkeeper" },
  { title: "Export the queued January postings and spot-check", detail: "Five invoices, their cost-of-goods entries, two payments and one adjustment: right accounts, right class, SO number as invoice number.", who: "Blake + Bookkeeper" },
  { title: "Set reminders to re-authorize Fishbowl ↔ QBO every ~90 days", detail: "QBO requires it. Suggested: Apr 1, Jul 1, Sep 29, Dec 28, 2027.", who: "Blake" },
];

const CALENDAR: { phase: string; dates: string; tasks: string[]; milestone?: string; owners: string; kind?: "mile" | "freeze" }[] = [
  { phase: "Decide", dates: "Nov 2 – 6", owners: "Julie", milestone: "Decisions made, QBO bought (Fri Nov 6)", tasks: [
    "Kickoff with the CPA: plan, term, approach A or B, discounts, fills, payroll, sales tax, 1099s.",
    "Check the QBD target count (F2) and run Verify Data.",
    "Reply to Fishbowl (our Intuit solution specialist) with the choices; buy QBO.",
    "List everything connected to QBD (bank feeds, payroll, add-ons).",
  ] },
  { phase: "Clean up", dates: "Nov 9 – 13", owners: "Bookkeeper · CPA · Blake", tasks: [
    "Book the test migration for Nov 16 (needs 1 week's notice).",
    "Fix the $3.8M COGS posting on SO 23786; tie Inventory Asset to Fishbowl.",
    "Reconcile banks and cards through Oct 31; clean AR/AP aging; clear Undeposited Funds.",
    "Inactivate unused accounts, items, customers and vendors.",
    "Export the Default Account Mapping report and PPVP CSV.",
    "Set up the QBO company basics: users, classes on, custom transaction numbers on.",
  ] },
  { phase: "Test", dates: "Nov 16 – 20", owners: "Fishbowl", kind: "mile", milestone: "Test migration complete", tasks: [
    "Test migration runs (1–3 business days); work continues in QBD.",
    "Fishbowl hosted RAM upgrade and API update; Blake retests the portal's Fishbowl syncs and order push.",
    "Draft the Fishbowl → QBO mapping worksheet.",
  ] },
  { phase: "Review", dates: "Nov 23 – 25", owners: "CPA + Julie", kind: "mile", milestone: "Approach confirmed (Wed Nov 25)", tasks: [
    "Compare QBD vs test QBO: trial balance, balance sheet, P&L, AR/AP aging, Inventory Asset.",
    "CPA logs every difference and its fix.",
    "Go / no-go on approach A; switch to B if the differences are heavy or unexplained.",
  ] },
  { phase: "Prepare", dates: "Nov 30 – Dec 4", owners: "CPA · Blake · Julie", tasks: [
    "Close November in QBD (reconcile, review).",
    "Finalize the mapping worksheet and the QBO item plan with the CPA.",
    "Decide discount reporting and the fill-cost treatment; make the Fishbowl changes.",
    "Request the go-live migration slot for Mon Jan 4 (option A).",
  ] },
  { phase: "Prepare", dates: "Dec 7 – 11", owners: "Julie · Blake · Bookkeeper", tasks: [
    "QBO training for the people who will use it (Fishbowl / Intuit on-demand training).",
    "Blake builds the portal changes for 2027: Inventory Journal as a check, QuickBooks Connection reading QBO, account names on Stripe and Amazon entries, Sage's notes.",
    "Write the one-page \"how we do it in QBO\" for daily work (deposits, bills, reconciling).",
  ] },
  { phase: "Confirm", dates: "Dec 14 – 18", owners: "Julie", kind: "mile", milestone: "Go-live slot confirmed", tasks: [
    "Go-live slot confirmed with Fishbowl (Fri Dec 18 latest).",
    "Year-end prep: 1099 vendor list, payroll year-end plan, 12/31 inventory count plan (Point B count vs Fishbowl).",
    "Tell staff the freeze window: no QBD work from Dec 31 evening until told.",
  ] },
  { phase: "Ready", dates: "Dec 21 – 24", owners: "All", tasks: [
    "Reconcile banks and cards through Nov 30; final AR/AP clean-up.",
    "Walk through the cutover runbook (Dec 31 – Jan 6) with everyone involved.",
  ] },
  { phase: "Cutover", dates: "Dec 28 – 31", owners: "Blake + Bookkeeper", kind: "freeze", milestone: "QBD frozen after the 6 PM export (Thu Dec 31)", tasks: [
    "Business as usual in QBD through Dec 31.",
    "Dec 31: year-end inventory count / Point B reconciliation; last Fishbowl → QBD export at 6 PM; confirm nothing is left in the queue.",
    "Full QBD backup (.qbb) saved in two places; QBD frozen.",
  ] },
  { phase: "Go live", dates: "Jan 1 – 6", owners: "Blake + Bookkeeper", kind: "mile", milestone: "Fishbowl posting to QBO (Wed Jan 6)", tasks: [
    "Jan 1: QBO is the book of record for all 2027 activity. Fishbowl keeps working; its postings wait in its queue.",
    "Jan 4 – 6 (A): go-live migration (users out of QBD). (B): enter lists, open invoices and bills in QBO.",
    "After the migration: disconnect Fishbowl from QBD, connect to QBO, run the wizard, map accounts, re-check overrides, export the queued postings, spot-check.",
    "Connect bank feeds in QBO.",
  ] },
  { phase: "Settle", dates: "Jan 7 – 15", owners: "Bookkeeper · CPA · Blake", tasks: [
    "Intuit's post-migration tasks; compare QBO opening balances to the QBD 12/31 trial balance.",
    "Reconcile the first week of 2027 in QBO.",
    "Switch the portal's accounting pages to QBO mode.",
  ] },
  { phase: "Close 2026", dates: "Jan 18 – 29", owners: "CPA + Julie", kind: "mile", milestone: "2026 closed, opening balances tie, QBD archived (Fri Jan 29)", tasks: [
    "CPA year-end adjustments for 2026 (A: in QBO dated 12/31; B: in QBD, then opening balances into QBO).",
    "1099s and payroll year-end filings.",
    "Set QBD to read-only archive; keep the license for history.",
    "Set the 90-day Fishbowl re-authorization reminders.",
  ] },
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
  ["dates", "Key dates"],
  ["today", "Where we are"],
  ["decisions", "Decisions"],
  ["plans", "Plans & pricing"],
  ["approach", "Migration approach"],
  ["cleanup", "Clean-up"],
  ["fishbowl", "Fishbowl switch-over"],
  ["calendar", "Calendar"],
  ["after", "After go-live"],
  ["risks", "Risks"],
  ["contacts", "Contacts"],
] as const;

export default function QboTransitionPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-6 md:px-8">
      <PageMeta
        title="QBO Transition"
        description="Plan, decisions, checklists and calendar for moving from QuickBooks Desktop to QuickBooks Online by January 1, 2027."
      />

      <header className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-teal-700">Accounting · Plan prepared Oct 30, 2026</div>
        <h1 className="text-2xl font-bold text-gray-900">Moving from QuickBooks Desktop to QuickBooks Online</h1>
        <p className="max-w-3xl text-[15px] text-gray-600">
          Plan, options, checklists and a week-by-week calendar so every 2027 transaction is booked in QuickBooks Online, with Fishbowl
          posting to it, starting <b className="text-gray-900">January 1, 2027</b>. See{" "}
          <Link href="/accounting/quickbooks-connection" className="font-medium text-teal-700 hover:underline">
            QuickBooks Connection
          </Link>{" "}
          for what Fishbowl sends today.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
          <span>Decisions <b className="text-gray-800">Julie Ekelund</b></span>
          <span>Systems <b className="text-gray-800">Blake Ekelund</b></span>
          <span>Books <b className="text-gray-800">CPA / bookkeeper</b></span>
          <span>Vendor <b className="text-gray-800">Fishbowl (account manager + Intuit solution specialist)</b></span>
        </div>
        <nav className="flex flex-wrap gap-1.5 pt-1" aria-label="Sections">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:border-teal-600">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="dates" title="Key dates">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 sm:grid-cols-4">
          {KEY_DATES.map((d) => (
            <div key={d.date} className={clsx("space-y-0.5 p-3", d.big ? "bg-teal-50" : "bg-white")}>
              <div className="font-mono text-xs font-semibold text-teal-700">{d.date}</div>
              <div className="text-sm font-semibold text-gray-900">{d.what}</div>
              <div className="text-xs text-gray-500">{d.note}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="today" title="Where we are today" intro="Read from Fishbowl on Oct 30, 2026.">
        <Table head={["Area", "Today", "What it means for the move"]} rows={TODAY} />
      </Section>

      <Section id="decisions" title="Decisions to make by Nov 6">
        <Checklist items={DECISIONS} />
      </Section>

      <Section id="plans" title="Plans & pricing" intro="Quoted by Fishbowl's Intuit solution specialist on Oct 29, 2026. Subject to managed-account terms; MSRP applies after the initial period; no refunds on cancellation.">
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
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {p.plan}
                    {p.rec && <span className="ml-2 rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-teal-800">Recommended</span>}
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
        <p className="text-xs text-gray-500">At these discounts, multi-year terms cost slightly more per year than the 1-year term, so 1 year is both the cheapest per year and the most flexible.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Option label="Recommended" title="Plus, 1 year · $1,355" chosen points={["Up to 5 named users + 2 external accountants", "Classes and locations (our 13 classes fit)", "250-account limit (we use about 180)", "Works with Fishbowl's QBO integration"]} />
          <Option label="Choose instead if" title="Advanced, 1 year · $3,080" points={["More than 5 people need their own login", "We want custom user roles and workflow automation", "Premium support, backup and restore, higher usage limits", "We expect to outgrow Plus's limits in 1–2 years"]} />
        </div>
      </Section>

      <Section id="approach" title="Migration approach">
        <div className="grid gap-3 md:grid-cols-3">
          {APPROACHES.map((a) => (
            <Option key={a.label} label={a.label} title={a.title} points={a.points} chosen={a.chosen} />
          ))}
        </div>
        <Callout title="How we choose between A and B">
          Run the test migration (A) in mid-November. If the CPA finds the converted balances tie out with fixable differences, go live with A.
          If the test shows heavy or unexplained differences, switch to B. The calendar works for both up to Dec 31; the January steps differ
          only where marked.
        </Callout>
      </Section>

      <Section id="cleanup" title="Clean up QuickBooks Desktop first" intro="Problems in QBD travel into QBO. Finish these before the test migration where possible, and all of them before Dec 31.">
        <Checklist items={CLEANUP} />
      </Section>

      <Section id="fishbowl" title="Fishbowl switch-over checklist" intro="Fishbowl keeps its postings queued until it's connected again, so nothing is lost between Dec 31 and reconnection.">
        <h3 className="pt-1 text-sm font-semibold text-gray-900">Before disconnecting from QBD</h3>
        <Checklist items={FB_BEFORE} />
        <h3 className="pt-2 text-sm font-semibold text-gray-900">Connecting to QBO</h3>
        <Checklist items={FB_CONNECT} />
        <Callout title="Don't double-count cost of goods" tone="warn">
          Once Fishbowl posts shipment COGS to QBO, the portal&rsquo;s monthly{" "}
          <Link href="/accounting/inventory-journal" className="font-medium underline">
            Inventory Journal
          </Link>{" "}
          entry must not also be booked for the same months. That page will switch to a checking role for 2027.
        </Callout>
      </Section>

      <Section id="calendar" title="Calendar" intro="Week by week from Nov 2, 2026 to Jan 29, 2027. Holidays: Thanksgiving Nov 26–27, Christmas Dec 25, New Year Jan 1.">
        <div className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {CALENDAR.map((w) => (
            <div key={w.dates} className="grid sm:grid-cols-[150px_1fr]">
              <div
                className={clsx(
                  "space-y-0.5 border-b border-gray-200 p-3 sm:border-b-0 sm:border-r",
                  w.kind === "mile" ? "bg-teal-50" : w.kind === "freeze" ? "bg-amber-50" : "bg-gray-50",
                )}
              >
                <div className={clsx("text-[11px] font-bold uppercase tracking-wider", w.kind === "freeze" ? "text-amber-700" : "text-teal-700")}>
                  {w.phase}
                </div>
                <div className="font-mono text-sm font-semibold text-gray-900">{w.dates}</div>
              </div>
              <div className="space-y-2 p-3">
                <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {w.tasks.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <div className="text-xs text-gray-500">
                  {w.milestone && <b className="text-gray-800">Milestone: {w.milestone} · </b>}
                  {w.owners}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="after" title="After go-live: what changes day to day">
        <Table head={["Task", "In QBD today", "In QBO"]} rows={AFTER} />
      </Section>

      <Section id="risks" title="Risks and how we handle them">
        <Table head={["Risk", "Impact", "Mitigation"]} rows={RISKS} />
      </Section>

      <Section id="contacts" title="Contacts">
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white text-sm">
          {CONTACTS.map((c) => (
            <li key={c.who} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[220px_1fr]">
              <span className="font-semibold text-gray-900">{c.who}</span>
              <span className="text-gray-600">{c.for}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500">
          Names, emails and phone numbers are in Fishbowl&rsquo;s Oct 29, 2026 email to Julie and Blake. Fishbowl does not give accounting
          advice; for a Fishbowl-savvy accountant, its Partner Directory lists consulting partners.
        </p>
      </Section>

      <p className="border-t border-gray-200 pt-4 text-xs text-gray-500">
        Account names, counts and the $3.8M posting were read from Fishbowl on Oct 30, 2026. Pricing and timelines are from Fishbowl&rsquo;s
        Oct 29, 2026 email. Confirm accounting treatments (fills, discounts, year-end entries) with the CPA.
      </p>
    </div>
  );
}

/* ─── Pieces ──────────────────────────────────────────────────────────────── */

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <h2 className="border-b-2 border-gray-900 pb-2 text-lg font-bold text-gray-900">{title}</h2>
      {intro && <p className="max-w-3xl text-sm text-gray-600">{intro}</p>}
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

function Checklist({ items }: { items: Item[] }) {
  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {items.map((i) => (
        <li key={i.title} className="grid grid-cols-[16px_1fr_auto] items-start gap-3 px-3 py-2.5">
          <span className="mt-1 h-3.5 w-3.5 rounded-[3px] border-[1.5px] border-gray-400" aria-hidden />
          <span className="min-w-0 text-sm">
            <span className="font-semibold text-gray-900">{i.title}</span>
            {i.flag === "fix" && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">Must fix</span>}
            <span className="block text-gray-600">{i.detail}</span>
          </span>
          <span className="whitespace-nowrap text-xs font-semibold text-gray-500">{i.who}</span>
        </li>
      ))}
    </ul>
  );
}

function Option({ label, title, points, chosen }: { label: string; title: string; points: string[]; chosen?: boolean }) {
  return (
    <div className={clsx("space-y-2 rounded-xl bg-white p-4", chosen ? "border-2 border-teal-600" : "border border-gray-200")}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
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
