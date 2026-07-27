-- ── Feedback reward: claim pre-generated codes from the batch pool ─────
-- The storefront hands each shopper a distinct, already-generated single-use
-- code from a unique-code batch (draining the pool the FMG admin generated),
-- instead of minting new codes. Atomic, so two concurrent submits can never
-- receive the same code.

-- Ensure storefront_feedback has the columns the storefront writes. Idempotent;
-- also shipped in 20260726120000, repeated so this file stands alone.
alter table public.storefront_feedback
  add column if not exists ux_rating int,
  add column if not exists personality_tags text[] not null default '{}',
  add column if not exists personality text,
  add column if not exists had_issues boolean,
  add column if not exists issues text,
  add column if not exists recommendations text;
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'storefront_feedback'
      and column_name = 'body' and is_nullable = 'NO'
  ) then
    alter table public.storefront_feedback alter column body drop not null;
  end if;
end $$;

-- "Handed to a shopper, not yet spent." Distinct from redeemed_at (spent at
-- checkout) and order_id (the order that spent it). A claimed code is still
-- valid for the holder to redeem; the flag only stops it being re-issued.
alter table public.storefront_discount_codes
  add column if not exists claimed_at timestamptz;

create index if not exists storefront_discount_codes_claimable_idx
  on public.storefront_discount_codes (discount_id, created_at)
  where redeemed_at is null and claimed_at is null;

-- Atomically claim the oldest unclaimed, unredeemed code from an ACTIVE
-- unique-code batch (by the parent batch code). Returns the code + its discount
-- id, or NO ROWS if the batch is unknown / inactive / exhausted. FOR UPDATE
-- SKIP LOCKED lets concurrent callers each take a different code.
create or replace function public.claim_batch_code(p_batch text)
returns table(code text, discount_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.storefront_discount_codes c
     set claimed_at = now()
   where c.id = (
     select cc.id
       from public.storefront_discount_codes cc
       join public.storefront_discounts d on d.id = cc.discount_id
      where d.code = upper(btrim(p_batch))
        and d.unique_codes
        and d.active
        and (d.starts_at is null or d.starts_at <= now())
        and (d.ends_at is null or d.ends_at >= now())
        and cc.redeemed_at is null
        and cc.claimed_at is null
      order by cc.created_at
      for update of cc skip locked
      limit 1
   )
  returning c.code, c.discount_id;
end;
$$;

-- Only the storefront (service role) may claim; never anon/authenticated.
revoke all on function public.claim_batch_code(text) from public;
grant execute on function public.claim_batch_code(text) to service_role;
