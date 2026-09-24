import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const STATUSES = new Set(["pending", "approved", "rejected"]);

/**
 * PATCH /api/product-reviews/:id — approve / reject / return to pending.
 *
 * Only the moderation status changes here. The customer's words are never
 * editable — a review we quietly rewrote wouldn't be a review.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { status?: string };
  if (!body.status || !STATUSES.has(body.status)) {
    return NextResponse.json({ error: "unknown status" }, { status: 400 });
  }

  const pending = body.status === "pending";
  const { data, error } = await supabaseServer
    .from("product_reviews")
    .update({
      status: body.status,
      reviewed_at: pending ? null : new Date().toISOString(),
      reviewed_by: pending ? null : user.id,
    })
    .eq("id", id)
    .select("id,status,reviewed_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ review: data });
}
