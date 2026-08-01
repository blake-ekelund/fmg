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

  const { data, error } = await admin
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) {
      return NextResponse.json({ orders: [], notReady: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Unpaid D2C storefront rows are checkout-starts, not orders — the row
  // exists so the Stripe webhook can find it and so abandoned-cart recovery
  // has material, but Purchases only shows completed business: paid D2C,
  // wholesale (NET-30 terms — legitimately unpaid), and marketplace imports.
  const orders = (data ?? []).filter(
    (o: { channel?: string; source?: string; payment_status?: string }) =>
      !(
        o.channel === "d2c" &&
        (o.source ?? "storefront") === "storefront" &&
        o.payment_status !== "paid"
      ),
  );
  return NextResponse.json({ orders, notReady: false });
}
