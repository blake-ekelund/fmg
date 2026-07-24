import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { computeBridge, type ProductAgg } from "@/lib/salesBridge";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/sales-team/rep-analysis?rep=<rep group name>
 *
 * A current-YTD vs prior-YTD analysis for one rep group, meant to be sent to the
 * agency principal: the price/volume/mix/new/lost bridge, which products and
 * customers are up or down, and a short list of actions.
 *
 * Same window as the dashboard (Jan 1 → yesterday, both years). Revenue is
 * line-item totalprice excluding SUBTOTAL/SHIPPING — the same rule the sales
 * driver RPC uses — aggregated from the current snapshot views. Internal only.
 */

const ID_CHUNK = 150;
const PAGE = 1000;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Jan 1 → yesterday, this year and last, as YYYY-MM-DD strings. */
function ytdWindows() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const curStart = `${yesterday.getFullYear()}-01-01`;
  const curEnd = ymd(yesterday);
  const priorEnd = new Date(yesterday);
  priorEnd.setFullYear(yesterday.getFullYear() - 1);
  const priorStart = `${yesterday.getFullYear() - 1}-01-01`;
  const label = yesterday.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return { curStart, curEnd, priorStart, priorEnd: ymd(priorEnd), label, curYear: yesterday.getFullYear() };
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const isExcluded = (s: string | null) => {
  const u = (s ?? "").toUpperCase();
  return u === "SUBTOTAL" || u === "SHIPPING";
};

/** Resolve a rep-group name to its customer ids — mirrors useDashboardRepSales'
    fuzzy agency_code↔rep-name match, so the analysis and the alert agree. */
async function repCustomers(rep: string) {
  const [{ data: groups }, { data: custs }] = await Promise.all([
    supabaseServer.from("rep_groups").select("name"),
    supabaseServer.from("customer_summary").select("customerid, name, agency_code"),
  ]);
  const names = ((groups ?? []) as { name: string }[]).map((g) => g.name);
  const rows = (custs ?? []) as { customerid: string; name: string; agency_code: string | null }[];

  const nameByCustomer = new Map<string, string>();
  const ids: string[] = [];
  for (const c of rows) {
    if (!c.agency_code || !c.customerid) continue;
    const code = c.agency_code.trim();
    // Same match rule as the dashboard hook.
    const matchedRep = names.find(
      (n) =>
        n.toLowerCase() === code.toLowerCase() ||
        n.toLowerCase().includes(code.toLowerCase()) ||
        code.toLowerCase().includes(n.toLowerCase()),
    );
    if (matchedRep === rep) {
      ids.push(c.customerid);
      nameByCustomer.set(c.customerid, c.name);
    }
  }
  return { ids, nameByCustomer };
}

type OrderRow = { id: number; customerid: string | null; datecompleted: string | null };
type ItemRow = {
  soid: number;
  productnum: string | null;
  description: string | null;
  totalprice: number | null;
  qtyfulfilled: number | null;
  qtyordered: number | null;
};

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rep = (new URL(request.url).searchParams.get("rep") ?? "").trim();
  if (!rep) return NextResponse.json({ error: "Provide a rep group." }, { status: 400 });

  const w = ytdWindows();
  const { ids, nameByCustomer } = await repCustomers(rep);
  if (ids.length === 0) {
    return NextResponse.json({ error: `No customers found for "${rep}".` }, { status: 404 });
  }

  // 1. Orders for these customers across both windows → soid → {period, customerid}.
  const orderMeta = new Map<number, { period: "cur" | "prior"; customerid: string }>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const slice = ids.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseServer
        .from("sales_orders_current")
        .select("id, customerid, datecompleted")
        .in("customerid", slice)
        .gte("datecompleted", w.priorStart)
        .lte("datecompleted", w.curEnd)
        .range(from, from + PAGE - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const rows = (data ?? []) as OrderRow[];
      for (const o of rows) {
        if (!o.customerid || !o.datecompleted) continue;
        const d = o.datecompleted.slice(0, 10);
        const period =
          d >= w.curStart && d <= w.curEnd
            ? "cur"
            : d >= w.priorStart && d <= w.priorEnd
              ? "prior"
              : null;
        if (period) orderMeta.set(o.id, { period, customerid: o.customerid });
      }
      if (rows.length < PAGE) break;
    }
  }

  const soids = [...orderMeta.keys()];

  // 2. Line items for those orders → aggregate per product and per customer, per window.
  const prodCur = new Map<string, ProductAgg>();
  const prodPrior = new Map<string, ProductAgg>();
  const prodName = new Map<string, string>();
  const custCur = new Map<string, number>();
  const custPrior = new Map<string, number>();

  for (let i = 0; i < soids.length; i += ID_CHUNK) {
    const slice = soids.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseServer
        .from("so_items_current")
        .select("soid, productnum, description, totalprice, qtyfulfilled, qtyordered")
        .in("soid", slice)
        .range(from, from + PAGE - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const rows = (data ?? []) as ItemRow[];
      for (const it of rows) {
        if (isExcluded(it.productnum) || isExcluded(it.description)) continue;
        const meta = orderMeta.get(it.soid);
        const key = it.productnum;
        if (!meta || !key) continue;
        const rev = it.totalprice ?? 0;
        const units = it.qtyfulfilled ?? it.qtyordered ?? 0;
        if (it.description && !prodName.has(key)) prodName.set(key, it.description);

        const pMap = meta.period === "cur" ? prodCur : prodPrior;
        const prev = pMap.get(key) ?? { revenue: 0, units: 0 };
        prev.revenue += rev;
        prev.units += units;
        pMap.set(key, prev);

        const cMap = meta.period === "cur" ? custCur : custPrior;
        cMap.set(meta.customerid, (cMap.get(meta.customerid) ?? 0) + rev);
      }
      if (rows.length < PAGE) break;
    }
  }

  // 3. Bridge.
  const bridge = computeBridge(prodCur, prodPrior);

  // 4. Product analysis — change vs prior YTD.
  const productKeys = new Set([...prodCur.keys(), ...prodPrior.keys()]);
  const products = [...productKeys].map((k) => {
    const cur = prodCur.get(k)?.revenue ?? 0;
    const prior = prodPrior.get(k)?.revenue ?? 0;
    return { productnum: k, description: prodName.get(k) ?? k, cur, prior, delta: cur - prior };
  });
  const productSection = {
    growing: products.filter((p) => p.prior > 0 && p.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 10),
    declining: products.filter((p) => p.prior > 0 && p.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 10),
    new: products.filter((p) => p.prior === 0 && p.cur > 0).sort((a, b) => b.cur - a.cur).slice(0, 10),
    lost: products.filter((p) => p.cur === 0 && p.prior > 0).sort((a, b) => b.prior - a.prior).slice(0, 10),
  };

  // 5. Customer analysis.
  const custKeys = new Set([...custCur.keys(), ...custPrior.keys()]);
  const customers = [...custKeys].map((id) => {
    const cur = custCur.get(id) ?? 0;
    const prior = custPrior.get(id) ?? 0;
    return { customerid: id, name: nameByCustomer.get(id) ?? id, cur, prior, delta: cur - prior };
  });
  const customerSection = {
    growing: customers.filter((c) => c.prior > 0 && c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 10),
    declining: customers.filter((c) => c.prior > 0 && c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 10),
    new: customers.filter((c) => c.prior === 0 && c.cur > 0).sort((a, b) => b.cur - a.cur).slice(0, 10),
    lapsed: customers.filter((c) => c.cur === 0 && c.prior > 0).sort((a, b) => b.prior - a.prior).slice(0, 10),
  };

  // 6. Actions — rule-based, ranked by dollars so the biggest levers lead.
  const actions: string[] = [];
  const lapsedTotal = customerSection.lapsed.reduce((s, c) => s + c.prior, 0);
  if (customerSection.lapsed.length > 0) {
    actions.push(
      `Win back ${customerSection.lapsed.length} lapsed account${customerSection.lapsed.length > 1 ? "s" : ""} worth ${money(lapsedTotal)} last year — starting with ${customerSection.lapsed[0].name} (${money(customerSection.lapsed[0].prior)}).`,
    );
  }
  if (productSection.lost.length > 0) {
    actions.push(
      `Re-introduce ${productSection.lost.length} dropped product${productSection.lost.length > 1 ? "s" : ""} — ${productSection.lost[0].description} led at ${money(productSection.lost[0].prior)} last year.`,
    );
  }
  if (customerSection.declining.length > 0) {
    const c = customerSection.declining[0];
    actions.push(`Shore up declining accounts — ${c.name} is down ${money(Math.abs(c.delta))} vs last YTD.`);
  }
  const pricePart = bridge.parts.find((p) => p.key === "price");
  if (pricePart && pricePart.amount < -Math.max(bridge.prior * 0.02, 500)) {
    actions.push(`Price is dragging ${money(Math.abs(pricePart.amount))} — review discounting on continuing items.`);
  }
  if (productSection.growing.length > 0) {
    actions.push(`Lean into what's working — push ${productSection.growing[0].description} (up ${money(productSection.growing[0].delta)}) across more accounts.`);
  }

  const variance = bridge.delta;
  const variance_pct = bridge.prior > 0 ? (variance / bridge.prior) * 100 : bridge.cur > 0 ? 100 : 0;

  return NextResponse.json({
    rep,
    window: { label: w.label, curYear: w.curYear, priorYear: w.curYear - 1 },
    kpis: {
      cur: bridge.cur,
      prior: bridge.prior,
      variance,
      variance_pct,
      customers: ids.length,
      buyers_cur: custCur.size,
      buyers_prior: custPrior.size,
    },
    bridge,
    products: productSection,
    customers: customerSection,
    actions,
  });
}
