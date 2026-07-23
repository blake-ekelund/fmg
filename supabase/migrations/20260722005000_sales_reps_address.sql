-- Street address for sales reps.
--
-- The original sales_reps table (20260707000000) carried city/state/zip but no
-- street line, so a rep record couldn't produce a mailable address — needed for
-- sample and catalog shipments. Existing rows default to '' rather than NULL,
-- matching every other text column on this table so the API never has to
-- coalesce.

alter table sales_reps
  add column if not exists address text not null default '';
