-- Human judgements laid over the Fishbowl-vs-Point-B variance report.
--
-- The report compares two systems we don't control the contents of, so some
-- lines will always need a person to say "this one is settled" or "the unit on
-- this one is wrong". Those decisions live here rather than in either source
-- system: Fishbowl is the ERP of record and Synapse is the warehouse's, and
-- neither should be edited to make a report look tidier.
--
-- Keyed by part number (upper-cased, matching how the report normalizes), NOT
-- by a snapshot id — a decision about a part outlives any one inventory
-- snapshot, and re-deciding it three times a day would defeat the point.

create table if not exists public.inventory_variance_overrides (
  -- Upper-cased Fishbowl part number. The report upper-cases both sides before
  -- matching, so storing anything else would silently fail to join.
  part          text primary key,

  -- Archived parts drop out of the report's counts and totals entirely. For
  -- discontinued components, samples consumed in kitting, and anything else
  -- whose "variance" is structural rather than a discrepancy to chase.
  archived      boolean     not null default false,

  -- The unit Fishbowl's quantity is REALLY in, when its own label is wrong.
  -- Setting this makes the report treat the Fishbowl side as counting in this
  -- unit — so it only resolves a mismatch where the label was the error, not
  -- where the two systems genuinely pack differently. Null = trust Fishbowl.
  uom_override  text,

  -- Why. A variance decision without a reason is unreviewable six months on.
  note          text,

  updated_at    timestamptz not null default now(),
  updated_by    text
);

comment on table public.inventory_variance_overrides is
  'Per-part human decisions for the inventory variance report: archive a settled line, or correct a wrong unit label. Never written by a sync.';

-- The report reads every override in one go and joins in memory, so the primary
-- key is the only index it needs. This partial index keeps the common
-- "hide archived" filter cheap if the table ever grows past a few hundred rows.
create index if not exists inventory_variance_overrides_archived_idx
  on public.inventory_variance_overrides (archived)
  where archived = true;

alter table public.inventory_variance_overrides enable row level security;

-- Reads are open to any signed-in user; writes go through the service-role API
-- route, which is already gated on requireInternalUser. No client-side policy
-- grants insert/update, so an external rep with a session can never write here.
drop policy if exists inventory_variance_overrides_read on public.inventory_variance_overrides;
create policy inventory_variance_overrides_read
  on public.inventory_variance_overrides
  for select
  to authenticated
  using (true);

grant select on public.inventory_variance_overrides to authenticated;
