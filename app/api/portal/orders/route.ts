import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";
import { stageOf } from "@/lib/orderStage";
import { resolveCarrier, carrierLabel, trackingUrl } from "@/lib/tracking";
import type { PortalTracking } from "@/components/portal/api";

export const runtime = "nodejs";

/**
 * The portal groups orders more coarsely than the rest of the app: a rep thinks
 * of anything not finished or dead as "Open", so estimates, issued and
 * in-progress orders are shown together under that one label. Fishbowl's
 * estimate stage is folded into "open" here. This is display grouping only —
 * revenue logic elsewhere still keys off datecompleted and never counts an
 * estimate as a sale.
 */
export type PortalStage = "open" | "completed" | "cancelled";

function portalStage(status: string | null | undefined): PortalStage {
  const s = stageOf(status);
  return s === "estimate" ? "open" : s;
}

/**
 * GET /api/portal/orders            → recent orders for the rep's agency
 * GET /api/portal/orders?q=<text>   → search all of the agency's order history
 * GET /api/portal/orders?num=<num>  → one order, with its line items
 *
 * Built so a rep can answer "where's my order?" without calling the office.
 *
 * Scoping: orders carry a customerid but no agency, so the agency's customer
 * set is resolved first and every order query is constrained to those ids.
 * A rep therefore cannot read another agency's orders even by guessing an
 * order number — the detail branch re-checks membership before returning.
 */

/** Recent-orders page size when no search term is supplied. */
const RECENT_LIMIT = 200;
/** Cap on search results, so a one-character query can't pull the whole book. */
const SEARCH_LIMIT = 200;
/** Chunk for .in() filters — keeps the request URL under limits. */
const ID_CHUNK = 200;

const ORDER_COLS =
  "id, num, customerid, customerpo, datecreated, dateissued, datecompleted, status, totalprice, shiptoname, shiptocity, shiptostate, shiptozip, shiptoaddress, customfields";

type OrderRow = {
  id: number | null;
  num: string | null;
  customerid: string | null;
  customerpo: string | null;
  datecreated: string | null;
  dateissued: string | null;
  datecompleted: string | null;
  status: string | null;
  totalprice: number | null;
  shiptoname: string | null;
  shiptocity: string | null;
  shiptostate: string | null;
  shiptozip: string | null;
  shiptoaddress: string | null;
  customfields: unknown;
};

/**
 * The date to show and sort by.
 *
 * An open order has no dateCompleted, so sorting the list on that alone buried
 * every estimate and in-progress order below the completed ones — which is why
 * they looked missing even though the sync had been pulling them all along.
 */
function effectiveDate(o: OrderRow): string | null {
  return o.datecompleted ?? o.dateissued ?? o.datecreated ?? null;
}

type ShipmentRow = {
  soid: number;
  tracking_num: string;
  carrier: string | null;
  dateshipped: string | null;
  shipmentnum: string | null;
};

/** Turn a synced shipment row into the client-facing tracking entry, resolving
 *  the real carrier (Fishbowl's is usually "RATESHOP") and its deep link. */
function toTracking(r: ShipmentRow): PortalTracking {
  const id = resolveCarrier(r.carrier, r.tracking_num);
  return {
    trackingNum: r.tracking_num,
    carrier: id ? carrierLabel(id) : null,
    url: trackingUrl(id, r.tracking_num),
    shipped: !!r.dateshipped,
    dateShipped: r.dateshipped,
    shipmentNum: r.shipmentnum,
  };
}

/**
 * Tracking for a set of orders, keyed by soId. Shipments carry a soid but no
 * agency, so callers must pass ONLY ids they've already confirmed belong to the
 * agency — this function trusts its input for scoping, exactly like the order
 * queries above. Shipped shipments sort first, then most-recent.
 */
async function trackingBySo(soIds: number[]): Promise<Map<number, PortalTracking[]>> {
  const out = new Map<number, PortalTracking[]>();
  const ids = soIds.filter((n) => Number.isFinite(n));
  if (ids.length === 0) return out;

  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await supabaseServer
      .from("so_shipments_raw")
      .select("soid, tracking_num, carrier, dateshipped, shipmentnum")
      .in("soid", ids.slice(i, i + ID_CHUNK));
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as ShipmentRow[]) {
      const list = out.get(row.soid) ?? [];
      list.push(toTracking(row));
      out.set(row.soid, list);
    }
  }

  for (const list of out.values()) {
    list.sort((a, b) => {
      if (a.shipped !== b.shipped) return a.shipped ? -1 : 1;
      return (b.dateShipped ?? "").localeCompare(a.dateShipped ?? "");
    });
  }
  return out;
}

/** The agency's customer ids, plus a name lookup for display and search. */
async function agencyCustomers(agency: string) {
  const { data, error } = await supabaseServer
    .from("customer_summary")
    .select("customerid, name")
    .eq("agency_code", agency);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { customerid: string; name: string }[];
  return {
    ids: rows.map((r) => r.customerid).filter(Boolean),
    nameById: new Map(rows.map((r) => [r.customerid, r.name])),
  };
}

export async function GET(request: Request) {
  const rep = await resolvePortalAgency(request);
  if (!rep) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const agency = String(rep.agencyCode);
  const params = new URL(request.url).searchParams;
  const num = params.get("num");
  const q = (params.get("q") ?? "").trim();

  let customers: Awaited<ReturnType<typeof agencyCustomers>>;
  try {
    customers = await agencyCustomers(agency);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lookup failed" },
      { status: 500 },
    );
  }

  if (customers.ids.length === 0) {
    return NextResponse.json({ orders: [], truncated: false });
  }

  /* ── Detail ── */
  if (num) {
    const { data, error } = await supabaseServer
      .from("sales_orders_raw")
      .select(ORDER_COLS)
      .eq("num", num)
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const order = data as OrderRow | null;
    // Re-check agency membership — the order number alone proves nothing.
    if (!order || !order.customerid || !customers.nameById.has(order.customerid)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const { data: itemData } = await supabaseServer
      .from("so_items_raw")
      .select("productnum, description, qtyordered, qtyfulfilled, totalprice, solineitem")
      .eq("soid", order.id)
      .order("solineitem", { ascending: true });

    /* SUBTOTAL / SHIPPING rows are accounting artifacts in Fishbowl's line
       items, not things the customer ordered — same exclusion the dashboard
       revenue rules use. */
    const items = ((itemData ?? []) as {
      productnum: string | null;
      description: string | null;
      qtyordered: number | null;
      qtyfulfilled: number | null;
      totalprice: number | null;
      solineitem: number | null;
    }[]).filter((i) => {
      const tag = `${i.productnum ?? ""} ${i.description ?? ""}`.toUpperCase();
      return !tag.includes("SUBTOTAL") && !tag.includes("SHIPPING");
    });

    const tracking =
      order.id != null ? ((await trackingBySo([order.id])).get(order.id) ?? []) : [];

    return NextResponse.json({
      order: {
        ...order,
        customer_name: customers.nameById.get(order.customerid) ?? null,
        stage: portalStage(order.status),
        effective_date: effectiveDate(order),
        tracking,
        customfields: undefined, // raw blob isn't for the client
      },
      items,
    });
  }

  /* ── List / search ── */
  const collected: OrderRow[] = [];
  const seen = new Set<number>(); // dedupe by order id across the two search passes
  const limit = q ? SEARCH_LIMIT : RECENT_LIMIT;
  const stageFilter = params.get("stage");

  function absorb(rows: OrderRow[]) {
    for (const r of rows) {
      if (r.id != null) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
      }
      collected.push(r);
    }
  }

  /**
   * Fetch orders for a set of customers, optionally narrowing with a raw
   * PostgREST `.or()` expression. Ordered by id (Fishbowl ids are sequential and
   * every row has one; dates are NULL on open orders), then re-sorted by date.
   */
  async function fetchOrders(customerIds: string[], orExpr?: string) {
    for (let i = 0; i < customerIds.length; i += ID_CHUNK) {
      let query = supabaseServer
        .from("sales_orders_raw")
        .select(ORDER_COLS)
        // The agency boundary. Orders carry no agency of their own, so this is
        // the only thing keeping one rep out of another's book.
        .in("customerid", customerIds.slice(i, i + ID_CHUNK))
        .order("id", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (orExpr) query = query.or(orExpr);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      absorb((data ?? []) as OrderRow[]);
    }
  }

  /* The location a rep searches by ("Minnetonka") is the order's SHIP-TO city,
     not the account's bill-to city — a chain like Lunds & Byerlys is one
     customer that ships to a dozen towns. So matching happens at the order
     level, over the customer name plus the order's own fields. */
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const ORDER_MATCH_COLS = ["num", "customerpo", "shiptoname", "shiptocity", "shiptostate"];

  function orderHaystack(o: OrderRow): string {
    const name = customers.nameById.get(o.customerid ?? "") ?? "";
    return `${name} ${o.num ?? ""} ${o.customerpo ?? ""} ${o.shiptoname ?? ""} ${o.shiptocity ?? ""} ${o.shiptostate ?? ""}`.toLowerCase();
  }

  try {
    if (tokens.length > 0) {
      /* 1) By customer name. The account name identifies a chain but never
         appears on the order row, so name-matched customers have their whole
         order history pulled — that's what brings the Minnetonka Lunds order
         into range for a "Lunds Minnetonka" search. */
      const nameMatchedIds = customers.ids.filter((id) => {
        const name = (customers.nameById.get(id) ?? "").toLowerCase();
        return tokens.some((t) => name.includes(t));
      });
      if (nameMatchedIds.length > 0) await fetchOrders(nameMatchedIds);

      /* 2) By the order's own fields — ship-to city/state/name, order number,
         PO. Carries the per-store location and direct order lookups. Any token
         hitting any column is a candidate; the token-AND pass below tightens it. */
      const safeTokens = tokens.map((t) => t.replace(/[%,()]/g, "")).filter(Boolean);
      if (safeTokens.length > 0) {
        const orExpr = safeTokens
          .flatMap((t) => ORDER_MATCH_COLS.map((c) => `${c}.ilike.%${t}%`))
          .join(",");
        await fetchOrders(customers.ids, orExpr);
      }
    } else {
      await fetchOrders(customers.ids);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "query failed" },
      { status: 500 },
    );
  }

  /* Token-AND: keep only orders where EVERY search word appears somewhere in the
     customer name + order fields. This turns the broad "any token" candidate set
     into "Lunds AND Minnetonka" — the account whose name has Lunds and whose
     ship-to city is Minnetonka. */
  const searched =
    tokens.length > 0
      ? collected.filter((o) => {
          const hay = orderHaystack(o);
          return tokens.every((t) => hay.includes(t));
        })
      : collected;

  const staged = stageFilter
    ? searched.filter((o) => portalStage(o.status) === stageFilter)
    : searched;

  /* Each chunk was limited independently, so re-sort and trim to get a true
     top-N across the whole agency rather than the first chunk's view. Falls
     back to id when dates are absent, which is the state before the open-date
     migration has been pushed. */
  staged.sort((a, b) => {
    const da = effectiveDate(a);
    const db = effectiveDate(b);
    if (da && db && da !== db) return da < db ? 1 : -1;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return (b.id ?? 0) - (a.id ?? 0);
  });

  const truncated = staged.length > limit;
  const sliced = staged.slice(0, limit);
  // One shipments query for the whole page, then attach by soId.
  const trackMap = await trackingBySo(
    sliced.map((o) => o.id).filter((n): n is number => n != null),
  );
  const orders = sliced.map((o) => ({
    ...o,
    customer_name: o.customerid ? (customers.nameById.get(o.customerid) ?? null) : null,
    stage: portalStage(o.status),
    effective_date: effectiveDate(o),
    tracking: (o.id != null ? trackMap.get(o.id) : undefined) ?? [],
    customfields: undefined,
  }));

  /* Counts per stage across the matched set, so the UI can label its filters
     without a second round trip. */
  const counts = searched.reduce(
    (acc, o) => {
      acc[portalStage(o.status)] += 1;
      return acc;
    },
    { open: 0, completed: 0, cancelled: 0 } as Record<PortalStage, number>,
  );

  return NextResponse.json({ orders, truncated, counts });
}
