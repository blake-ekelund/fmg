import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * GET /api/product-reviews — the moderation queue for /storefronts/reviews.
 *
 * Reviews are written by the storefronts' /review pages (service role, see the
 * product_reviews migration); this route only reads them for staff. Returns
 * `notReady` when the table hasn't been created yet.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("product_reviews")
    .select(
      "id,created_at,store,part,product_name,rating,title,body,display_name,email,verified,source,consent_feature,status,reviewed_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (error.code === "42P01" || /does not exist/i.test(error.message)) {
      return NextResponse.json({ reviews: [], notReady: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reviews: data ?? [] });
}
