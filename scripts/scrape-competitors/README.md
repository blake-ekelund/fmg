# Competitor store-locator scraper

Quarterly sweep of competitor "where to buy" APIs. Populates the `/marketing/competitors` page.

## Setup (once)

1. Apply the migration in `supabase/migrations/20260422000000_competitor_locator.sql`
   via the Supabase SQL editor (or `supabase db push` if the CLI is configured).
2. Install new deps:
   ```
   npm install
   ```
3. Ensure these env vars are set in `.env.local` (or your shell):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Running

```bash
# Scrape every enabled competitor
npm run scrape:competitors

# Dry run — print planned requests, don't hit endpoints or write to DB
npm run scrape:competitors -- --dry-run

# One competitor
npm run scrape:competitors -- --competitor Thymes

# Tighter grid for dense regions
npm run scrape:competitors -- --radius-miles 50

# Verbose
npm run scrape:competitors -- --log-level debug
```

A single-competitor sweep takes ~10–15 minutes at the default 2.5s delay across
~230 grid points. Put it on a quarterly calendar reminder.

## Adding a competitor

Go to **Marketing → Competitors → Configure → New Competitor**. You only need
to enter:

- **Name** (e.g. "Thymes")
- **Locator page URL** (e.g. `https://thymes.com/pages/stores`)

On save, the app probes the site for a supported store-locator platform and
auto-fills the endpoint, query params, and field mappings. If detection fails,
you'll see a friendly error — that site isn't supported today.

### Supported platforms

- **Storepoint** — detected via the widget script `storepoint.co/api/v1/js/<id>.js`
  embedded on the page. Storepoint returns all locations in a single API call,
  so no grid sweep is needed.
- **Stockist** — detected by probing `/locations`, `/store-locations`, and
  `/apps/stockist/locations` for a Stockist-shaped JSON response.

Adding more platforms: push a detector onto `DETECTORS` in
[`lib/competitor-detect.ts`](../../lib/competitor-detect.ts).

## Testing

```bash
npm test
```

Covers grid generation, dedup, and field mapping.

## Politeness & safety

- Default 2.5s delay between requests, configurable per competitor.
- Exponential backoff on 429/503 (2s → 4s → 8s), max 3 retries per point.
- Hard abort after 5 consecutive errors.
- No block-bypass logic (no proxies, no CAPTCHA solving). If a site blocks us,
  we stop.
