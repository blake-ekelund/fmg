/**
 * Dry-run the MarketTime integration once MARKETTIME_API_KEY + MANUFACTURER_ID
 * are in .env.local:
 *   npx tsx scripts/test-markettime-sync.ts
 *
 * Two parts:
 *  (A) RAW probe — hits POST /orders/get directly and prints the response
 *      wrapper's top-level keys + the first order's field names, so the code's
 *      field mapping can be reconciled against what the live API actually
 *      returns (the OpenAPI spec's schema section is truncated when fetched).
 *  (B) MAPPED view — runs getMarketTimeOrders() and prints how each order
 *      would import (ref, retailer, items, SKU→Fishbowl coverage).
 *
 * Writes NOTHING. The API key stays in this process — it is never printed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

/** Shorten values so PII/long strings don't flood the log but shape stays clear. */
function preview(v: unknown): unknown {
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 40) + "…" : v;
  if (Array.isArray(v)) return `[${v.length} items]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).join(", ")}}`;
  return v;
}

async function rawProbe() {
  const key = (process.env.MARKETTIME_API_KEY ?? "").trim();
  const rawWho = (process.env.MARKETTIME_WHO_AM_I || process.env.MANUFACTURER_ID || "").trim().toUpperCase();
  const who = /^[RM]\d+$/.test(rawWho) ? rawWho : /^\d+$/.test(rawWho) ? `M${rawWho}` : rawWho;
  if (!key || !who) {
    console.log("MARKETTIME_API_KEY / MANUFACTURER_ID not set — skipping raw probe.");
    return;
  }
  console.log(`── RAW probe · whoAmI=${who} ─────────────────────────────`);
  const base = `https://publicapi.markettime.com/mtpublic/api/v1/${encodeURIComponent(who)}/orders/get`;

  const call = async (qs: string, body: unknown) => {
    const res = await fetch(`${base}?${qs}`, {
      method: "POST",
      headers: { "x-api-key": key, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const t = await res.text();
    let j: Record<string, unknown> = {};
    try { j = JSON.parse(t) as Record<string, unknown>; } catch { /* */ }
    return { status: res.status, ok: res.ok, j, raw: t };
  };
  const errMsg = (j: Record<string, unknown>) =>
    j.error && typeof j.error === "object" ? String((j.error as Record<string, unknown>).message ?? "") : "";

  // (i) total + is the default sort oldest- or newest-first?
  const head = await call("offset=0&recordSize=2", []);
  const total = Number(head.j.total) || 0;
  const headDates = (Array.isArray(head.j.response) ? head.j.response : []).map((o) => (o as Record<string, unknown>).orderDate);
  const tail = await call(`offset=${Math.max(0, total - 5)}&recordSize=5`, []);
  const tailRows = (Array.isArray(tail.j.response) ? tail.j.response : []) as Record<string, unknown>[];
  console.log(`total=${total}  head(offset0) dates=${JSON.stringify(headDates)}`);
  console.log(`tail(offset ${Math.max(0, total - 5)}) dates=${JSON.stringify(tailRows.map((o) => o.orderDate))}`);
  console.log("tail statuses (repGroup / manufacturer):");
  for (const o of tailRows)
    console.log(`   ${String(o.orderDate)}  ${o.repGroupOrderStatus} / ${o.manufacturerOrderStatus}  cancelDate=${o.cancelDate ?? "—"}  poNumber=${o.poNumber ?? "—"}`);

  // (ii) QueryFilter shape probes — read the descriptive error messages.
  console.log("\nQueryFilter probes:");
  const qfTries: Array<{ label: string; body: unknown }> = [
    { label: `field/operator/value gte orderDate`, body: [{ field: "orderDate", operator: "gte", value: "2026-01-01" }] },
    { label: `field/operator/value >= orderDate`, body: [{ field: "orderDate", operator: ">=", value: "2026-01-01" }] },
    { label: `fieldName/comparator`, body: [{ fieldName: "orderDate", comparator: "gte", value: "2026-01-01" }] },
    { label: `filter manufacturerOrderStatus = OPEN`, body: [{ field: "manufacturerOrderStatus", operator: "eq", value: "OPEN" }] },
  ];
  for (const q of qfTries) {
    const r = await call("offset=0&recordSize=3", q.body);
    const rows = (Array.isArray(r.j.response) ? r.j.response : []) as Record<string, unknown>[];
    console.log(`   [${r.status}] ${q.label} → total=${r.j.total ?? "—"} rows=${rows.length} dates=${JSON.stringify(rows.map((o) => o.orderDate))}${r.ok ? "" : ` — ${errMsg(r.j).slice(0, 140)}`}`);
  }
  console.log("");

  // Find a query-string that returns 200. The 500/400 responses carry a
  // descriptive error.message, so print it in full for each attempt.
  const attempts: Array<{ label: string; qs: string }> = [
    { label: "no sort params", qs: "offset=0&recordSize=3" },
    { label: "sortType=DESC", qs: "offset=0&recordSize=3&sortField=orderDate&sortType=DESC" },
    { label: "sortType=desc", qs: "offset=0&recordSize=3&sortField=orderDate&sortType=desc" },
    { label: "sortType=1", qs: "offset=0&recordSize=3&sortField=orderDate&sortType=1" },
    { label: "sortField=orderID sortType=DESC", qs: "offset=0&recordSize=3&sortField=orderID&sortType=DESC" },
  ];

  let text = "";
  let okQs: string | null = null;
  for (const a of attempts) {
    const res = await fetch(`${base}?${a.qs}`, {
      method: "POST",
      headers: { "x-api-key": key, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify([]),
      cache: "no-store",
    });
    const body = await res.text();
    let msg = "";
    try {
      msg = String((JSON.parse(body) as Record<string, unknown>)?.error && (JSON.parse(body).error as Record<string, unknown>).message || "");
    } catch { /* non-json */ }
    console.log(`  [${res.status}] ${a.label}${msg ? ` — ${msg.slice(0, 160)}` : ""}`);
    if (res.ok) { okQs = a.qs; text = body; break; }
    text = body;
  }
  if (!okQs) {
    console.log("\nNo attempt returned 200. Last body:", text.slice(0, 500));
    return;
  }
  console.log(`\n✓ 200 with: ${okQs}\n`);

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    console.log("Non-JSON body:", text.slice(0, 400));
    return;
  }
  const top = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  console.log("Response wrapper keys:", Object.keys(top));
  for (const [k, v] of Object.entries(top)) console.log(`  ${k}:`, preview(v));

  // Find the orders array wherever it lives.
  const arr =
    (Array.isArray(top.response) && top.response) ||
    (Array.isArray(top.successResponse) && top.successResponse) ||
    (Array.isArray(top.data) && top.data) ||
    (Array.isArray(top.result) && top.result) ||
    (Array.isArray(data) && data) ||
    [];
  console.log(`\nOrders returned: ${(arr as unknown[]).length}`);
  const first = (arr as unknown[])[0];
  if (first && typeof first === "object") {
    console.log("\nFirst order field names:");
    for (const [k, v] of Object.entries(first as Record<string, unknown>)) console.log(`  ${k}:`, preview(v));
    const details =
      (first as Record<string, unknown>).details ??
      (first as Record<string, unknown>).orderDetails ??
      (first as Record<string, unknown>).lineItems;
    const line = Array.isArray(details) ? details[0] : undefined;
    if (line && typeof line === "object") {
      console.log("\nFirst line-item field names:");
      for (const [k, v] of Object.entries(line as Record<string, unknown>)) console.log(`  ${k}:`, preview(v));
    } else {
      console.log("\n(no line-item array found under details/orderDetails/lineItems — check the order-detail field name)");
    }
  }
  console.log("");
}

async function mappedView() {
  const { markettimeConfigured, getMarketTimeOrders } = await import("../lib/markettime");
  if (!markettimeConfigured()) {
    console.log("── MAPPED view: markettimeConfigured() is false — check env names. ──");
    return;
  }
  console.log("── MAPPED view (via getMarketTimeOrders) ─────────────────");
  const orders = await getMarketTimeOrders();
  console.log(`Importable MarketTime orders: ${orders.length}\n`);

  const allSkus = new Set<string>();
  for (const o of orders) {
    console.log(
      `${(o.displayId + "-MKTTIME").padEnd(20)} ${o.state.slice(0, 18).padEnd(20)} ${String(
        o.retailerName ?? "?",
      )
        .slice(0, 28)
        .padEnd(30)} ${o.items.length} items  $${o.subtotal.toFixed(2)}`,
    );
    for (const it of o.items) {
      if (it.sku) allSkus.add(it.sku);
    }
  }

  if (allSkus.size > 0) {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await admin.from("inventory_products").select("part").in("part", Array.from(allSkus));
    const known = new Set((data ?? []).map((r) => r.part as string));
    const unknown = Array.from(allSkus).filter((s) => !known.has(s));
    console.log(`\nSKU check: ${known.size}/${allSkus.size} match Fishbowl part numbers.`);
    if (unknown.length) console.log("Unmatched SKUs (fix in MarketTime item settings):", unknown.join(", "));
  }
}

async function main() {
  await rawProbe();
  await mappedView();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
