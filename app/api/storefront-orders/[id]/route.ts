import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";

/**
 * A single storefront order (for the Purchases detail / invoice view), plus
 * the Approve action. Reads/writes the wholesale project's `orders` table
 * via the service role — the same source the Purchases list uses.
 */

const PORTAL_OFFLINE =
  "Wholesale portal isn't connected — add WHOLESALE_SUPABASE_URL + WHOLESALE_SUPABASE_SERVICE_ROLE_KEY to .env.local.";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = wholesalePortalAdmin();
  if (!admin) return NextResponse.json({ error: PORTAL_OFFLINE }, { status: 500 });

  const { id } = await params;
  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  return NextResponse.json({ order: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = wholesalePortalAdmin();
  if (!admin) return NextResponse.json({ error: PORTAL_OFFLINE }, { status: 500 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "approve" | "unapprove";
  };

  // Approval is its own stamp (approved_at / approved_by); it deliberately
  // doesn't touch `status`, whose check constraint has no 'approved' value.
  let patch: Record<string, unknown>;
  if (body.action === "approve") {
    patch = {
      approved_at: new Date().toISOString(),
      approved_by: user.email ?? user.id,
    };
  } else if (body.action === "unapprove") {
    patch = { approved_at: null, approved_by: null };
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("orders")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}
