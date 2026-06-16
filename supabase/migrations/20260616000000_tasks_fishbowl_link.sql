-- Tasks ↔ storefront-order link for the Fishbowl-entry reminders.
--
-- ⚠ Run on the FMG product project (the one with the `tasks` table —
-- vxisjubwezhxfxocoawk), NOT the wholesale project. Idempotent.
--
-- /api/cron/fishbowl-tasks reconciles the task list against open sales orders:
-- it creates exactly one "Enter <SO> into Fishbowl" task per order still
-- needing entry, and deletes that task once the order is entered (or
-- cancelled). This column is the dedup key + the marker that scopes the cron
-- to its own auto-tasks (it never touches human-created tasks). Orders live in
-- the wholesale project, so it's a plain text id — no cross-project FK; null
-- for human tasks.

alter table public.tasks
  add column if not exists fishbowl_order_id text;

create index if not exists tasks_fishbowl_order_id_idx
  on public.tasks (fishbowl_order_id)
  where fishbowl_order_id is not null;

comment on column public.tasks.fishbowl_order_id is
  'Storefront order id this task was auto-created for (Fishbowl-entry reminder), set by /api/cron/fishbowl-tasks. Null for human tasks.';
