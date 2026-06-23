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
