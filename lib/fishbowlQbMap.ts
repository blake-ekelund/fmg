/**
 * How Fishbowl talks to QuickBooks Desktop: which QB accounts it posts to, and
 * what each kind of posting looks like — for the Accounting → QuickBooks
 * Connection page. Read-only, one Fishbowl session.
 *
 * Where Fishbowl keeps it (verified 2026-10-30):
 *  - `asaccount`        Fishbowl's copy of the QuickBooks chart of accounts
 *                       (synced nightly; typeId → asaccounttype).
 *  - `sysproperties`    the DEFAULT accounts, keys "Acct ID <purpose>" whose
 *                       value is an asaccount id (inventoryAsset, cogsAccount,
 *                       salesRetail, ShippingIncome, Inventory Adjustment…).
 *  - per-item overrides part.inventoryAccountId / cogsAccountId /
 *                       adjustmentAccountId / scrapAccountId /
 *                       varianceAccountId, product.incomeAccountId; null =
 *                       use the default.
 *  - `itemadjust`       discount / adjustment reasons → expense + income accts.
 *  - `paymentmethod`    deposit account (null = Undeposited Funds default).
 *  - `post` + `posttype` the posting queue: Ship (invoice + COGS), Payment,
 *                       Adjust, Customer/Vendor Change; postso/postsoitem hold
 *                       the invoice lines, postransaction the payment money
 *                       (post.amount is 0 for payments).
 *  - QBO sysproperties (QboCompanyId…) are "None": Fishbowl isn't connected
 *    to QuickBooks Online — only Desktop.
 */

import { withFishbowl } from "@/lib/fishbowl";

export type QbAccount = { id: number; number: string; name: string; type: string; active: boolean };

export type DefaultMapping = { key: string; purpose: string; account: QbAccount | null };

export type OverrideGroup = {
  field: string;
  label: string;
  account: QbAccount | null;
  items: number;
  active: number;
  examples: string[];
};

export type EntryLine = { account: string; debit: number; credit: number; memo?: string };

export type Snippet = {
  type: string;
  title: string;
  when: string | null;
  summary: string;
  /** What lands in QuickBooks, as debit/credit lines (or a note for non-$ records). */
  lines: EntryLine[];
  note?: string;
};

export type QbConnection = {
  company: string | null;
  qboConnected: boolean;
  lastExports: { at: string; ok: boolean; error: string | null }[];
  defaults: DefaultMapping[];
  overrides: OverrideGroup[];
  adjustReasons: { reason: string; expense: string | null; income: string | null }[];
  paymentDeposit: string;
  chart: { type: string; total: number; active: number }[];
  activity: { type: string; month: string; count: number; amount: number }[];
  snippets: Snippet[];
  alerts: { title: string; detail: string }[];
  loadedAt: string;
};

/** What each default is used for, in plain words. Keys not listed are shown as-is. */
const PURPOSE: Record<string, string> = {
  "Acct ID accountsReceivable": "Customer invoices (what customers owe)",
  "Acct ID accountsPayable": "Vendor bills (what FMG owes) — not posted by Fishbowl today",
  "Acct ID salesRetail": "Product sales on invoices (unless the product has its own income account)",
  "Acct ID ShippingIncome": "Shipping charged on invoices",
  "Acct ID Discount Income": "Discount lines on invoices",
  "Acct ID Discount Expense": "Discounts given",
  "Acct ID inventoryAsset": "Inventory value — credited when goods ship or are adjusted down",
  "Acct ID cogsAccount": "Cost of goods shipped",
  "Acct ID Inventory Adjustment": "The other side of inventory adjustments / cycle counts",
  "Acct ID Scrapped Inventory": "Scrapped / damaged inventory",
  "Acct ID Cost Variance": "Differences between expected and actual cost",
  "Acct ID Undeposited Funds": "Customer payments received",
  "Acct ID ShippingAccrual": "Shipping cost accrued",
  "Acct ID ShippingExpense": "Shipping cost",
  "Acct ID Labor": "Labor on work orders",
  "Acct ID Overhead": "Overhead on work orders",
  "Acct ID Miscellaneous Expense": "Miscellaneous",
  "Acct ID Non-Inventory": "Non-inventory items",
  "Acct ID Service": "Service items",
  "Acct ID Internal Use": "Inventory used internally",
  "Acct ID Capital Equipment": "Capital equipment",
  "Acct ID Customer Prepayment": "Customer prepayments",
  "Acct ID Holding": "Holding",
  "Acct ID Sales Tax": "Sales tax collected",
};

const OVERRIDE_FIELDS: { table: "part" | "product"; field: string; label: string }[] = [
  { table: "part", field: "inventoryAccountId", label: "Inventory account (part)" },
  { table: "part", field: "cogsAccountId", label: "COGS account (part)" },
  { table: "part", field: "adjustmentAccountId", label: "Adjustment account (part)" },
  { table: "part", field: "scrapAccountId", label: "Scrap account (part)" },
  { table: "part", field: "varianceAccountId", label: "Variance account (part)" },
  { table: "product", field: "incomeAccountId", label: "Income account (product)" },
];

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (x: number) => Math.round(x * 100) / 100;

let cache: { at: number; data: QbConnection } | null = null;
const CACHE_MS = 10 * 60_000;

export async function loadQbConnection(opts: { fresh?: boolean } = {}): Promise<QbConnection> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const data = await withFishbowl(async (q) => {
    const accRows = await q(`
      SELECT a.id, a.accountNumber AS num, a.name, t.name AS type, a.activeFlag AS active
      FROM asaccount a LEFT JOIN asaccounttype t ON t.id = a.typeId`);
    const acc = new Map<number, QbAccount>(
      accRows.map((r) => [n(r.id), { id: n(r.id), number: s(r.num), name: s(r.name), type: s(r.type), active: !!r.active }]),
    );
    const label = (a: QbAccount | null | undefined) => (a ? `${a.number ? `${a.number} · ` : ""}${a.name}` : null);

    const props = await q(`
      SELECT sysKey AS k, sysValue AS v FROM sysproperties
      WHERE sysKey LIKE 'Acct ID%' OR sysKey IN ('AccountingCompanyName', 'QboCompanyId')`);
    const prop = new Map(props.map((p) => [s(p.k), s(p.v)]));
    const defaults: DefaultMapping[] = props
      .filter((p) => s(p.k).startsWith("Acct ID"))
      .map((p) => ({ key: s(p.k), purpose: PURPOSE[s(p.k)] ?? s(p.k).replace(/^Acct ID /, ""), account: acc.get(n(p.v)) ?? null }))
      .sort((a, b) => Number(!a.account) - Number(!b.account) || a.purpose.localeCompare(b.purpose));
    const def = (key: string) => acc.get(n(prop.get(key))) ?? null;

    const overrides: OverrideGroup[] = [];
    for (const o of OVERRIDE_FIELDS) {
      const rows = await q(`
        SELECT x.${o.field} AS aid, COUNT(*) AS items, SUM(x.activeFlag) AS active,
               SUBSTRING_INDEX(GROUP_CONCAT(x.num ORDER BY x.activeFlag DESC, x.num SEPARATOR ','), ',', 4) AS ex
        FROM ${o.table} x
        WHERE x.${o.field} IS NOT NULL
        GROUP BY x.${o.field}`);
      for (const r of rows) {
        overrides.push({
          field: o.field,
          label: o.label,
          account: acc.get(n(r.aid)) ?? null,
          items: n(r.items),
          active: n(r.active),
          examples: s(r.ex).split(",").filter(Boolean),
        });
      }
    }

    const reasons = await q(`
      SELECT ia.name AS reason, ea.id AS eid, ii.id AS iid
      FROM itemadjust ia
      LEFT JOIN asaccount ea ON ea.id = ia.expenseAsAccountId
      LEFT JOIN asaccount ii ON ii.id = ia.incomeAsAccountId
      ORDER BY (ea.id IS NULL), ia.name`);
    const pm = await q(`SELECT COUNT(*) AS c, SUM(depositAccountId IS NOT NULL) AS mapped FROM paymentmethod`);

    const chart = await q(`
      SELECT t.name AS type, COUNT(*) AS total, SUM(a.activeFlag) AS active
      FROM asaccount a JOIN asaccounttype t ON t.id = a.typeId
      GROUP BY t.name ORDER BY total DESC`);
    const exports = await q(`SELECT dateExportStart AS at, error FROM accountingexportlog ORDER BY id DESC LIMIT 5`);
    const activity = await q(`
      SELECT pt.name AS type, DATE_FORMAT(p.datePosted, '%Y-%m') AS m, COUNT(*) AS c,
             SUM(CASE WHEN p.typeId = 20 THEN p.postedTotalCost ELSE p.amount END) AS amt
      FROM post p JOIN posttype pt ON pt.id = p.typeId
      WHERE p.statusId = 20 AND p.datePosted >= '2026-01-01'
      GROUP BY pt.name, m ORDER BY m, pt.name`);

    /* ─── One real example of each kind of posting ─── */
    const snippets: Snippet[] = [];
    const ar = label(def("Acct ID accountsReceivable")) ?? "Accounts Receivable";
    const sales = label(def("Acct ID salesRetail")) ?? "Gross Sales";
    const shipInc = label(def("Acct ID ShippingIncome")) ?? "Freight Revenue";
    const invAsset = label(def("Acct ID inventoryAsset")) ?? "Inventory Asset";
    const cogs = label(def("Acct ID cogsAccount")) ?? "COGS";
    const undeposited = label(def("Acct ID Undeposited Funds")) ?? "Undeposited Funds";
    const adjAcct = label(def("Acct ID Inventory Adjustment")) ?? "Inventory Adjustment";

    // Ship → Invoice (a recent wholesale order with a handful of lines).
    const inv = await q(`
      SELECT so.id AS soId, so.num, c.name AS customer, ps.extTxnNumber AS qbNum, ps.datePosted AS posted, COUNT(psi.id) AS nl
      FROM postso ps JOIN so ON so.id = ps.soId
      LEFT JOIN customer c ON c.id = so.customerId
      JOIN postsoitem psi ON psi.postSOId = ps.id
      WHERE ps.datePosted IS NOT NULL AND c.name <> 'SHOPIFY CUSTOMER'
      GROUP BY so.id, so.num, c.name, ps.extTxnNumber, ps.datePosted
      HAVING nl BETWEEN 3 AND 10
      ORDER BY ps.datePosted DESC LIMIT 1`);
    if (inv[0]) {
      const soId = n(inv[0].soId);
      const lines = await q(`
        SELECT si.productNum AS pn, si.typeId AS t, psi.qty, psi.totalPrice AS price, pr.incomeAccountId AS inc
        FROM postsoitem psi JOIN postso ps ON ps.id = psi.postSOId
        JOIN soitem si ON si.id = psi.soItemId
        LEFT JOIN product pr ON pr.id = si.productId
        WHERE ps.soId = ${soId}`);
      const credit = new Map<string, number>();
      let total = 0;
      for (const l of lines) {
        const t = n(l.t);
        if (t === 40) continue; // subtotal line — not posted
        const amt = n(l.price);
        const account = t === 60 ? shipInc : label(acc.get(n(l.inc))) ?? sales;
        credit.set(account, (credit.get(account) ?? 0) + amt);
        total += amt;
      }
      const cogsRows = await q(`SELECT SUM(postedTotalCost) AS cost FROM post WHERE typeId = 20 AND orderId = ${soId}`);
      const cost = r2(n(cogsRows[0]?.cost));
      snippets.push({
        type: "Ship",
        title: `Invoice — SO ${s(inv[0].num)} · ${s(inv[0].customer)}`,
        when: s(inv[0].posted) || null,
        summary: `When an order ships, Fishbowl sends QuickBooks an invoice${inv[0].qbNum ? ` (QB invoice #${s(inv[0].qbNum)})` : ""} for the shipped lines.`,
        lines: [
          { account: ar, debit: r2(total), credit: 0 },
          ...[...credit.entries()].map(([account, amt]) => ({ account, debit: 0, credit: r2(amt) })),
        ],
      });
      snippets.push({
        type: "Ship",
        title: `Cost of goods — same shipment`,
        when: s(inv[0].posted) || null,
        summary: "…and a journal entry moving the shipped items' cost out of inventory.",
        lines: [
          { account: cogs, debit: cost, credit: 0 },
          { account: invAsset, debit: 0, credit: cost },
        ],
        note: "Parts with their own COGS / inventory account (testers, displays, fills) post to those instead.",
      });
    }

    // Payment → received payment.
    const pay = await q(`
      SELECT pt.amount, pm.name AS method, so.num, c.name AS customer, p.datePosted AS posted
      FROM post p JOIN postransaction pt ON pt.id = p.refId
      LEFT JOIN paymentmethod pm ON pm.id = pt.paymentMethodId
      LEFT JOIN so ON so.id = pt.soId
      LEFT JOIN customer c ON c.id = so.customerId
      WHERE p.typeId = 40 AND p.statusId = 20 AND pt.amount > 0
      ORDER BY p.id DESC LIMIT 1`);
    if (pay[0]) {
      const amt = r2(n(pay[0].amount));
      snippets.push({
        type: "Payment",
        title: `Payment — SO ${s(pay[0].num)} · ${s(pay[0].customer)} (${s(pay[0].method)})`,
        when: s(pay[0].posted) || null,
        summary: "A payment taken in Fishbowl is sent as a received payment against the customer's invoice.",
        lines: [
          { account: undeposited, debit: amt, credit: 0 },
          { account: ar, debit: 0, credit: amt },
        ],
        note: "No payment method has its own deposit account, so every payment lands in Undeposited Funds.",
      });
    }

    // Adjust → inventory adjustment journal entry.
    // Which way it went comes from the matching inventory-log row (adj:inc 64
    // vs adj:dec 65 / scrap 67) just before the posting was queued.
    const adj = await q(`
      SELECT pa.num AS part, pa.description AS d, p.quantity AS qty, p.postedTotalCost AS cost, p.datePosted AS posted,
        (SELECT il.typeId FROM inventorylog il
          WHERE il.partId = p.refId AND il.typeId IN (60, 64, 65, 67) AND il.dateCreated <= p.dateCreated
          ORDER BY il.id DESC LIMIT 1) AS logType
      FROM post p JOIN part pa ON pa.id = p.refId
      WHERE p.typeId = 50 AND p.statusId = 20
      ORDER BY p.id DESC LIMIT 1`);
    if (adj[0]) {
      const cost = r2(n(adj[0].cost));
      const up = n(adj[0].logType) === 64;
      snippets.push({
        type: "Adjust",
        title: `Inventory adjustment — ${s(adj[0].part)}, ${up ? "+" : "−"}${n(adj[0].qty)}`,
        when: s(adj[0].posted) || null,
        summary: `${s(adj[0].d).slice(0, 60)} — an adjustment or cycle count posts as a journal entry between inventory and the adjustment account.`,
        lines: up
          ? [
              { account: invAsset, debit: cost, credit: 0 },
              { account: adjAcct, debit: 0, credit: cost },
            ]
          : [
              { account: adjAcct, debit: cost, credit: 0 },
              { account: invAsset, debit: 0, credit: cost },
            ],
        note: up
          ? "This one added stock. When stock goes down, the sides swap: Dr Inventory Adj/Cycle Count / Cr Inventory Asset."
          : "This one removed stock. When stock goes up, the sides swap: Dr Inventory Asset / Cr Inventory Adj/Cycle Count.",
      });
    }

    // Customer / vendor changes — records, no money.
    const cust = await q(`
      SELECT c.name, p.datePosted AS posted FROM post p JOIN customer c ON c.id = p.refId
      WHERE p.typeId = 70 AND p.statusId = 20 ORDER BY p.id DESC LIMIT 3`);
    if (cust.length) {
      snippets.push({
        type: "Customer Change",
        title: "Customer updates",
        when: s(cust[0].posted) || null,
        summary: `New or edited customers are copied to QuickBooks — e.g. ${cust.map((c) => s(c.name)).join(", ")}.`,
        lines: [],
        note: "No money moves — this keeps the customer list in step.",
      });
    }
    const vend = await q(`
      SELECT v.name, p.datePosted AS posted FROM post p JOIN vendor v ON v.id = p.refId
      WHERE p.typeId = 60 AND p.statusId = 20 ORDER BY p.id DESC LIMIT 3`);
    if (vend.length) {
      snippets.push({
        type: "Vendor Change",
        title: "Vendor updates",
        when: s(vend[0].posted) || null,
        summary: `New or edited vendors are copied to QuickBooks — e.g. ${vend.map((v) => s(v.name)).join(", ")}.`,
        lines: [],
        note: "No money moves. Purchase orders, receipts and vendor bills are NOT sent — AP is entered in QuickBooks by hand.",
      });
    }

    /* ─── Things worth a person's attention ─── */
    const alerts: { title: string; detail: string }[] = [];
    const big = await q(`
      SELECT so.num, c.name AS customer, p.postedTotalCost AS cost, p.datePosted AS posted
      FROM post p JOIN so ON so.id = p.orderId LEFT JOIN customer c ON c.id = so.customerId
      WHERE p.typeId = 20 AND p.statusId = 20 AND p.postedTotalCost > 10000
      ORDER BY p.postedTotalCost DESC LIMIT 5`);
    for (const b of big) {
      alerts.push({
        title: `$${n(b.cost).toLocaleString("en-US", { maximumFractionDigits: 2 })} cost of goods posted for one shipment`,
        detail: `SO ${s(b.num)} (${s(b.customer)}), posted ${s(b.posted).slice(0, 10)}. Other shipments post a few dollars to a few hundred — this looks like a bad cost in Fishbowl, and it went to QuickBooks as Dr ${cogs} / Cr ${invAsset}.`,
      });
    }
    const fill = overrides.find((o) => o.field === "inventoryAccountId" && /fill/i.test(o.account?.name ?? ""));
    if (fill) {
      alerts.push({
        title: `${fill.items} parts post inventory to "${fill.account?.name}" (a liability)`,
        detail: `Mostly the fills (e.g. ${fill.examples.join(", ")}). Their inventory and COGS go to this accrual instead of ${invAsset} / ${cogs}.`,
      });
    }

    return {
      company: prop.get("AccountingCompanyName") ?? null,
      qboConnected: !!prop.get("QboCompanyId") && prop.get("QboCompanyId") !== "None",
      lastExports: exports.map((e) => ({ at: s(e.at), ok: !s(e.error), error: s(e.error) || null })),
      defaults,
      overrides: overrides.sort((a, b) => b.items - a.items),
      adjustReasons: reasons.map((r) => ({
        reason: s(r.reason),
        expense: label(acc.get(n(r.eid))),
        income: label(acc.get(n(r.iid))),
      })),
      paymentDeposit: n(pm[0]?.mapped) > 0 ? "Some methods have their own deposit account" : `${undeposited} (no payment method overrides it)`,
      chart: chart.map((c) => ({ type: s(c.type), total: n(c.total), active: n(c.active) })),
      activity: activity.map((a) => ({ type: s(a.type), month: s(a.m), count: n(a.c), amount: r2(n(a.amt)) })),
      snippets,
      alerts,
      loadedAt: new Date().toISOString(),
    } satisfies QbConnection;
  });

  cache = { at: Date.now(), data };
  return data;
}
