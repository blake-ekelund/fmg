-- Inventory valuation roll-forward, by item (Fishbowl, read-only).
--
-- !! FISHBOWL ONLY (MySQL / MariaDB). This does NOT run in Supabase's SQL editor (Postgres) —
-- !! the tables (inventorylog, partcosthistory, part…) live in Fishbowl, not Supabase, and
-- !! Postgres rejects the MySQL syntax (e.g. "syntax error at or near 12" on DATE_ADD … INTERVAL).
-- !! Run it from the portal's Fishbowl sandbox (/fishbowl-sandbox) or inside Fishbowl itself.
--
-- beginning + purchased + produced + returned - consumed - shipped +/- adjusted +/- transferred = ending
--
-- HOW TO USE: change the two dates below. The period here is 2026-01-01 to 2026-10-28;
-- each date appears several times — use Find & Replace on '2026-01-01' (start) and '2026-10-28' (end).
-- Easiest: FMG portal → Fishbowl sandbox → "▸ Acct: inventory valuation (YTD)" → Run → Download CSV.
--
-- Columns: beg_/end_ qty, avg cost and value come from Fishbowl's nightly cost snapshot
-- (partcosthistory) — beginning = morning of the start date, ending = morning after the end date.
-- purchased_value = actual PO price x qty received. check_qty should be 0 (reconciles).
-- other_value_out = beg_value + purchased_value - end_value (value sold/used/adjusted, net of
-- value produced). Generated from lib/fishbowlQueries.ts inventoryValuationSql() — edit there.
-- Verified 2026-10-29: Sep-2026 and YTD reconcile on every item but 150-00-07 (a 450-unit adjustment).

SELECT
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
LEFT JOIN (
    SELECT h.partId, h.quantity, h.avgCost, h.totalCost
    FROM partcosthistory h
    JOIN (
      SELECT partId, MAX(id) AS mid
      FROM partcosthistory
      WHERE DATE(dateCaptured) = (
        SELECT DATE(MAX(dateCaptured)) FROM partcosthistory
        WHERE dateCaptured < DATE_ADD('2026-01-01', INTERVAL 12 HOUR)
      )
      GROUP BY partId
    ) night ON night.mid = h.id
) b ON b.partId = p.id
LEFT JOIN (
    SELECT h.partId, h.quantity, h.avgCost, h.totalCost
    FROM partcosthistory h
    JOIN (
      SELECT partId, MAX(id) AS mid
      FROM partcosthistory
      WHERE DATE(dateCaptured) = (
        SELECT DATE(MAX(dateCaptured)) FROM partcosthistory
        WHERE dateCaptured < DATE_ADD(DATE_ADD('2026-10-28', INTERVAL 1 DAY), INTERVAL 12 HOUR)
      )
      GROUP BY partId
    ) night ON night.mid = h.id
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
  WHERE il.dateCreated >= '2026-01-01 00:00:00' AND il.dateCreated < DATE_ADD('2026-10-28', INTERVAL 1 DAY)
  GROUP BY il.partId
) m ON m.partId = p.id
LEFT JOIN (
  SELECT il.partId, SUM(il.changeQty * pi.unitCost) AS purchased_value
  FROM inventorylog il
  JOIN receiptitem ri ON ri.id = il.recordId
  JOIN poitem pi ON pi.id = ri.poItemId
  WHERE il.typeId = 10 AND il.tableId = 1259138490 AND il.info LIKE 'PO%'
    AND il.dateCreated >= '2026-01-01 00:00:00' AND il.dateCreated < DATE_ADD('2026-10-28', INTERVAL 1 DAY)
  GROUP BY il.partId
) pv ON pv.partId = p.id
WHERE COALESCE(b.quantity, 0) <> 0 OR COALESCE(e.quantity, 0) <> 0 OR m.partId IS NOT NULL
ORDER BY p.num;
