# FMG Portal — Developer Handbook

> **Purpose.** This folder is the survival guide for the Fragrance Marketing Group
> internal portal. If the people who built it are unavailable, a new developer
> should be able to clone the repo, read these docs, and understand how the whole
> thing works — what it does, how it's wired, what talks to what, and where the
> bodies are buried. Plain English first, code pointers second.
>
> Keep it honest and current. A wrong handoff doc is worse than none — if you
> change how something works, update the doc in the same commit.

## The 60-second mental model

The portal is a **Next.js app deployed on Vercel**. Its own database and login
are **Supabase** (Postgres + Auth). But the *business* data — inventory, sales
orders, customers — lives in **Fishbowl**, the company's ERP, which is the
source of record. The portal mostly **reads from Fishbowl on a schedule and
caches into Supabase**, then layers analytics, storefront admin, email
marketing, and rep tools on top.

Around that core sit a handful of **external integrations** (Shopify, Faire,
MarketTime, the Point B/Synapse 3PL, Resend + Outlook for email, Slack, carrier
tracking). Almost every integration follows the same shape:

```
lib/<system>.ts          ← the client (server-only; reads secrets from env)
app/api/cron/<job>/route.ts  ← the scheduled job that uses it
vercel.json              ← when that job runs
```

If you understand that pattern, you understand 80% of the plumbing.

## Where to start if you're new

1. Read **[integrations.md](./integrations.md)** — the external systems and the
   scheduled jobs. This is the part with the most moving pieces and the most
   ways to break, so it's documented first.
2. Skim `vercel.json` — the full list of what runs automatically, and when.
3. Look at `lib/fishbowl.ts` — the ERP is the backbone; its client comment
   explains the license-seat model that shapes everything else.

## Running it locally

```bash
npm install
npm run dev      # Next.js dev server on :3100
```

You'll need a `.env.local` with the variables listed in
[integrations.md → Environment variables](./integrations.md#environment-variables).
Without them, integrations degrade gracefully (each client checks its config and
no-ops if unset) — the app still boots.

Other scripts: `npm run build` (production build — **run this before pushing**,
it's the same build Vercel runs), `npm run lint`, `npm run test` (vitest).

## Map of the docs

| Doc | Covers | Status |
|-----|--------|--------|
| [integrations.md](./integrations.md) | External systems + scheduled jobs | ✅ Written |
| [pointb-connector.md](./pointb-connector.md) | Design spec: the in-house Point B / Synapse connector (replaces LilyPad) | ✅ Written |
| architecture.md | App structure, routing, auth/roles, Supabase schema | ⬜ To write |
| email-system.md | Templates, automations, bulk send, deliverability | ⬜ To write |
| storefronts.md | Sassy + Natural Inspirations, order flow into Fishbowl | ⬜ To write |
| data-model.md | Key Supabase tables + the Fishbowl data views | ⬜ To write |
| deployment.md | Vercel, envs, cron auth, how to ship safely | ⬜ To write |

The in-app **Technical Roadmap** page (`/technical-roadmap`, owner/admin) is the
living companion to these docs — it tracks in-flight integration work.
