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
  QBCLASS.name AS Channel,
  so.salesman,
  PAYMENTTERMS.name AS paymentTerms,
  FOBPOINT.name AS fobPoint,
  CARRIER.name AS carrier,
  CARRIERSERVICE.name AS shipService
FROM so
LEFT JOIN customer ON so.customerId = customer.id
LEFT JOIN QBCLASS ON customer.qbClassId = QBCLASS.id
LEFT JOIN SOSTATUS ON so.statusId = SOSTATUS.id
LEFT JOIN STATECONST STATECONST_Bill ON so.billToStateId = STATECONST_Bill.id
LEFT JOIN STATECONST STATECONST_Ship ON so.shipToStateId = STATECONST_Ship.id
LEFT JOIN COUNTRYCONST COUNTRYCONST_Bill ON so.billToCountryId = COUNTRYCONST_Bill.id
LEFT JOIN COUNTRYCONST COUNTRYCONST_Ship ON so.shipToCountryId = COUNTRYCONST_Ship.id
LEFT JOIN PAYMENTTERMS ON so.paymentTermsId = PAYMENTTERMS.id
LEFT JOIN FOBPOINT ON so.fobPointId = FOBPOINT.id
LEFT JOIN CARRIER ON so.carrierId = CARRIER.id
LEFT JOIN CARRIERSERVICE ON so.carrierServiceId = CARRIERSERVICE.id`;

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

/**
 * Inventory valuation roll-forward, by item, for a period:
 *
 *   beginning  + purchased + produced + returned
 *              − consumed − shipped ± adjusted ± transferred  =  ending
 *
 * Built from what Fishbowl actually records (verified 2026-10-29):
 *  - BEGINNING / ENDING qty, average cost and value come from `partcosthistory`,
 *    Fishbowl's nightly 1 a.m. snapshot of every part (quantity, avgCost,
 *    totalCost — company-wide, all locations). Beginning = the snapshot on the
 *    start date (start of that day); ending = the snapshot the morning after
 *    the end date, or the latest one if that morning hasn't come yet.
 *  - MOVEMENTS come from `inventorylog` (every stock change since May 2021):
 *      Receive (10) split by what was received — PO receipts (purchases),
 *        work-order finished goods (produced), sales-order credit returns;
 *      Consume (50) = components used by work orders; Ship (20) = shipped,
 *        net of voided shipments (90); Cancel receipt (15) + adjust
 *        inc/dec/scrap/generic (60/64/65/67) = adjusted; transfer-order
 *        receipts (Yield 40 written by a receipt) = transferred.
 *    Every other Yield (40) and Transfer (30) row is stock moving between
 *    locations (e.g. to the ship dock) — not in or out of inventory — so it's
 *    left out. With that rule the log sums to today's on-hand company-wide
 *    (544,912 vs 544,110 units; 10 parts off, from old UOM changes).
 *  - PURCHASED VALUE is the actual PO price × quantity received (the log's own
 *    cost column does not add up to Fishbowl's valuation, so it isn't used).
 *    PRODUCED value is not shown: a finished good's value is moved from its
 *    components, and Fishbowl's average cost already reflects it in ENDING.
 *  - CHECK_QTY = beginning + movements − ending. Near zero means the period
 *    reconciles; a non-zero line is a part to look at (UOM change, a snapshot
 *    taken mid-activity, etc.).
 *  - OTHER_VALUE_OUT = beginning value + purchased value − ending value: the
 *    value that left (sold, used in production, adjusted) net of value that
 *    came in from production. For raw goods it's roughly cost used; for
 *    finished goods it's cost of goods shipped less cost of goods produced.
 *
 * Dates are YYYY-MM-DD, inclusive. Fishbowl's data-query endpoint takes one
 * SELECT (no variables), so the dates are written into each part of the query.
 */
export function inventoryValuationSql(start: string, end: string): string {
  const d = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Bad date ${s} — use YYYY-MM-DD`);
    return s;
  };
  const d0 = d(start);
  const d1 = d(end);
  // Period window for movements: [start 00:00, day after end 00:00).
  const from = `'${d0} 00:00:00'`;
  const to = `DATE_ADD('${d1}', INTERVAL 1 DAY)`;
  // The whole nightly snapshot taken on the morning of a day (or the latest
  // night before it, if a run was missed). A part that isn't in that night's
  // snapshot had nothing on hand — Fishbowl skips zero-quantity parts — so it
  // counts as 0 rather than falling back to an older, stale row.
  const snapshot = (day: string) => `
    SELECT h.partId, h.quantity, h.avgCost, h.totalCost
    FROM partcosthistory h
    JOIN (
      SELECT partId, MAX(id) AS mid
      FROM partcosthistory
      WHERE DATE(dateCaptured) = (
        SELECT DATE(MAX(dateCaptured)) FROM partcosthistory
        WHERE dateCaptured < DATE_ADD(${day}, INTERVAL 12 HOUR)
      )
      GROUP BY partId
    ) night ON night.mid = h.id`;

  return `SELECT
  p.num AS part,
  p.description AS description,
  u.code AS uom,
  ROUND(COALESCE(b.quantity, 0), 2) AS beg_qty,
  ROUND(COALESCE(b.avgCost, 0), 4) AS beg_avg_cost,
  ROUND(COALESCE(b.totalCost, 0), 2) AS beg_value,
  ROUND(COALESCE(m.purchased, 0), 2) AS purchased_qty,
  ROUND(COALESCE(pv.purchased_value, 0), 2) AS purchased_value,
  ROUND(COALESCE(m.produced, 0), 2) AS produced_qty,
  ROUND(COALESCE(m.returned, 0), 2) AS returned_qty,
  ROUND(COALESCE(m.consumed, 0), 2) AS consumed_qty,
  ROUND(COALESCE(m.shipped, 0), 2) AS shipped_qty,
  ROUND(COALESCE(m.adjusted, 0), 2) AS adjusted_qty,
  ROUND(COALESCE(m.transferred, 0), 2) AS transferred_qty,
  ROUND(COALESCE(e.quantity, 0), 2) AS end_qty,
  ROUND(COALESCE(e.avgCost, 0), 4) AS end_avg_cost,
  ROUND(COALESCE(e.totalCost, 0), 2) AS end_value,
  ROUND(COALESCE(b.quantity, 0) + COALESCE(m.purchased, 0) + COALESCE(m.produced, 0) + COALESCE(m.returned, 0)
        + COALESCE(m.consumed, 0) + COALESCE(m.shipped, 0) + COALESCE(m.adjusted, 0) + COALESCE(m.transferred, 0)
        - COALESCE(e.quantity, 0), 2) AS check_qty,
  ROUND(COALESCE(b.totalCost, 0) + COALESCE(pv.purchased_value, 0) - COALESCE(e.totalCost, 0), 2) AS other_value_out
FROM part p
LEFT JOIN uom u ON u.id = p.uomId
LEFT JOIN (${snapshot(`'${d0}'`)}
) b ON b.partId = p.id
LEFT JOIN (${snapshot(to)}
) e ON e.partId = p.id
LEFT JOIN (
  SELECT il.partId,
    SUM(CASE WHEN il.typeId = 10 AND il.tableId = 1259138490 AND il.info LIKE 'PO%' THEN il.changeQty ELSE 0 END) AS purchased,
    SUM(CASE WHEN il.typeId = 10 AND il.tableId = -355941248 THEN il.changeQty ELSE 0 END) AS produced,
    SUM(CASE WHEN il.typeId = 10 AND NOT (il.tableId = 1259138490 AND il.info LIKE 'PO%') AND il.tableId <> -355941248 THEN il.changeQty ELSE 0 END) AS returned,
    SUM(CASE WHEN il.typeId = 50 THEN il.changeQty ELSE 0 END) AS consumed,
    SUM(CASE WHEN il.typeId IN (20, 90) THEN il.changeQty ELSE 0 END) AS shipped,
    SUM(CASE WHEN il.typeId IN (15, 60, 64, 65, 67, 73, 74) THEN il.changeQty ELSE 0 END) AS adjusted,
    SUM(CASE WHEN il.typeId = 40 AND il.tableId = 1259138490 THEN il.changeQty ELSE 0 END) AS transferred
  FROM inventorylog il
  WHERE il.dateCreated >= ${from} AND il.dateCreated < ${to}
  GROUP BY il.partId
) m ON m.partId = p.id
LEFT JOIN (
  SELECT il.partId, SUM(il.changeQty * pi.unitCost) AS purchased_value
  FROM inventorylog il
  JOIN receiptitem ri ON ri.id = il.recordId
  JOIN poitem pi ON pi.id = ri.poItemId
  WHERE il.typeId = 10 AND il.tableId = 1259138490 AND il.info LIKE 'PO%'
    AND il.dateCreated >= ${from} AND il.dateCreated < ${to}
  GROUP BY il.partId
) pv ON pv.partId = p.id
WHERE COALESCE(b.quantity, 0) <> 0 OR COALESCE(e.quantity, 0) <> 0 OR m.partId IS NOT NULL
ORDER BY p.num`;
}
