import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const STATUSES = new Set(["new", "contacted", "converted", "archived"]);

/**
 * PATCH /api/storefront-prebookings/:id — triage a prebook request.
 *
 * Only `status` is editable (new → contacted → converted → archived). The
 * buyer's requested quantities are never rewritten here. Note the table has no
 * `updated_at` column, so we don't stamp one.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { status?: string };

  if (!body.status || !STATUSES.has(body.status)) {
    return NextResponse.json({ error: "unknown status" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("holiday_prebook_requests")
    .update({ status: body.status })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ prebooking: data });
}
