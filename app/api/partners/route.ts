import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import {
  wholesalePortalAdmin,
  type PartnerStatus,
} from "@/lib/wholesalePortal";

const VALID_STATUSES: PartnerStatus[] = ["pending", "approved", "denied"];

function configError() {
  return NextResponse.json(
    {
      error:
        "Wholesale portal isn't connected — add WHOLESALE_SUPABASE_URL + WHOLESALE_SUPABASE_SERVICE_ROLE_KEY to .env.local.",
    },
    { status: 500 }
  );
}

/** List every wholesale partner account from the storefront project. */
export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = wholesalePortalAdmin();
  if (!admin) return configError();

  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("role", "wholesale");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ partners: data ?? [] });
}

/** Update a partner: flip wholesale_status and/or assign a sales rep. */
export async function PATCH(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    status?: string;
    sales_rep?: string | null;
  } | null;
  const id = body?.id;
  const status = body?.status as PartnerStatus | undefined;
  const hasRep = body != null && "sales_rep" in body;

  if (!id || (!status && !hasRep)) {
    return NextResponse.json(
      {
        error:
          "expected { id, status?: pending | approved | denied, sales_rep?: string | null } with at least one field",
      },
      { status: 400 }
    );
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "status must be pending | approved | denied" },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {};
  if (status) update.wholesale_status = status;
  if (hasRep) {
    const rep = typeof body!.sales_rep === "string" ? body!.sales_rep.trim() : null;
    update.sales_rep = rep || null;
  }

  const admin = wholesalePortalAdmin();
  if (!admin) return configError();

  const { data, error } = await admin
    .from("profiles")
    .update(update)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "partner not found" }, { status: 404 });
  }
  return NextResponse.json({ partner: data });
}
