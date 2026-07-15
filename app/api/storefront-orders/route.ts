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
          "Wholesale portal isn't connected — add WHOLESALE_SUPABASE_URL + WHOLESALE_SUPABASE_SERVICE_ROLE_KEY to .env.local.",
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
  return NextResponse.json({ orders: data ?? [], notReady: false });
}
