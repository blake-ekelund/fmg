# Marketplace → Fishbowl: the field contract, and where it breaks

> **What this is.** Every field that travels from Faire or MarketTime into a
> Fishbowl sales order, who owns it, and — the point of the document — every
> place the two records are known to disagree. Written from a live audit, not
> from reading the code: on **2026-09-22** the last 49 pushed marketplace orders
> were compared field by field against their Fishbowl SOs and against live Point
> B stock. The counts below are that sample.
>
> Companion to [pointb-connector.md](./pointb-connector.md), which documents the
> next leg (Fishbowl → Point B). Same idea as `lib/pointbFieldMap.ts`: write the
> contract down so a change on either side is caught by a person instead of by a
> customer.

## How an order gets there

```
Faire / MarketTime
   └─ lib/faire.ts · lib/markettimeImport.ts   → Supabase `orders` row
        └─ lib/fishbowlEstimate.ts              → SalesOrderDetails import rows
             └─ lib/fishbowl.ts createEstimate  → Fishbowl SO, status 10 (Estimate)
```

Three systems, and **nothing compared the first to the last** until
`lib/fishbowlDivergence.ts` and the "Fishbowl check" card on the order page.
That is why the divergences below went unnoticed for months.

## The contract

`SALES_ORDER_IMPORT_HEADER` in `lib/fishbowlEstimate.ts` is the authoritative
column list. What fills each one:

| Fishbowl field | Source | Owner | Notes |
|---|---|---|---|
| `SONum` | — | Fishbowl | Sent blank; Fishbowl auto-numbers. We pick the next free number ourselves (`nextFreeSoNumber`) because a blank is rejected. |
| `Status` | constant `10` | us | Estimate. A human converts it. |
| `CustomerName` | `orders.fishbowl_customer` | matcher + human | Set by `lib/customerMatch.ts`, overridable on the order page. **No match → no push.** |
| `PONum` | Faire: `<external_ref>-FAIRE`; MarketTime: `<external_po>-MKTTIME` | marketplace | `fishbowlCustomerPo()`. The RETAILER's PO for MarketTime (it has two ids; see D4), the display id for Faire. Also the exact-match dedupe key. |
| `QuickBooksClassName` | `customer.qbClassId → qbclass.name` | Fishbowl customer record | Was hardcoded `WEB`. See D1. |
| `ItemQuickBooksClassName` | same | same | Was blank. See D2. |
| `PaymentTerms` | `paymentTermsFor()` | marketplace | Faire → `FAIRE NET 30` always; MarketTime → its own classified terms, `NET 30` fallback. |
| `CF-Territory Agency/Code/Sales Rep Name` | `customer.customFields` | Fishbowl customer record | `applyTerritory()`. House defaults only when the customer carries none. |
| `CF-Order Source` | `faire` / `markettime` | us | `FAIRE` / `MARKETTIME`. |
| `Salesman` | the agency's Fishbowl user | Fishbowl | Only set when a `sysuser` with that name exists, or the import rejects the row. |
| `TaxRateName` | constant `None` | us | Both marketplaces remit sales tax themselves. |
| `LocationGroupName` | constant `Point B Solutions` | us | How the 3PL connector picks the SO up. |
| `CarrierName` | constant `RATESHOP` | us | Point B rate-shops. |
| Ship-to / bill-to | the marketplace address | marketplace | Blank blocks backfill from the customer's default address (`backfillAddresses`). |
| Line `ProductNumber` / `Quantity` / `Price` | marketplace line | marketplace | Kits expanded — see B1. |
| Trailing line | Subtotal (type 40) | us | Marketplace orders get a Subtotal, not a Shipping line: the marketplaces bill freight themselves. |

## By design — divergences that are correct

These will always show up in a naive comparison. Don't "fix" them.

**B1 · A kit disappears into its components.** `512-03-99` (a PREPACK display)
is one line on the MarketTime order and thirteen on the SO, because Fishbowl
prices and picks the components, not the display. Multi-level kits we expand
ourselves (`lib/fishbowlKits.ts`); single-level ones Fishbowl expands on import.
Consequence: an order containing a kit **cannot be reconciled on subtotal alone**
— component prices need not sum to the kit price. `compareOrderToSo` skips the
subtotal check for such orders.

**B2 · The same part can legitimately appear twice.** SO 24787 has `123-00-04`
on lines 1 and 3: six loose, six out of an expanded display. Any comparison
must sum by part, never match line-for-line.

**B3 · Faire payment terms are renamed.** The order carries `FAIRE`; the SO says
`FAIRE NET 30`, which is the real Fishbowl payment-term name. Intended.

**B4 · Ship-by dates move.** `orders.scheduled_ship_date` is captured once by
reconciliation; ops then edits `dateFirstShip` on the SO. Fishbowl is the newer
truth. (2 of 49.)

## Divergences that are real

### D1 · The SO booked under the wrong QuickBooks class — **fixed 2026-09-22**

**25 of 49.** Every estimate carried the hardcoded class `WEB` regardless of the
customer. CHINOOK WINDS CASINO (customer class `CASINOS`) and KANAB DRUG
(`PHARMACY`) both landed on the SO as `WEB`. QuickBooks reports revenue **by
class**, and 13 classes are in active use, so this silently moved wholesale
revenue into the web bucket. Ops was correcting some of them by hand — which is
why some SOs in the sample do match.

Fixed: `createEstimate` reads `customer.qbClassId → qbclass.name` and
`applyQuickBooksClass()` stamps it. `QB_CLASS_FALLBACK` (`WEB`) applies only to
a customer with no class at all — there are none today.

### D2 · Line items had no class at all — **fixed 2026-09-22**

**44 of 49.** `ItemQuickBooksClassName` was sent blank, and Fishbowl does *not*
inherit the header class on import: our lines landed as class `None` while the
header said `WEB`. Hand-keyed SOs carry the class on every line. Now set to the
same customer class as the header.

### D3 · The order and the SO drift apart after the push, silently

**24 of 49 no longer agree on money.** The worst case in the sample, SO 24872
(MarketTime 32862531): three lines the order still carries are absent from the
SO (`511-06-99`, `140-00-06`, `140-01-06`), two lines the order never had are
present, and the **Subtotal line sits above two sale lines** — so the subtotal
doesn't cover them. Order says $468.50; the SO's sale lines add to $180.50.

Two causes, and from the records alone they are not always separable:

- **Out-of-stock trimming by hand.** Confirmed against live Synapse: SO 24817
  lost `160-00-02` (Point B holds **0**) and had `160-00-04` cut from 6 to 2
  (Point B holds exactly **2**). Someone opened the SO and deleted what we had
  just imported. This is what the stock gate in D5 exists to prevent.
- **A part-committed import.** The Fishbowl importer commits the lines it likes
  before failing on one it doesn't (this is documented in `lib/fishbowlKits.ts`
  for multi-level kits). Lines below a Subtotal line are that signature.

Surfaced by `lines-after-subtotal`, `line-missing`, `line-extra`, `line-qty`,
`line-price` and `subtotal-mismatch` in `lib/fishbowlDivergence.ts`. **Not**
auto-corrected — rewriting a sales order a human has edited would be worse than
the drift.

### D4 · The Customer PO held MarketTime's internal id, not the retailer's PO — **fixed 2026-09-22**

**26 of 49.** MarketTime hands us two different identifiers and we were writing
the wrong one:

| | value | what it is |
|---|---|---|
| `orders.external_ref` | `32850850` | MarketTime's internal **recordID** |
| `orders.external_po` | `22604073` | the **retailer's own PO**, as they wrote it |

We put `<recordID>-MKTTIME` in the Customer PO box, so the number the retailer
recognises appeared nowhere on the SO — not on their invoice, not on their
packing slip.

The deciding evidence is what ops does by hand. Of the 40 `-MKTTIME` SOs in the
recent window, **31 carry the recordID (all ours) and 9 carry the retailer PO
(all hand-keyed)** — `LK7057716H-MKTTIME`, `JD917-MKTTIME`,
`CP3195584B-MKTTIME`, `219-6258218N-MKTTIME`. The house convention is the
retailer's PO; our pushes were the exception. It is also true of the wider
book: 2,096 of 2026's SOs carry a plain retailer PO and only 68 carry our
suffixed marketplace ids.

Fixed by `fishbowlCustomerPo()` in lib/storefrontOrder.ts — MarketTime now
books as `<retailerPO>-MKTTIME`, falling back to the recordID when no usable PO
came through. **Faire is unchanged**: its display id IS the retailer-facing
order id and what ops keys.

Three things that had to move with it:

- **Dedupe.** The recordID stays the unique key (`dedupeContains`), so orders
  pushed under the old convention still dedupe and can't double-enter. The new
  exact-PO match additionally catches ops' hand-keyed SOs, which it never did
  before.
- **PO collisions.** A retailer PO is chosen by the retailer, so two shops can
  pick the same one, where a recordID never repeats. An unscoped match would
  silently stamp a real order "already entered" against a stranger's SO. So the
  exact-PO branch is scoped to the order's own customer
  (`dedupeExactScopedToCustomer`); `num` and the recordID stay global. All 41
  MarketTime POs on file today are distinct, so this is a guard, not a fix.
- **Tracking sync.** It matched shipments by looking for the recordID inside
  `customerPO`, so it now searches the retailer PO as well. That also closes an
  existing hole: hand-keyed MarketTime SOs never matched, so tracking never
  landed on those orders and the customer never got a shipped email.

**Not backfilled.** SOs already in Fishbowl keep the recordID; `retailer-po-absent`
will keep flagging them, which is correct — they really don't carry it.
`VendorPONum` was considered as a second home for the id and rejected: it is
filled on 5 of 5,802 SOs since 2025 and the values are junk (part numbers,
`FAIRE`, `TOWER`). It is a dead field nobody reads.

⚠️ `<retailerPO>-MKTTIME` reaches 20 characters at the longest PO on file
(`219-6258218N-MKTTIME`), which is exactly the Synapse `reference` limit — see
[pointb-connector.md](./pointb-connector.md) §5a. A longer PO would need
truncating there.

### D5 · Orders were pushed that Point B could not fill — **gated 2026-09-22**

The direct cause of half of D3. `lib/orderStockCheck.ts` now compares every
line — kits expanded to the parts Point B actually holds — against live Synapse
availability *before* anything is written to Fishbowl. Short lines block the
push; the order keeps its "Needs Fishbowl" status with the reason in
`orders.fishbowl_stock_hold`, and the 15-minute sweep retries by itself once the
warehouse receives.

It deliberately does **not** block on stock it can't vouch for: a part Synapse
has never heard of (411 items are stocked; kits and discontinued parts aren't
among them) or one counted in cases rather than eaches (7 items) produces a
warning and the push continues. Point B being unreachable never blocks — a 3PL
outage must not stop order entry.

The manual button can override with "Push anyway"; the cron cannot.

### D6 · Older marketplace SOs carry `.COM Tax`

**4 of 49**, all from before the tax-rate change. Harmless history — the rate is
0% — but it implies we collected tax on an order where Faire or MarketTime did.
No action; new pushes send `None`.

### D7 · Backorder siblings aren't tagged

**2 of 49.** SOs a human split off by hand (`24794BO`, `24750-BO SHP 10.1`)
carry no `CF-Order Source`, so they don't attribute to the marketplace in
Fishbowl reporting. Human-keyed, so this is a process note, not a code fix.

## How to re-run the audit

```bash
npx tsx scripts/audit-marketplace-divergence.ts
```

Read-only against both systems. It prints a tally of every divergence class with
examples — the same comparison `lib/fishbowlDivergence.ts` runs per order, over
the whole recent book. Run it after any change to the estimate mapping, and when
Fishbowl or a marketplace changes something on their end.

Per order, the same check is a button: **Fishbowl check** on the order detail
page (`/api/storefront-orders/[id]/fishbowl-check`).

## Known limits of the checks

- The per-order check expands kits **one level**; a nested kit shows as an
  unknown part rather than its grandchildren. The push gate walks the full
  closure — it is the one that decides.
- Stock is read from Synapse, which is truth for what is on a shelf, but it is
  a point-in-time read (cached 2 minutes during a sweep). An order pushed at
  09:00 can still be short by 11:00.
- `qbclass` has two rows named `None` (ids 1 and 171). Only id 1 is in use, so
  matching a class by name is unambiguous today; if 171 is ever populated, the
  import's name match becomes a coin flip.
