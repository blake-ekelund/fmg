/**
 * Canonical Fishbowl data-query SQL — Blake's saved "data views" for sales
 * orders and their line items. Pure strings (no server imports) so both the
 * server sync (lib/fishbowl.ts) and the client sandbox can share them without
 * drift. Orders ↔ items join on `soitem.soId = so.id`.
 *
 * Column aliases here are chosen to line up with the sales_orders_raw /
 * so_items_raw tables the manual upload writes (see components/inventory/
 * actions.ts), so the sync is a drop-in for that upload.
 */

export const SALES_ORDERS_SQL = `SELECT
  so.id,
  so.billToName,
  so.billToAddress,
  so.billToCity,
  STATECONST_Bill.name AS billToState,
  so.billToZip,
  COUNTRYCONST_Bill.name AS billToCountry,
  so.customerContact,
  so.customerId,
  so.customerPO,
  so.dateCreated,
  so.dateIssued,
  so.dateCompleted,
  so.email,
  so.num,
  so.phone,
  so.shipToName,
  so.shipToAddress,
  so.shipToCity,
  STATECONST_Ship.name AS shipToState,
  so.shipToZip,
  COUNTRYCONST_Ship.name AS shipToCountry,
  SOSTATUS.name AS status,
  so.totalPrice,
  so.customFields,
  QBCLASS.name AS Channel
FROM so
LEFT JOIN customer ON so.customerId = customer.id
LEFT JOIN QBCLASS ON customer.qbClassId = QBCLASS.id
LEFT JOIN SOSTATUS ON so.statusId = SOSTATUS.id
LEFT JOIN STATECONST STATECONST_Bill ON so.billToStateId = STATECONST_Bill.id
LEFT JOIN STATECONST STATECONST_Ship ON so.shipToStateId = STATECONST_Ship.id
LEFT JOIN COUNTRYCONST COUNTRYCONST_Bill ON so.billToCountryId = COUNTRYCONST_Bill.id
LEFT JOIN COUNTRYCONST COUNTRYCONST_Ship ON so.shipToCountryId = COUNTRYCONST_Ship.id`;

/**
 * Per-carton shipment tracking. Verified against this instance 2026-07-24.
 *
 * Fishbowl records shipping separately from the sales order: a `ship` header
 * (carrier, ship date, status) joined to the SO by `ship.soId = so.id`, with one
 * or more `shipcarton` rows — and the tracking number lives on the carton
 * (`shipcarton.trackingNum`), which is why nothing tracking-shaped is on `so`.
 *
 * Coverage is effectively 100% — every carton row carries a trackingNum. One row
 * per carton: an order can ship in several cartons / several shipments, each with
 * its own number. `dateShipped` is NULL until the shipment actually ships — a
 * pre-printed label already has a tracking number but no ship date.
 *
 * ⚠ Carrier is unreliable: ~96% of shipments book to carrier "RATESHOP" (a
 * rate-shopper), not the real carrier, so the actual carrier is derived from the
 * tracking-number format app-side (lib/tracking.ts `detectCarrier`). We still
 * pull `carrier.name` for the minority booked to a real carrier directly.
 */
export const SHIPMENTS_SQL = `SELECT
  ship.soId AS soId,
  so.num AS orderNum,
  ship.num AS shipmentNum,
  ship.dateShipped AS dateShipped,
  ship.statusId AS shipStatusId,
  ship.carrierId AS carrierId,
  carrier.name AS carrier,
  shipcarton.trackingNum AS trackingNum,
  shipcarton.cartonNum AS cartonNum
FROM shipcarton
JOIN ship ON shipcarton.shipId = ship.id
LEFT JOIN so ON ship.soId = so.id
LEFT JOIN carrier ON ship.carrierId = carrier.id
WHERE shipcarton.trackingNum IS NOT NULL AND shipcarton.trackingNum <> ''`;

/* Discovery probes — run these first. Each returns a handful of rows so the
   real column names are visible; `SELECT *` is deliberate here. */
export const SHIP_PROBE_HEADER = `SELECT * FROM ship LIMIT 5`;
export const SHIP_PROBE_CARTON = `SELECT * FROM shipcarton LIMIT 5`;
export const SHIP_PROBE_CARRIER = `SELECT * FROM carrier LIMIT 25`;

export const LINE_ITEMS_SQL = `SELECT
  soitem.id,
  soitem.description,
  soitem.productId,
  soitem.productNum,
  soitem.qtyFulfilled,
  soitem.qtyOrdered,
  soitem.soId,
  soitem.soLineItem,
  soitem.statusId,
  soitem.totalCost,
  soitem.totalPrice,
  soitemtype.name AS typeName
FROM soitem
LEFT JOIN so ON soitem.soId = so.id
LEFT JOIN SOITEMTYPE ON soitem.typeId = SOITEMTYPE.id`;

/**
 * Point B Solutions location group id, validated 2026-06-23 (the warehouse the
 * storefront/forecasting inventory comes from). Interpolated as a number into
 * INVENTORY_SQL below — never a user value, so it can't be SQL-injected.
 */
export const POINT_B_LOCATION_GROUP_ID = 1;

/**
 * Reproduces Fishbowl's "Inventory Availability" report filtered to the Point B
 * Solutions location group — the manual `inv.xls` upload, automated. Reverse-
 * engineered + validated column-by-column against a real export (2026-06-23):
 *
 *  - On Hand     = SUM(qohview.qty) for the group  (per-tag on-hand)
 *  - Allocated   = qtyallocated      (committed reservations)
 *  - NotAvailable= qtynotavailable
 *  - DropShip    = qtydropship
 *  - OnOrder     = qtyonorder        (incoming, currently all PO)
 *  - Committed   = qtycommitted
 *  - Available   = max(0, OnHand − Allocated − NotAvailable)   (Fishbowl clamps at 0)
 *  - Short       = max(0, Allocated + NotAvailable − OnHand)
 *
 * Part universe = parts that have a tag in the group (qohview), which is exactly
 * what the report lists; on-order-only parts with no tag are excluded, as in the
 * report. The qty* views are pre-aggregated per (partId, locationGroupId).
 */
export const INVENTORY_SQL = `SELECT
  p.num AS part,
  p.description AS description,
  uom.code AS uom,
  oh.qty AS onHand,
  COALESCE(al.qty, 0) AS allocated,
  COALESCE(na.qty, 0) AS notAvailable,
  COALESCE(ds.qty, 0) AS dropShip,
  GREATEST(oh.qty - COALESCE(al.qty, 0) - COALESCE(na.qty, 0), 0) AS available,
  COALESCE(oo.qty, 0) AS onOrder,
  COALESCE(cm.qty, 0) AS committed,
  GREATEST(COALESCE(al.qty, 0) + COALESCE(na.qty, 0) - oh.qty, 0) AS shortQty
FROM (
  SELECT partId, SUM(qty) AS qty
  FROM qohview
  WHERE locationGroupId = ${POINT_B_LOCATION_GROUP_ID} AND partId IS NOT NULL
  GROUP BY partId
) oh
JOIN part p ON p.id = oh.partId
LEFT JOIN uom ON p.uomId = uom.id
LEFT JOIN qtyallocated    al ON al.partId = oh.partId AND al.locationGroupId = ${POINT_B_LOCATION_GROUP_ID}
LEFT JOIN qtynotavailable na ON na.partId = oh.partId AND na.locationGroupId = ${POINT_B_LOCATION_GROUP_ID}
LEFT JOIN qtydropship     ds ON ds.partId = oh.partId AND ds.locationGroupId = ${POINT_B_LOCATION_GROUP_ID}
LEFT JOIN qtyonorder      oo ON oo.partId = oh.partId AND oo.locationGroupId = ${POINT_B_LOCATION_GROUP_ID}
LEFT JOIN qtycommitted    cm ON cm.partId = oh.partId AND cm.locationGroupId = ${POINT_B_LOCATION_GROUP_ID}
ORDER BY p.num`;
