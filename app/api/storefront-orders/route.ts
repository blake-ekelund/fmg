import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";

/**
 * Purchases from the storefronts. The wholesale project will hold the
 * `orders` table once checkout ships — until then this reports
 * notReady so the admin page can show an honest empty state.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = wholesalePortalAdmin();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Supabase isn't connected — set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.",
      },
      { status: 500 }
    );
  }

  const view = new URL(request.url).searchParams.get("view");

  // Archived rows are off the page. `archived_at` is a fresh column (migration
  // 20260909000000) — until it's pushed the filter would 400 every request, so
  // fall back to the unfiltered list and let the page show everything rather
  // than nothing.
  const listOrders = async (filterArchived: boolean) => {
    let q = admin
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (filterArchived) {
      q = view === "archived" ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    }
    return q;
  };

  let { data, error } = await listOrders(true);
  if (error && /archived_at/i.test(error.message)) {
    // Migration not pushed yet: nothing is archived, so "archived" is empty and
    // every other view is the whole list.
    if (view === "archived") return NextResponse.json({ orders: [], notReady: false });
    ({ data, error } = await listOrders(false));
  }

  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) {
      return NextResponse.json({ orders: [], notReady: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Unpaid D2C storefront rows are checkout-starts, not orders — the row
  // exists so the Stripe webhook can find it and so abandoned-cart recovery
  // has material. The default view shows completed business only: paid D2C,
  // wholesale (NET-30 terms — legitimately unpaid), and marketplace imports.
  // ?view=abandoned inverts the filter so staff can inspect the carts.
  const isCheckoutStart = (o: {
    channel?: string;
    source?: string;
    payment_status?: string;
  }) =>
    o.channel === "d2c" &&
    (o.source ?? "storefront") === "storefront" &&
    o.payment_status !== "paid";

  // The archived view is a straight record of what was taken off the page, so
  // it is not split into orders vs checkout-starts the way the live views are.
  const orders =
    view === "archived"
      ? (data ?? [])
      : (data ?? []).filter((o) =>
          view === "abandoned" ? isCheckoutStart(o) : !isCheckoutStart(o),
        );
  return NextResponse.json({ orders, notReady: false });
}
