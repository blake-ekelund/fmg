-- The marketplace's own PO number, as a first-class column.
--
-- Reconciliation matches an order to its Fishbowl SO by finding our reference
-- inside the SO's `customerPO`. That works for anything WE pushed, because we
-- write `<recordID>-MKTTIME`. It fails for anything a human keyed by hand,
-- because a human types the PO printed on the order — the MarketTime
-- `poNumber` — which is a completely different identifier.
--
-- St. Joseph's Hospital South is the case that exposed it: MarketTime recordID
-- 32698933 shipped as Fishbowl SO 24280 under customerPO `CF4CFH49XR` on
-- 2026-07-08, and reconciliation never found it, because it was only ever
-- looking for "32698933".
--
-- Until now the PO existed only inside the order `note` as free text. A column
-- makes it a key we can actually match on.

alter table public.orders
  add column if not exists external_po text;

-- Backfill from the note, which our own importer wrote in a fixed shape:
--   "MarketTime order <id> (PO <poNumber>, <state>) — imported by markettime sync."
-- Orders with no PO were written as "PO —" and are left null.
update public.orders
   set external_po = nullif(btrim(substring(note from 'PO ([^,]+),')), '—')
 where source = 'markettime'
   and external_po is null
   and note ~ 'PO [^,]+,';
