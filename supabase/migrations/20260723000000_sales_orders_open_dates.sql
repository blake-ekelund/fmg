-- Open-order dates for sales_orders_raw.
--
-- The Fishbowl sync already pulls EVERY sales order regardless of status —
-- SALES_ORDERS_SQL has no WHERE clause — so estimates, issued and in-progress
-- orders are already landing in this table. They're just invisible: Fishbowl
-- only sets dateCompleted when an order completes, and every read path here
-- sorts or filters on datecompleted, so an open order (NULL) sinks out of view.
--
-- Adding the two dates that DO exist on an open order lets us show them without
-- touching any revenue logic. Revenue everywhere still keys off datecompleted,
-- so nothing downstream starts counting estimates as sales.

alter table if exists public.sales_orders_raw
  add column if not exists datecreated date,
  add column if not exists dateissued date;

comment on column public.sales_orders_raw.datecreated is
  'Fishbowl so.dateCreated — set when the order is first entered (estimates included).';
comment on column public.sales_orders_raw.dateissued is
  'Fishbowl so.dateIssued — set when an estimate becomes a real order.';

-- Open orders are looked up by status and ordered by these dates.
create index if not exists sales_orders_raw_status_idx
  on public.sales_orders_raw (status);
create index if not exists sales_orders_raw_dateissued_idx
  on public.sales_orders_raw (dateissued desc nulls last);

-- NOTE: sales_orders_current is a view defined outside this repo. If it
-- enumerates columns rather than SELECT *, it must be redefined to expose
-- datecreated / dateissued. Nothing in the app reads them through that view
-- today (the portal orders API reads sales_orders_raw directly), so this is
-- only a concern if you later want them there too.
