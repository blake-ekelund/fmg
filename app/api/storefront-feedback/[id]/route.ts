import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const STATUSES = new Set(["new", "reviewed", "actioned", "archived"]);

/**
 * PATCH /api/storefront-feedback/:id — triage an entry from the portal.
 *
 * Only the two fields staff actually change: `status` (new → reviewed →
 * actioned → archived) and `internal_note`. The shopper's own words are never
 * editable here — feedback we quietly rewrote wouldn't be feedback.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    internal_note?: string | null;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (!STATUSES.has(body.status)) {
      return NextResponse.json({ error: "unknown status" }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body.internal_note !== undefined) {
    const note = String(body.internal_note ?? "").trim();
    patch.internal_note = note ? note.slice(0, 2000) : null;
  }
  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("storefront_feedback")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ feedback: data });
}
