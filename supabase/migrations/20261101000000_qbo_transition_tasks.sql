-- QBO transition checklist (Accounting → QBO Transition).
--
-- One row per task in the QuickBooks Desktop → Online move: type, name,
-- description, systems involved, owner (+ helpers), start/due dates, status,
-- and our recommendation (highlighted on the page). Seeded below with the
-- plan as written Oct 30, 2026 (lib/qboTransition.ts SEED).
--
-- Read and written only through /api/accounting/qbo-transition (service role,
-- internal users), so RLS is on with no policies.

create table if not exists public.qbo_transition_tasks (
  id              uuid primary key default gen_random_uuid(),
  type            text not null,
  name            text not null,
  description     text,
  systems         text[] not null default '{}',
  owner           text,
  helpers         text,
  start_date      date,
  due_date        date,
  status          text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  recommendation  text,
  must_fix        boolean not null default false,
  notes           text,
  sort            integer not null default 0,
  completed_at    timestamptz,
  updated_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists qbo_transition_tasks_sort_idx on public.qbo_transition_tasks (sort);

alter table public.qbo_transition_tasks enable row level security;

comment on table public.qbo_transition_tasks is
  'Editable checklist for the QuickBooks Desktop → Online transition (/accounting/qbo-transition).';

-- The plan as written Oct 30, 2026 (lib/qboTransition.ts SEED). Only when empty.
insert into public.qbo_transition_tasks
  (type, name, description, systems, owner, helpers, start_date, due_date, recommendation, must_fix, sort, updated_by)
select v.* from (values
  ('Decision', 'Kickoff with the CPA', 'Walk through plan, term, approach A or B, discounts, fills, payroll, sales tax and 1099s.', array[]::text[], 'Julie Ekelund', 'CPA, Blake', date '2026-11-02', date '2026-11-03', null, false, 10, 'seed'),
  ('Decision', 'Plan: QBO Plus or Advanced', 'Plus fits our ~180 accounts and 13 classes; Advanced only if more than 5 people need logins, custom roles or higher limits.', array['QBO']::text[], 'Julie Ekelund', 'CPA', date '2026-11-02', date '2026-11-06', 'QBO Plus — $1,355 for the first year. Our 13 classes and ~180 accounts fit; revisit Advanced only if we pass 5 named users.', false, 20, 'seed'),
  ('Decision', 'Term: 1, 2 or 3 years', 'Longer terms cost slightly more per year at these discounts, and there are no refunds on cancellation.', array['QBO']::text[], 'Julie Ekelund', null, date '2026-11-02', date '2026-11-06', '1 year. It is the cheapest per year ($1,355 vs $1,430 / $1,480) and keeps us flexible for the first year on QBO.', false, 30, 'seed'),
  ('Decision', 'Migration approach: full conversion or fresh start', 'A = Fishbowl/Intuit full conversion ($1,000, moves history). B = fresh start at 12/31 with open balances only. C = DIY conversion.', array['QBD', 'QBO']::text[], 'Julie Ekelund', 'CPA', date '2026-11-02', date '2026-11-06', 'A — paid full conversion, with a test migration first. Fall back to B (fresh start) if the test shows heavy or unexplained differences. Don''t do C on a holiday timeline.', false, 40, 'seed'),
  ('Decision', 'Discount reporting', 'QBO can''t post each of our 22 discount reasons to its own account — all discounts go to one Discount Income / Expense pair.', array['QBO', 'Fishbowl', 'Portal']::text[], 'CPA', 'Julie', date '2026-11-02', date '2026-12-04', 'Accept the single Discount Income/Expense pair in QBO and report discounts by reason from Fishbowl or the portal.', false, 50, 'seed'),
  ('Decision', 'Fill-cost treatment', '177 fill parts post inventory and COGS to "FB Fill Costs Accrual" (a liability). Keep it, or move fills to Inventory Asset / COGS before go-live.', array['Fishbowl', 'QBD', 'QBO']::text[], 'CPA', 'Blake', date '2026-11-02', date '2026-12-04', 'Settle the accrual''s balance before cutover and point fills at Inventory Asset / COGS like every other part, unless the CPA has a reason to keep the liability.', false, 60, 'seed'),
  ('Decision', 'Payroll, sales tax and 1099s', 'Conversion does not move payroll. Confirm the payroll provider, how sales tax is filed, and who issues 2026 1099s from which file.', array['Payroll', 'QBD', 'QBO']::text[], 'Julie Ekelund', 'CPA', date '2026-11-02', date '2026-11-06', 'Settle this by Nov 6 — a payroll gap in January is the risk. Issue 2026 1099s from whichever file holds 2026 (QBO with approach A).', false, 70, 'seed'),
  ('Decision', 'Who gets QBO access', 'Plus allows 5 named users plus 2 accountants. The Fishbowl connection needs a QBO admin user.', array['QBO', 'Fishbowl']::text[], 'Julie Ekelund', null, date '2026-11-02', date '2026-11-06', 'Julie, Blake and the bookkeeper as users; the CPA on an accountant seat. Blake is the QBO admin who connects Fishbowl.', false, 80, 'seed'),
  ('Decision', 'Keep a QBD license for history', 'Needed to open the 2026-and-earlier file after cutover (audits, taxes).', array['QBD']::text[], 'Julie Ekelund', null, date '2026-11-02', date '2026-11-06', 'Yes — keep one QBD license. Essential with a fresh start (B), still useful with A for audits.', false, 90, 'seed'),
  ('Clean-up', 'Check the QBD target count (F2)', 'Must be under 2,500,000 for the paid conversion.', array['QBD']::text[], 'Bookkeeper', null, date '2026-11-02', date '2026-11-06', null, false, 100, 'seed'),
  ('Clean-up', 'Run Verify / Rebuild Data in QBD', 'Data corruption makes post-conversion differences larger.', array['QBD']::text[], 'Bookkeeper', null, date '2026-11-02', date '2026-11-06', null, false, 110, 'seed'),
  ('Decision', 'Reply to Fishbowl and buy QBO', 'Send our choices to Fishbowl''s Intuit solution specialist and purchase.', array['QBO']::text[], 'Julie Ekelund', null, date '2026-11-05', date '2026-11-06', null, false, 120, 'seed'),
  ('Clean-up', 'List everything else connected to QBD', 'Bank feeds, payroll, bill pay, add-ons. Each needs a QBO plan.', array['QBD', 'Banks', 'Payroll']::text[], 'Julie Ekelund', null, date '2026-11-02', date '2026-11-06', null, false, 130, 'seed'),
  ('Milestone', 'Decisions made, QBO bought', null, array['QBO']::text[], 'Julie Ekelund', null, null::date, date '2026-11-06', null, false, 140, 'seed'),
  ('Migration', 'Book the test migration for Nov 16', 'Needs at least 1 week''s notice.', array['QBD', 'QBO']::text[], 'Julie Ekelund', null, date '2026-11-09', date '2026-11-09', null, false, 150, 'seed'),
  ('Clean-up', 'Fix the $3,808,441 cost-of-goods posting', 'SO 23786 (Harvest To Home / Funky Zebra), posted Apr 29, 2026 as Dr 50000 COGS / Cr 12101 Inventory Asset. Every other shipment this year posted a few cents to $326. Correct the cost in Fishbowl and the entry in QBD.', array['Fishbowl', 'QBD']::text[], 'CPA', 'Blake', date '2026-11-09', date '2026-11-13', 'Fix before the test migration — otherwise the bad entry converts into QBO and every balance comparison is off by $3.8M.', true, 160, 'seed'),
  ('Clean-up', 'Tie Inventory Asset to Fishbowl', 'Fishbowl values inventory at about $406,160 (Oct 29). Compare to QBD account 12101 and explain the difference.', array['Fishbowl', 'QBD']::text[], 'CPA', null, date '2026-11-09', date '2026-11-13', null, false, 170, 'seed'),
  ('Clean-up', 'Reconcile banks and cards through Oct 31', 'Then Nov 30, then Dec 31.', array['QBD', 'Banks']::text[], 'Bookkeeper', null, date '2026-11-09', date '2026-11-13', null, false, 180, 'seed'),
  ('Clean-up', 'Clean AR and AP aging', 'Apply stray payments and credits, write off what won''t be collected, clear old open bills.', array['QBD']::text[], 'Bookkeeper', null, date '2026-11-09', date '2026-11-13', null, false, 190, 'seed'),
  ('Clean-up', 'Clear Undeposited Funds', 'Every payment should be matched to a deposit.', array['QBD']::text[], 'Bookkeeper', null, date '2026-11-09', date '2026-11-13', null, false, 200, 'seed'),
  ('Clean-up', 'Inactivate unused accounts, items, customers and vendors', 'Fewer lists means a cleaner conversion and a smaller target count.', array['QBD']::text[], 'Bookkeeper', null, date '2026-11-09', date '2026-11-13', null, false, 210, 'seed'),
  ('Fishbowl', 'Export and save the Default Account Mapping report', 'Fishbowl → Accounting Integration. Keep a copy with this plan.', array['Fishbowl']::text[], 'Blake Ekelund', null, date '2026-11-09', date '2026-11-13', null, false, 220, 'seed'),
  ('Fishbowl', 'Export the Part, Product & Vendor Pricing (PPVP) CSV', 'Preserves the part- and product-level account overrides (testers, displays, fills).', array['Fishbowl']::text[], 'Blake Ekelund', null, date '2026-11-09', date '2026-11-13', null, false, 230, 'seed'),
  ('QBO setup', 'Set up QBO company basics', 'Users, class tracking on (13 classes), custom transaction numbers on — otherwise QBO ignores the Fishbowl SO number.', array['QBO']::text[], 'Bookkeeper', null, date '2026-11-09', date '2026-11-13', 'Turn on custom transaction numbers so the invoice number = the Fishbowl SO number.', false, 240, 'seed'),
  ('Migration', 'Test migration runs', '1–3 business days; work continues in QBD.', array['QBD', 'QBO']::text[], 'Fishbowl', null, date '2026-11-16', date '2026-11-20', null, false, 250, 'seed'),
  ('Fishbowl', 'Hosted server RAM upgrade and API update', 'From the Oct 22 call. Finish well before cutover.', array['Fishbowl']::text[], 'Fishbowl', 'Blake', date '2026-11-16', date '2026-11-20', 'Do it in November, away from cutover week, so any breakage is found early.', false, 260, 'seed'),
  ('Fishbowl', 'Retest the portal''s Fishbowl syncs and order push', 'After the RAM/API work: order push, inventory and sales syncs.', array['Fishbowl', 'Portal']::text[], 'Blake Ekelund', null, date '2026-11-18', date '2026-11-20', null, false, 270, 'seed'),
  ('Fishbowl', 'Draft the Fishbowl → QBO mapping worksheet', 'Each Fishbowl default (Inventory Asset, COGS, AR, AP, sales, shipping income, discounts, adjustment, scrap, variance, undeposited funds) → its QBO account.', array['Fishbowl', 'QBO']::text[], 'Blake Ekelund', 'CPA', date '2026-11-16', date '2026-11-20', null, false, 280, 'seed'),
  ('Milestone', 'Test migration complete', null, array['QBO']::text[], 'Fishbowl', null, null::date, date '2026-11-20', null, false, 290, 'seed'),
  ('Migration', 'Compare QBD vs test QBO', 'Trial balance, balance sheet, P&L, AR/AP aging, Inventory Asset. Log every difference and its fix.', array['QBD', 'QBO']::text[], 'CPA', 'Julie', date '2026-11-23', date '2026-11-25', null, false, 300, 'seed'),
  ('Milestone', 'Go / no-go on approach A', 'Switch to B if the differences are heavy or unexplained.', array['QBO']::text[], 'Julie Ekelund', 'CPA', null::date, date '2026-11-25', 'Go with A if the CPA can explain and fix every difference; otherwise switch to B now, not in January.', false, 310, 'seed'),
  ('Clean-up', 'Close November in QBD', 'Reconcile and review.', array['QBD', 'Banks']::text[], 'Bookkeeper', null, date '2026-11-30', date '2026-12-04', null, false, 320, 'seed'),
  ('Fishbowl', 'Finalize the mapping worksheet and QBO item plan', null, array['Fishbowl', 'QBO']::text[], 'Blake Ekelund', 'CPA', date '2026-11-30', date '2026-12-04', null, false, 330, 'seed'),
  ('Fishbowl', 'Make the Fishbowl changes for discounts and fills', 'Per the discount-reporting and fill-cost decisions.', array['Fishbowl']::text[], 'Blake Ekelund', null, date '2026-11-30', date '2026-12-04', null, false, 340, 'seed'),
  ('Migration', 'Request the go-live migration slot for Mon Jan 4', 'Option A only.', array['QBO']::text[], 'Julie Ekelund', null, date '2026-11-30', date '2026-12-04', null, false, 350, 'seed'),
  ('Training', 'QBO training for daily users', 'Fishbowl / Intuit on-demand training.', array['QBO']::text[], 'Julie Ekelund', 'Bookkeeper', date '2026-12-07', date '2026-12-11', null, false, 360, 'seed'),
  ('Training', 'Write the one-page "how we do it in QBO"', 'Deposits, bills, reconciling.', array['QBO']::text[], 'Bookkeeper', null, date '2026-12-07', date '2026-12-11', null, false, 370, 'seed'),
  ('QBO setup', 'Build the portal changes for 2027', 'Inventory Journal as a check, QuickBooks Connection reading QBO, account names on Stripe and Amazon entries, Sage''s notes.', array['Portal', 'QBO']::text[], 'Blake Ekelund', null, date '2026-12-07', date '2026-12-11', null, false, 380, 'seed'),
  ('Milestone', 'Go-live slot confirmed with Fishbowl', 'Needs at least 1 week''s notice.', array['QBO']::text[], 'Julie Ekelund', null, null::date, date '2026-12-18', null, false, 390, 'seed'),
  ('Year-end', 'Year-end prep', '1099 vendor list, payroll year-end plan, 12/31 inventory count plan (Point B count vs Fishbowl).', array['Payroll', 'Point B', 'Fishbowl']::text[], 'Julie Ekelund', 'CPA, Blake', date '2026-12-14', date '2026-12-18', null, false, 400, 'seed'),
  ('Training', 'Tell staff the freeze window', 'No QBD work from Dec 31 evening until told.', array['QBD']::text[], 'Julie Ekelund', null, date '2026-12-14', date '2026-12-18', null, false, 410, 'seed'),
  ('Clean-up', 'Reconcile banks and cards through Nov 30; final AR/AP clean-up', null, array['QBD', 'Banks']::text[], 'Bookkeeper', null, date '2026-12-21', date '2026-12-24', null, false, 420, 'seed'),
  ('Migration', 'Walk through the cutover runbook (Dec 31 – Jan 6)', 'With everyone involved.', array['QBD', 'QBO', 'Fishbowl']::text[], 'Blake Ekelund', null, date '2026-12-21', date '2026-12-24', null, false, 430, 'seed'),
  ('Year-end', 'Year-end inventory count / Point B reconciliation', null, array['Point B', 'Fishbowl']::text[], 'Blake Ekelund', null, date '2026-12-31', date '2026-12-31', null, false, 440, 'seed'),
  ('Fishbowl', 'Last Fishbowl → QBD export at 6 PM; queue empty', 'Check that nothing is left "Entered" for 2026.', array['Fishbowl', 'QBD']::text[], 'Blake Ekelund', null, date '2026-12-31', date '2026-12-31', null, false, 450, 'seed'),
  ('Migration', 'Full QBD backup (.qbb) saved in two places; freeze QBD', null, array['QBD']::text[], 'Bookkeeper', null, date '2026-12-31', date '2026-12-31', null, false, 460, 'seed'),
  ('Milestone', 'QBO is the book of record for 2027', 'Fishbowl keeps working; its postings wait in its queue.', array['QBO']::text[], 'Julie Ekelund', null, null::date, date '2027-01-01', null, false, 470, 'seed'),
  ('Migration', 'Go-live migration (A) or enter opening lists (B)', 'A: users out of QBD for 1–3 business days. B: enter lists, open invoices and bills in QBO.', array['QBD', 'QBO']::text[], 'Fishbowl', 'Bookkeeper', date '2027-01-04', date '2027-01-06', null, false, 480, 'seed'),
  ('Fishbowl', 'Disconnect Fishbowl from QBD, connect to QBO', 'Run Fishbowl''s integration wizard as a QBO admin; fetch QuickBooks accounts, then map every default from the worksheet.', array['Fishbowl', 'QBO']::text[], 'Blake Ekelund', null, date '2027-01-06', date '2027-01-06', null, false, 490, 'seed'),
  ('Fishbowl', 'Re-check part and product overrides', 'Testers, displays, fills, and the four one-offs (shipping charge, freight in, plates & dies, rep samples).', array['Fishbowl', 'QBO']::text[], 'Blake Ekelund', null, date '2027-01-06', date '2027-01-06', null, false, 500, 'seed'),
  ('Fishbowl', 'Align QBO items with Fishbowl', 'In QBO an item''s own accounts can override Fishbowl''s mapping. Reclassify converted inventory items as Fishbowl advises.', array['Fishbowl', 'QBO']::text[], 'Blake Ekelund', 'Bookkeeper', date '2027-01-06', date '2027-01-06', 'Always create and change parts and products in Fishbowl first — never edit item accounts directly in QBO.', false, 510, 'seed'),
  ('Fishbowl', 'Export the queued January postings and spot-check', 'Invoices, their cost-of-goods entries, payments and an adjustment: right accounts, right class, SO number as invoice number.', array['Fishbowl', 'QBO']::text[], 'Blake Ekelund', 'Bookkeeper', date '2027-01-06', date '2027-01-06', null, false, 520, 'seed'),
  ('QBO setup', 'Connect bank feeds in QBO', null, array['QBO', 'Banks']::text[], 'Bookkeeper', null, date '2027-01-04', date '2027-01-06', null, false, 530, 'seed'),
  ('Milestone', 'Fishbowl posting to QBO', null, array['Fishbowl', 'QBO']::text[], 'Blake Ekelund', null, null::date, date '2027-01-06', null, false, 540, 'seed'),
  ('Migration', 'Intuit post-migration tasks; tie opening balances', 'Compare QBO opening balances to the QBD 12/31 trial balance.', array['QBO', 'QBD']::text[], 'Bookkeeper', 'CPA', date '2027-01-07', date '2027-01-15', null, false, 550, 'seed'),
  ('Clean-up', 'Reconcile the first week of 2027 in QBO', null, array['QBO', 'Banks']::text[], 'Bookkeeper', null, date '2027-01-07', date '2027-01-15', null, false, 560, 'seed'),
  ('QBO setup', 'Switch the portal''s accounting pages to QBO mode', 'Stop booking the Inventory Journal entry — Fishbowl now posts COGS to QBO.', array['Portal', 'QBO']::text[], 'Blake Ekelund', null, date '2027-01-07', date '2027-01-15', 'The portal''s Inventory Journal becomes a check only, so cost of goods is never counted twice.', false, 570, 'seed'),
  ('Year-end', 'CPA year-end adjustments for 2026', 'A: in QBO dated 12/31. B: in QBD, then opening balances into QBO.', array['QBO', 'QBD']::text[], 'CPA', null, date '2027-01-18', date '2027-01-29', null, false, 580, 'seed'),
  ('Year-end', '1099s and payroll year-end filings', null, array['Payroll', 'QBO']::text[], 'CPA', 'Julie', date '2027-01-18', date '2027-01-29', null, false, 590, 'seed'),
  ('Year-end', 'Set QBD to read-only archive', 'Keep the license for history.', array['QBD']::text[], 'Bookkeeper', null, date '2027-01-25', date '2027-01-29', null, false, 600, 'seed'),
  ('Fishbowl', 'Set 90-day Fishbowl ↔ QBO re-authorization reminders', 'QBO requires it. Suggested: Apr 1, Jul 1, Sep 29, Dec 28, 2027.', array['Fishbowl', 'QBO']::text[], 'Blake Ekelund', null, date '2027-01-18', date '2027-01-29', 'Put them on the calendar now — an expired authorization stops postings silently.', false, 610, 'seed'),
  ('Milestone', '2026 closed, opening balances tie, QBD archived', null, array['QBO', 'QBD']::text[], 'CPA', 'Julie', null::date, date '2027-01-29', null, false, 620, 'seed')
) as v(type, name, description, systems, owner, helpers, start_date, due_date, recommendation, must_fix, sort, updated_by)
where not exists (select 1 from public.qbo_transition_tasks);
