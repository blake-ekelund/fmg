import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";
import { stageOf, type OrderStage } from "@/lib/orderStage";

export const runtime = "nodejs";

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

/**
 * Fishbowl carries no tracking column in the data we sync (see
 * lib/fishbowlQueries.ts — the SO query selects no shipment fields), but teams
 * commonly hand-enter a tracking number into a custom field. If one is there
 * under a plausibly-named key, surface it; otherwise the UI falls back to the
 * order status. This never invents a value.
 */
function trackingFromCustomFields(
  raw: unknown,
): { label: string; value: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const entries = Array.isArray(raw)
    ? raw.map((e) => {
        const o = (e ?? {}) as Record<string, unknown>;
        return [String(o.name ?? o.key ?? ""), o.value] as const;
      })
    : Object.entries(raw as Record<string, unknown>);

  for (const [key, value] of entries) {
    if (!key || value == null || value === "") continue;
    const k = key.toLowerCase().replace(/[^a-z]/g, "");
    if (k.includes("tracking") || k.includes("waybill") || k.includes("pronumber")) {
      return { label: key, value: String(value) };
    }
  }
  return null;
}

/** The agency's customer ids, plus a name lookup for display. */
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

    return NextResponse.json({
      order: {
        ...order,
        customer_name: customers.nameById.get(order.customerid) ?? null,
        stage: stageOf(order.status),
        effective_date: effectiveDate(order),
        tracking: trackingFromCustomFields(order.customfields),
        customfields: undefined, // raw blob isn't for the client
      },
      items,
    });
  }

  /* ── List / search ── */
  const collected: OrderRow[] = [];
  const limit = q ? SEARCH_LIMIT : RECENT_LIMIT;
  const stageFilter = params.get("stage");

  for (let i = 0; i < customers.ids.length; i += ID_CHUNK) {
    const slice = customers.ids.slice(i, i + ID_CHUNK);
    let query = supabaseServer
      .from("sales_orders_raw")
      .select(ORDER_COLS)
      // The agency boundary. Orders carry no agency of their own, so this is
      // the only thing keeping one rep out of another's book.
      .in("customerid", slice)
      /* Ordered by id, not by any date: Fishbowl ids are sequential, and every
         row has one. Dates can't be used for the fetch window — datecompleted
         is NULL on open orders, and datecreated/dateissued stay NULL until the
         migration is pushed and a sync has run. Sorting by date happens below,
         once the rows are in hand. */
      .order("id", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (q) {
      // Order number, the customer's PO, or who it shipped to.
      const safe = q.replace(/[%,()]/g, "");
      if (safe) {
        query = query.or(
          `num.ilike.%${safe}%,customerpo.ilike.%${safe}%,shiptoname.ilike.%${safe}%`,
        );
      }
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    collected.push(...((data ?? []) as OrderRow[]));
  }

  const staged = stageFilter
    ? collected.filter((o) => stageOf(o.status) === stageFilter)
    : collected;

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
  const orders = staged.slice(0, limit).map((o) => ({
    ...o,
    customer_name: o.customerid ? (customers.nameById.get(o.customerid) ?? null) : null,
    stage: stageOf(o.status),
    effective_date: effectiveDate(o),
    tracking: trackingFromCustomFields(o.customfields),
    customfields: undefined,
  }));

  /* Counts per stage across everything fetched, so the UI can label its
     filters without a second round trip. */
  const counts = collected.reduce(
    (acc, o) => {
      acc[stageOf(o.status)] += 1;
      return acc;
    },
    { estimate: 0, open: 0, completed: 0, cancelled: 0 } as Record<OrderStage, number>,
  );

  return NextResponse.json({ orders, truncated, counts });
}
