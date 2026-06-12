-- Competitor store locator scraper: schema + Thymes seed
-- Apply via Supabase dashboard SQL editor or `supabase db push` (if CLI is set up).

create extension if not exists "pgcrypto";

-- ── competitors ──────────────────────────────────────────────────────────────
create table if not exists competitors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  base_url        text not null,
  endpoint_path   text not null,
  -- { method, latParam, lngParam, radiusParam, radiusValue, radiusUnit, extraParams, headers }
  request_config  jsonb not null default '{}'::jsonb,
  -- { storesJsonPath, externalIdField, fieldMappings }
  response_config jsonb not null default '{}'::jsonb,
  rate_limit_ms   integer not null default 2500,
  user_agent      text not null default 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  enabled         boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── scrape_runs ──────────────────────────────────────────────────────────────
create table if not exists scrape_runs (
  id              uuid primary key default gen_random_uuid(),
  competitor_id   uuid not null references competitors(id) on delete cascade,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running'
                    check (status in ('running','completed','failed','aborted')),
  grid_points     integer not null default 0,
  total_requests  integer not null default 0,
  unique_stores   integer not null default 0,
  error_count     integer not null default 0,
  notes           text
);

create index if not exists idx_scrape_runs_competitor
  on scrape_runs (competitor_id, started_at desc);

-- ── competitor_stores ────────────────────────────────────────────────────────
create table if not exists competitor_stores (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references scrape_runs(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  external_id   text,
  store_name    text,
  address       text,
  city          text,
  state         text,
  zip           text,
  country       text,
  phone         text,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  raw_json      jsonb,
  scraped_at    timestamptz not null default now()
);

create unique index if not exists uq_competitor_stores_external
  on competitor_stores (competitor_id, run_id, external_id)
  where external_id is not null;

create index if not exists idx_competitor_stores_run
  on competitor_stores (run_id);

create index if not exists idx_competitor_stores_competitor
  on competitor_stores (competitor_id);

-- No seed rows — add competitors via Marketing → Competitors → Configure.
-- The UI auto-detects Stockist / Storepoint from the locator page URL.
