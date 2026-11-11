-- Accounting → Amazon Payments: a per-entry "it's in QuickBooks" tick.
--
-- Staff tick the QuickBooks box on the Amazon Payments list once the
-- settlement's journal entry has been entered in QuickBooks Online. Null =
-- not yet. Re-uploading a settlement keeps the tick (the import's upsert
-- never names these columns).

alter table amazon_settlements
  add column if not exists qbo_entered_at timestamptz,
  add column if not exists qbo_entered_by uuid references auth.users (id) on delete set null;

comment on column amazon_settlements.qbo_entered_at is
  'When someone ticked "in QuickBooks" on Accounting → Amazon Payments; null = not entered yet.';
