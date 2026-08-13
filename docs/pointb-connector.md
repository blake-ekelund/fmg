# Point B Connector — Design Spec

> **Status:** Plan of record. Nothing built yet. This is the blueprint for
> **Step 1 of the 3PL roadmap** (`/technical-roadmap`): replace the third-party
> LilyPad connector with an in-house one.
>
> Everything here was reverse-engineered from read-only Fishbowl database
> forensics + the Synapse API docs (Aug 2026). Sections marked **⚠ OPEN** are
> unknowns to resolve *before* building — see [Open questions](#open-questions).

---

## 1. Why

Today, a **third-party middleware vendor — LilyPad (Sharpe Concepts)** — sits
between our Fishbowl ERP and Point B's Synapse warehouse. It's a paid black box
we can't see into, and it drifts. We already talk to both ends ourselves, so we
bring the glue in-house: **retire Sharpe, run our own connector.**

### The three parties (don't conflate them)

| System | What it is | Owner |
|--------|-----------|-------|
| **Fishbowl** | Our ERP / system of record (orders, inventory) | FMG |
| **Synapse** | The warehouse system that physically ships | Point B Solutions |
| **LilyPad** | The middleware connector between them — *being retired* | Sharpe Concepts (3rd party) |

Replacing LilyPad changes **only the middle piece.** Fishbowl is untouched;
Point B's Synapse is untouched (orders still arrive, shipments still return).
Point B doesn't need to know the difference.

---

## 2. What LilyPad does today (the behavior we must reproduce)

A **bidirectional connector on a 30-minute poll.** It logs into Fishbowl as user
`PointBSolutions` (a Fishbowl REST app, `appKey 9818`) every :00 and :30,
**4:00 AM–3:30 PM Central**, and does two jobs. Shipping manifests land in two
windows: **11:00–11:30 AM** and **3:00–3:30 PM** Central.

```
                         ┌─── our new connector (retires LilyPad) ───┐
   Fishbowl (FMG) ───────┤                                           ├─────── Synapse (Point B)
                         │  EGRESS: issued SO → create-order         │
                         │  INGRESS: shipment → tracking + freight   │
                         └───────────────────────────────────────────┘
```

**EGRESS — orders out (Fishbowl → Synapse).** Reads newly *issued* SOs in the
"Point B Solutions" location group and pushes each to Synapse so the warehouse
ships it. *Leaves almost no trace in Fishbowl's DB* (it reads FB, writes
Synapse) — which is why DB forensics alone couldn't see this half.

**INGRESS — shipments back (Synapse → Fishbowl), two phases:**
- **Phase 1 — automated (this is what we rebuild).** On each poll, pull the
  shipment from Synapse and write onto the Fishbowl SO: create the
  `ship`/`shipcarton` record with the **tracking number**, and append a Shipping
  line = **Point B freight × 1.25** (25% markup). `dateShipped` stays null; no
  inventory moves yet.
- **Phase 2 — human, stays as-is (NOT rebuilt).** A person clicks **Ship** in
  the Fishbowl client. Fishbowl then natively relieves inventory, consumes COGS,
  and queues the **QuickBooks** invoice. This is a deliberate review gate — we
  keep it.

### Wholesale payment: NET 30 (decision 2026-08-05 — do NOT build card-on-ship)

Considered charging wholesale cards on ship (via card-on-file) to shrink DSO,
but the numbers killed it: cost of capital is a **$500k LOC at 4%**, so financing
a 30-day NET-30 receivable costs ~**0.33%**, vs ~**3%** card processing — ~9× more
expensive. With **no collections/bad-debt problem** and **plenty of LOC headroom**,
there's no risk or capacity reason to override that. **Wholesale stays NET 30,
floated on the LOC.** Connector does NOT charge cards / orchestrate wholesale
payment — it just writes the freight line and the order invoices on terms.

### Two order paths behave differently (authoritative — from LilyPad spec)

| | Wholesale (FB-originated) | D2C (Shopify-originated) |
|---|---|---|
| Into Zethcon | Issue FB → Zethcon | Shopify → FB (manual `NI-` prefix to avoid SO# clashes) → Zethcon |
| On ship-back | add tracking **+ pick/pack/ship fees + 25% markup** | add tracking **only — NO fees, NO markup** |
| Returns as | **IN PROGRESS** | **FULFILLED** |

So the freight-fee-and-markup logic exists **only on the wholesale path**. The
exact fee/markup formula is **not yet known** (see Q3) — do not trust the
earlier `× 1.25` examples, they were fitted. D2C needs no freight math at all.

---

## 3. Target architecture

A **Vercel cron** on the same 30-minute cadence — the exact pattern the portal
already uses for its Fishbowl syncs.

| Piece | Path | Role |
|-------|------|------|
| Client | `lib/pointb.ts` | Talks to both Synapse APIs (auth, create-order, shipments, fees). |
| Egress/ingress job | `app/api/cron/pointb-sync/route.ts` | The 30-min poll: send new orders, pull new shipments. |
| Schedule | `vercel.json` | `*/30 ...` (gated to the 4 AM–3:30 PM Central window). |
| State table | Supabase `pointb_order_sync` | Idempotency + reconciliation + observability (see §6). |

Reuse existing primitives: `lib/fishbowl.ts` `withSession` (the 3-seat license
discipline), the cron-auth pattern (`CRON_SECRET` or admin), and the
check-before-write idempotency from `createEstimate()`.

---

## 4. The two Point B APIs

| API | Base | Auth | Use for |
|-----|------|------|---------|
| **Synapse WMS** | `pntb1.synapsewms.net/{test\|prod}/api` | Session cookie: `POST /login` → `SYNAPSE-SESSION` + `XSRF-TOKEN` (send both back) | `create-order` (egress), `shipped-orders`, `inventory/by-customer` |
| **Integration API** | `integrations.pointbsolutions.com` | Bearer: `POST /api/token` → token | `shipment-by-order` (clean tracking+freight), `order/fees` (handling + freight) |

Account: facility **PB1**, customer **1590**. Start against **TEST**; review
results in **Synapse-Anywhere** (`pointb.mywebsynapse.com/test/...`).

---

## 5. Leg-by-leg spec

### 5a. Egress — `POST /orders/create-order`

**Trigger:** an SO becomes *issued* in the "Point B Solutions" location group and
has not yet been sent (see idempotency, §6).

**Source:** Fishbowl `data-query` for issued SOs + their line items + ship-to.

**Body shape.** Four top-level objects; we only need the first two:
`header` (order + addresses, required), `details[]` (line items, ≥1, required),
`hdrinstruct` (optional order notes — set `rf_auto_display:"Y"` to show in the RF
gun), `hdrbolcomment` (optional), `remove_hold` (optional).

**Only 4 fields are strictly required:** `custid`, `order_type`, `po_number`,
`reference`. All ~200 `*_pass_thru_*` fields are Point B spare columns — ignore.

**Field mapping (Synapse `create-order`):**

| Synapse field | Source | Limit |
|---------------|--------|-------|
| `header.custid` | `1590` | ≤10 |
| `header.order_type` | **`O`** (Outbound) — ✅ confirmed live | 1 |
| `header.from_facility` | **`PB1`** — required for type O | ≤3 |
| `header.po_number` | Fishbowl `so.num` (e.g. `24366`) | ≤20 |
| `header.reference` | Fishbowl `so.customerPO` (marketplace/wholesale ref) | ≤20 |
| `header.ship_type` | `S` (Small Pkg) — LilyPad's value | 1 |
| `header.ship_terms` | `PPD` (Prepaid) — LilyPad's value | ≤3 |
| `header.carrier` | *omit* — Point B rate-shops (result e.g. `FDEG`) | ≤10 |
| `header.ship_to_*` (name, address_1, address_2, city, state, postal_code, country_code, phone, email) | SO ship-to block, **truncated to each field's limit** | name ≤40, state ≤5, country ≤3, phone ≤25 |
| `header.validate_shipto` | `"Y"` | 1 |
| `details[].item` | Fishbowl part number | — |
| `details[].uom_entered` | line UOM (Fishbowl `ea` → `EA`) | ≤4 |
| `details[].qty_entered` | line quantity | int |

**Addresses:** use the inline `ship_to_*` block (works for every address).
Alternatively `ship_to` (≤10) is a *pre-registered ship-to code* — only if Point
B has one on file for a wholesale account; default to inline.

**`order_type` = `O` (Outbound), `from_facility` = `PB1` — ✅ CONFIRMED** by a
live read of a real PROD order (`orderid 1269871` / Fishbowl SO `24366`) through
`order-info`. Verified mapping: `po_number` = Fishbowl `so.num`, `reference` =
`so.customerPO`. LilyPad also sets `ship_type: "S"` + `ship_terms: "PPD"`;
`carrier` comes back rate-shopped (FDEG), so we omit it on create.

**On success:** record the returned Synapse order id in `pointb_order_sync` and
mark the SO sent — so the next poll doesn't re-send it.

### 5b. Ingress — shipments back

**Pull** — `POST /orders/shipped-orders` (Synapse WMS, `request_type:"range"`
across the manifest window). **One API we already have working access to** —
verified live it carries everything we need per order:
- **tracking** → `plate_details[].tracking_number` (per carton) — e.g. `875047277553`
- **freight** → `shipping_cost` (the Point B freight cost = the ×1.25 base) — e.g. `23.64`
- `carrier` / `scac` (e.g. `FDEG`), `order_details[]`

**Fees (freight + pick/pack charges)** → `GET /api/order/fees?customerId=1590&
orderId=<synapse orderid>` on the **Integration API** (`integrations.pointbsolutions.com`,
Bearer via `POST /api/token`). Returns `totalAmount` (= `FRCHARGES` freight +
`PICK - EACH` + `PICK - CASE` + `BaseOrderCharge`) plus a `detail[]` breakdown.
**Credentials:** the `fishbowl_api` login found in LilyPad's config (`<ShipFee>`
block) — store in env, never commit. Not namespaced. **Snapshot `totalAmount` at
write-time** (fees accrue after — see Q3).

**Write into Fishbowl (Phase 1 only):**
1. Create the `ship` / `shipcarton` record with the WMS tracking number
   (`plate_details[].tracking_number`), `dateShipped` left null.
2. **Wholesale only:** append a Shipping line = **`order/fees.totalAmount` ×
   1.25** (snapshotted at write-time). **D2C/Shopify: no fee line, no markup** —
   tracking only (see §2).
3. Record tracking + freight + handling in `pointb_order_sync`; do **not** touch
   inventory, fulfillment, or QuickBooks.

**⚠ OPEN — the exact Fishbowl write call.** Our only known Fishbowl write today
is `POST /api/import/SalesOrderDetails`. We need the specific REST call LilyPad
uses to create the shipment record + append the freight line. Get it from the
**Fishbowl Advanced server access log** during a manifest window, or by
enumerating Fishbowl's REST import types and confirming one reproduces the
footprint via a test-SO diff.

**Phase 2 stays human** — someone clicks Ship in Fishbowl; native inventory + QB
follow. Out of scope for this connector.

---

## 6. State, idempotency & reconciliation

The heart of a connector that *doesn't* suck. One table:

**`pointb_order_sync`** (proposed)

| Column | Purpose |
|--------|---------|
| `fishbowl_so_id`, `fishbowl_so_num` | The order |
| `synapse_orderid` | Returned by create-order |
| `state` | `pending → sent → shipped → done` (or `error`) |
| `tracking_number`, `carrier`, `freight_cost` | Ingress results |
| `sent_at`, `shipped_at` | Timing |
| `attempts`, `last_error` | Retry + observability |
| `updated_at` | Reconciliation |

**Rules:**
- **No double-send:** an SO is pushed to Synapse only if it has no `sent` row.
- **No double-write:** tracking/freight written back only once per order.
- **Reconciliation loop:** each poll also *diffs* the two sides — issued-but-not-sent,
  shipped-in-Synapse-but-not-written-back — and heals the gap. State-based, not
  fire-and-forget. This is the single biggest quality win over LilyPad.
- **Replayable:** an admin page over this table shows every order's sync state
  and can re-run a failed one. (LilyPad is a black box; this is not.)

---

## 7. Open questions

Resolve these before building. Most are answerable from **Synapse-Anywhere** +
one or two live API calls — no vendor needed.

1. ~~`order_type` code~~ — ✅ **RESOLVED: `O` (Outbound), `from_facility` `PB1`** (live PROD `order-info` read of SO 24366). Also confirmed `po_number`←`so.num`, `reference`←`so.customerPO`.
2. ~~NI's namespace on the Integration API~~ — ✅ **MOOT.** The connector uses the raw Synapse WMS API (`shipped-orders`, `inventory/by-customer`), which isn't namespaced. The Integration API (which needs the namespace *and* separate email-based creds we don't have) is unnecessary — WMS carries tracking + freight.
3. **Wholesale freight-line formula — ✅ SOLVED & VERIFIED.** From LilyPad's
   config + a live read of the fee endpoint:

   > **Fishbowl Shipping line = `order/fees.totalAmount` × 1.25**

   The `1.25` is the config value `ShipPercent = 0.25`. `order/fees.totalAmount`
   is the sum of Point B's per-order charges: `FRCHARGES` (freight, = WMS
   `shipping_cost`) + `PICK - EACH` + `PICK - CASE` + `BaseOrderCharge`.
   Verified: 7 of 10 recent wholesale orders match to the **penny**
   (e.g. SO 24366: fees.total 31.57 × 1.25 = 39.46 = FB line). The other 3
   deviate in one direction only (current fees > FB line) — fees **accrue after
   ship-time**, so the connector must **snapshot `totalAmount` at the moment it
   writes the line**, exactly as LilyPad does (write-once from point-in-time
   fees). Applies to **wholesale only**; D2C/Shopify orders get tracking, no fee
   line, no markup (see §2).
4. **Fishbowl write protocol** — ✅ **identified: the legacy Fishbowl plugin API on port `28192`** (from LilyPad's config `<DBPort>28192</DBPort>`, integrated app `9818`, user `PointBSolutions`). This is a *different* protocol than the REST API the portal uses today (`:2456`) — the connector needs a legacy-API client for the ship-write (and egress SO create). Still to pin: the exact request message/format for the shipment update (get from LilyPad's code, or the legacy-API docs). Config also gives write params: SOLocGrp `Point B Solutions`, SOStatus 20, Shipping product `Shipping` (type 20), PickLocationId 90, ReceiveLocationId 286.
5. **Egress idempotency marker** — does LilyPad stamp anything on a Fishbowl SO once sent, or keep its own state? (We keep our own via `pointb_order_sync`, but worth knowing — check LilyPad's config/code.)

---

## 8. Build plan & cutover

1. **Read-only, TEST env.** `login` → `shipment-by-order` + `inventory/by-customer`. Proves auth and data shapes with zero risk.
2. **Egress.** Build create-order mapping; push a test SO; verify it lands in Synapse-Anywhere.
   *Built:* `createSynapseOrder()` in `lib/pointb.ts` + the single-shot smoke endpoint
   `POST /api/pointb/create-order-test` (admin-gated). It is **test-only by construction** —
   `synapseWriteBlockReason()` fails closed unless the test base URL has a `test` path segment
   and no `prod` segment, and the write is re-checked inside the client. `GET` the same route to
   see whether a write is currently allowed. This is a hand-fired probe, **not** the connector
   (no Fishbowl poll, no `pointb_order_sync`).
3. **Ingress phase 1.** Build the Fishbowl shipment write; confirm it reproduces LilyPad's footprint via a test-SO diff.
4. **Shadow run.** Run our connector **alongside** LilyPad against real data and compare — same orders sent, same tracking/freight written. Don't flip until they match.
5. **Cutover.** Disable LilyPad (the Fishbowl app `9818`); ours takes over. Keep the shadow comparison as a monitor for a week.

**Risk:** this is **ops-critical** — if it breaks, orders don't ship. Needs a
dead-man's-switch/alert on the poll and stuck-order alerting from
`pointb_order_sync`, from day one. Build the observability before the cutover,
not after the first missed shipment.

---

## 9. Environment variables (to add)

Names only. Values go in Vercel / `.env.local`.

| Variable | For |
|----------|-----|
| `SYNAPSE_API_URL` | Synapse WMS base for **reads** (reconciliation). Prod today. |
| `SYNAPSE_USER`, `SYNAPSE_PASS` | Synapse WMS login (`NATURAL-API` / …) |
| `SYNAPSE_TEST_API_URL` | Synapse WMS base for the **create-order smoke test** — must be the test env (`https://pntb1.synapsewms.net/test/api`). Kept separate from `SYNAPSE_API_URL` so the write test never repoints the prod-read var. Falls back to `SYNAPSE_API_URL` if unset. |
| `SYNAPSE_TEST_USER`, `SYNAPSE_TEST_PASS` | Login for the test env (fall back to `SYNAPSE_USER`/`SYNAPSE_PASS`). Confirm these have **write** scope in test. |
| `POINTB_FEES_URL` | Integration API base (`integrations.pointbsolutions.com`) |
| `POINTB_FEES_USER`, `POINTB_FEES_PASS` | Integration API `/api/token` login — **email-based, must be requested from Point B** |
| `POINTB_CUSTOMER_ID` | `1590` |
| `POINTB_FACILITY` | `PB1` |
| `POINTB_SYNC_ENABLED` | Kill switch / pilot flag |

*The Integration API is used only for `order/fees` (freight + handling). Its
namespaced endpoints (`shipment-by-order`, inventory) are **not** used — the WMS
API covers those — so no `POINTB_NAMESPACE` is needed.*

---

*Companion to the in-app Technical Roadmap (`/technical-roadmap`). Reverse-
engineering detail lives in the session notes; this doc is the build spec. Keep
it current as the open questions get answered.*
