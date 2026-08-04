# Integrations — Developer Handoff

Everything the portal talks to, how it's wired, when it runs, and how to tell
when it's broken. Read the [mental model](#how-integrations-are-structured)
first; it makes the rest obvious.

---

## How integrations are structured

Almost every integration is two files plus a schedule:

| Piece | Path | Role |
|-------|------|------|
| **Client** | `lib/<system>.ts` | Server-only. Talks to the external API. Reads secrets from `process.env` — **no secrets are committed**. Each client checks its own config and no-ops (or throws a clear error) when env is missing, so a half-configured environment degrades gracefully. |
| **Job** | `app/api/cron/<name>/route.ts` | The scheduled work. A `GET` handler. |
| **Schedule** | `vercel.json` | Declares which paths Vercel calls and when. |

**Cron auth.** Every cron route accepts either a Vercel cron call carrying
`Authorization: Bearer $CRON_SECRET`, **or** a signed-in admin user (so you can
trigger it by hand from the browser). Most also accept query flags:
`?dry=1` (preview, write nothing), `?now=1` / `?force=1` (run off-schedule).
When debugging, hit the route in the browser while signed in as an admin.

**Timezone gotcha.** Vercel crons run in **UTC**. Eastern shifts with DST, so
several handlers fire at multiple UTC hours and then *re-gate to the exact
Eastern hour* inside the code (see `lib/integrations.ts`). That's why the
schedules below list more hours than the job actually "runs" — the handler
picks the right one year-round with no seasonal edits.

---

## The scheduled jobs (complete list)

From `vercel.json`. Times are the **UTC cron trigger**; "effective" is when real
work happens after the handler's own gating.

| Path | Cron (UTC) | Effective | What it does |
|------|-----------|-----------|--------------|
| `fishbowl-sales-sync` | `0 0,7,8,15,16,23 * * *` | 3 AM / 11 AM / 7 PM ET | Pull sales orders + line items from Fishbowl → Supabase cache. |
| `fishbowl-inventory-sync` | `0 0,1,8,9,16,17 * * *` | 4 AM / 12 PM / 8 PM ET | Pull Point B inventory availability from Fishbowl → Supabase. Offset ~1h from sales sync so they never fight for a license seat. |
| `fishbowl-estimate-sweep` | `*/15 * * * *` | every 15 min | Push new storefront orders into Fishbowl as **Estimates**. |
| `fishbowl-tracking-sync` | `7,37 * * * *` | :07 / :37 each hour | Read tracking numbers off shipped SOs in Fishbowl → mark orders shipped → email the customer once. |
| `carrier-delivery-sync` | `23 * * * *` | :23 each hour | Ask USPS/FedEx/UPS if shipped packages arrived → stamp delivered → email the customer once. |
| `fishbowl-digest` | `0 10,11,19,20 * * *` | 6 AM / 3 PM ET | Internal email to Blake: SOs still not keyed into Fishbowl. Sends via Outlook. |
| `faire-order-sync` | `13,43 * * * *` | :13 / :43 each hour | Import Faire marketplace orders; confirm shipments back to Faire. |
| `automations` | `45 11,12,19,20 * * *` | ET-gated | Email automation engine — sends due automation steps. |
| `bulk-send` | `*/5 * * * *` | every 5 min | Bulk email blast worker (drains the Resend send queue). |
| `renew-email-subscriptions` | `0 */6 * * *` | every 6 h | Keeps email-account tokens/subscriptions fresh. |
| `markettime-order-sync` | *(not in `vercel.json`)* | **dark** | Route exists but is **not scheduled** — MarketTime is off until keys are set. |

---

## Fishbowl (ERP) — the backbone

**What it is.** The company's inventory + sales-order system, and the source of
record for all business data. The portal reads from it constantly and writes to
it rarely.

**Files.** `lib/fishbowl.ts` (client), `lib/fishbowlQueries.ts` (the canonical
SQL "data views"), `lib/fishbowlEstimate.ts` + `lib/fishbowlEstimatePush.ts`
(storefront order → estimate mapping).

**Auth & connection.**
- REST server, `POST /api/login` with `{ appName, appDescription, appId,
  username, password }` → returns a Bearer `token`. **Note:** it's `appId` (an
  integer), *not* `appKey` — the server derives the key. The integrated app must
  be approved once inside Fishbowl (Integrations screen). App = "FMG Storefront"
  / id `47821`.
- Env: `FISHBOWL_API_URL`, `FISHBOWL_USER`, `FISHBOWL_PASS`, `FISHBOWL_APP_NAME`,
  `FISHBOWL_APP_ID`.

**Two hard constraints that shape everything:**
1. **License seats.** This Fishbowl licenses only **3 concurrent users**. Every
   `/api/login` consumes a seat until `/api/logout`. So the client
   (`withSession`) logs in, does all its work, and *always* logs out in a
   `finally`. Never call Fishbowl live per page-view — sync to Supabase on a
   schedule and read from there. This is why the sales and inventory syncs are
   deliberately offset in time.
2. **Plain HTTP.** The Fishbowl API is unencrypted HTTP. Keep `FISHBOWL_USER` a
   dedicated least-privilege account, and front the API with TLS (e.g. a
   Cloudflare Tunnel) before exposing it to the internet.

**How data moves.**
- **Reads** go through `/api/data-query` (arbitrary read-only `SELECT` against
  Fishbowl's MySQL) or `/api/parts/inventory`. The saved queries live in
  `lib/fishbowlQueries.ts`.
- **The only write** is `POST /api/import/SalesOrderDetails` (CSV-style import)
  used to create storefront orders as Estimates. The REST `/sales-orders`
  endpoint is read-only (it 405s on POST). There is **no** API write today that
  ships an order or writes a tracking number — those happen elsewhere (see Point
  B below).

**Jobs:** `fishbowl-sales-sync`, `fishbowl-inventory-sync`,
`fishbowl-estimate-sweep`, `fishbowl-tracking-sync`, `fishbowl-digest`.

**Is it broken?** The Integrations page (`/integrations`) shows last-sync times.
If those go stale, or a cron logs "Fishbowl login failed", check: seats
exhausted (a hung session), credentials, or the API host/TLS tunnel being down.

---

## Point B / Synapse (3PL) — fulfillment

**What it is.** Point B Solutions runs the **Synapse (Zethcon)** warehouse that
physically ships orders. Facility `PB1`, customer `1590`. **Point B is the
source of truth for inventory** — Fishbowl and the warehouse drift.

**Current state.** The Fishbowl ↔ Synapse bridge today is a **third-party
connector, "LilyPad" (Sharpe Concepts)** — *not* FMG code. It runs as a Fishbowl
REST integrated app (`appKey 9818`), logs into Fishbowl as user
`PointBSolutions`, and polls every 30 minutes (~4 AM–3:30 PM Central). When Point
B ships, it writes the tracking number + a freight line (Point B cost **× 1.25**)
back onto the Fishbowl SO; a human then clicks **Ship** in Fishbowl to relieve
inventory and invoice QuickBooks.

**There is no FMG code for this yet.** Replacing LilyPad with an in-house
connector is the active project — see the in-app **Technical Roadmap**
(`/technical-roadmap`) for the full mechanism, the two Point B APIs
(`pntb1.synapsewms.net` and `integrations.pointbsolutions.com`), and the plan.

**Contact at Point B:** Keith Olsen, keith.olsen@pointbsolutions.com.

---

## Shopify — Natural Inspirations storefront

**What it is.** naturalinspirations.com runs on Shopify. The portal reads the
catalog and order/analytics data.

**Files.** `lib/shopify.ts`. Surfaced on the Shopify Analytics page.

**Auth.** Env: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_API_TOKEN` (Admin API),
and `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` (OAuth app). Variant `sku` ==
the Fishbowl part number — that's the join key between the two systems.

**Note:** there is *also* a separate **Shopify plugin inside Fishbowl** (its own
`SHOPIFY` Fishbowl user) that syncs products/inventory — distinct from this
portal client. Ownership of that plugin is unconfirmed (it's on the roadmap to
audit). Don't assume this `lib/shopify.ts` client is the only thing touching
Shopify.

---

## Faire — wholesale marketplace

**What it is.** Faire wholesale orders flow into the portal and onward to
Fishbowl; shipments are confirmed back to Faire (that's how the retailer gets
notified).

**Files.** `lib/faire.ts`. **Job:** `faire-order-sync` (:13/:43 hourly).

**Auth.** Faire API credentials in `lib/faire.ts`; `FAIRE_SHIP_SYNC` is a
feature flag gating the ship-confirmation half.

**Flow.** Import unfulfilled Faire orders → keyed into Fishbowl (hand-keyed with
a PO convention; the estimate push dedupes on it). When Fishbowl shows tracking,
`fishbowl-tracking-sync` calls `markFaireOrderShipped` to notify Faire instead
of emailing a customer directly.

---

## MarketTime — wholesale order import (dark)

**What it is.** A wholesale order channel. The client and cron **exist but are
not scheduled** (`markettime-order-sync` is absent from `vercel.json`) — it's
built and waiting on live keys.

**Files.** `lib/markettime.ts`. Env: `MARKETTIME_API_KEY`,
`MARKETTIME_WHO_AM_I`. To turn on: set the keys and add the cron to `vercel.json`.

---

## Email — Resend (transactional) + Microsoft/Outlook (rep 1:1)

Two senders, deliberately split:

**Resend** — all *system/marketing* email: template tests, automation steps,
bulk blasts, customer shipped/delivered notifications.
- Files: `lib/email/resend.ts`, `lib/email/sender.ts`.
- Env: `RESEND_API_KEY`, `RESEND_FROM_DOMAIN`, `RESEND_FROM_LOCAL`,
  `RESEND_REPLY_TO`. **If `RESEND_REPLY_TO` is unset, replies bounce** — set it.
- Sends from a subdomain (e.g. `send.fragrancemarketinggroup.com`).
- Jobs: `automations`, `bulk-send`.

**Microsoft Graph / Outlook** — *rep 1:1* email and the internal Fishbowl
digest, sent from real connected Outlook mailboxes so they land as personal mail.
- Files: `lib/email/microsoft.ts`, `lib/email/tokens.ts`, `lib/email/send.ts`.
- Env: `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`. OAuth tokens are
  stored encrypted with `EMAIL_TOKEN_ENC_KEY` and refreshed by
  `renew-email-subscriptions`.

**Deliverability.** The Resend webhook feeds the Deliverability page
(`/email/deliverability`) with bounces/complaints/suppressions.

---

## Slack — internal assistant bot

**What it is.** An @-mention bot in Slack that answers questions about FMG data
via a Claude tool-use loop, gated to internal staff by email.

**Files.** `lib/slack.ts`, `lib/assistant/*`. Env: `SLACK_SIGNING_SECRET`,
`SLACK_BOT_TOKEN`. Inbound Slack events are signature-verified with the signing
secret. Requires the Slack app to be installed in the workspace.

---

## Carrier tracking — USPS / FedEx / UPS

**What it is.** Free carrier tracking APIs used to detect delivery (the last leg
of the fulfillment loop) and to attribute a real carrier when Fishbowl only
records the rate-shopper "RATESHOP".

**Files.** `lib/carrierTracking.ts` (delivery status), `lib/tracking.ts`
(carrier detection from a tracking-number's format). **Job:**
`carrier-delivery-sync` (:23 hourly).

**Auth.** Each carrier is enabled independently by its own env keys (see
`lib/carrierTracking.ts`) — a carrier without keys is skipped and reported, so
USPS can run before FedEx/UPS registrations clear.

---

## Supabase — the portal's own store

Not an "integration" so much as the app's backend: Postgres + Auth. It holds
everything the portal owns (orders cache, email templates, automations,
storefront admin data, rep directory, analytics events).

- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser),
  `SUPABASE_SERVICE_ROLE_KEY` (server-only — full access, never ship to client).
- Migrations live in the repo but are applied by a human running `db push`
  (agents have no DB token) — so a migration file existing does **not** mean
  it's live in the database. Verify before assuming a column exists.

---

## Environment variables

Grouped by system. Names only — values live in Vercel / `.env.local`, never in
the repo.

| System | Variables |
|--------|-----------|
| **Fishbowl** | `FISHBOWL_API_URL`, `FISHBOWL_USER`, `FISHBOWL_PASS`, `FISHBOWL_APP_NAME`, `FISHBOWL_APP_ID` |
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Shopify** | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_API_TOKEN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` |
| **Faire** | `FAIRE_SHIP_SYNC` (+ API creds in `lib/faire.ts`) |
| **MarketTime** | `MARKETTIME_API_KEY`, `MARKETTIME_WHO_AM_I` |
| **Resend** | `RESEND_API_KEY`, `RESEND_FROM_DOMAIN`, `RESEND_FROM_LOCAL`, `RESEND_REPLY_TO` |
| **Outlook / Graph** | `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `EMAIL_TOKEN_ENC_KEY` |
| **Slack** | `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN` |
| **Carriers** | per-carrier keys — see `lib/carrierTracking.ts` |
| **Cross-cutting** | `CRON_SECRET` (auth for every cron), `STOREFRONT_NOTIFY_SECRET` (portal→storefront shipped/delivered pings), `NEXT_PUBLIC_APP_URL`, `FISHBOWL_ESTIMATE_CUSTOMER` (pilot switch that parks pushed estimates on a test customer) |

---

## "Is it broken?" — quick triage

| Symptom | Likely cause | Where to look |
|---------|-------------|---------------|
| Inventory/sales data stale | Fishbowl sync failing or seats exhausted | `/integrations` last-sync; cron logs for "login failed" |
| Storefront orders not in Fishbowl | estimate sweep failing, or customer name mismatch | `fishbowl-estimate-sweep` logs; `fishbowl-digest` lists un-keyed SOs |
| Customer never got "shipped" email | tracking not on the SO yet, or notify secret | `fishbowl-tracking-sync`; `STOREFRONT_NOTIFY_SECRET` |
| Customer never got "delivered" email | carrier keys missing/expired | `carrier-delivery-sync` (reports skipped carriers) |
| Marketing email replies bounce | `RESEND_REPLY_TO` unset | env |
| A cron isn't running at all | not in `vercel.json`, or `CRON_SECRET` mismatch | `vercel.json`; Vercel cron logs |

**General debugging move:** hit the cron route in the browser while signed in as
an admin, with `?dry=1`, and read the JSON it returns — every job reports what it
would do.

---

*Last verified against the codebase 2026-08-04. If you change an integration,
update this file in the same commit.*
