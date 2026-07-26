import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import {
  wholesalePortalAdmin,
  type PartnerStatus,
} from "@/lib/wholesalePortal";

const VALID_STATUSES: PartnerStatus[] = ["pending", "approved", "denied"];

function configError() {
  return NextResponse.json(
    {
      error:
        "Supabase isn't connected — set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    },
    { status: 500 }
  );
}

/** List every storefront account — D2C (retail) and wholesale alike. */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = wholesalePortalAdmin();
  if (!admin) return configError();

  const { data, error } = await admin
    .from("storefront_profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ partners: data ?? [] });
}

/**
 * Update an account: flip wholesale_status, assign a rep / rep group, and/or
 * set the Fishbowl account number. Any subset of fields may be provided.
 */
export async function PATCH(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    status?: string;
    sales_rep?: string | null;
    rep_group?: string | null;
    account_number?: string | null;
  } | null;
  const id = body?.id;
  const status = body?.status as PartnerStatus | undefined;
  const hasRep = body != null && "sales_rep" in body;
  const hasRepGroup = body != null && "rep_group" in body;
  const hasAccountNumber = body != null && "account_number" in body;

  if (!id || (!status && !hasRep && !hasRepGroup && !hasAccountNumber)) {
    return NextResponse.json(
      {
        error:
          "expected { id, status?: pending | approved | denied, sales_rep?, rep_group?, account_number? } with at least one field",
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

  // Free-text field → trimmed string, or null when blank.
  const text = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const update: Record<string, unknown> = {};
  if (status) update.wholesale_status = status;
  if (hasRep) update.sales_rep = text(body!.sales_rep);
  if (hasRepGroup) update.rep_group = text(body!.rep_group);
  if (hasAccountNumber) update.account_number = text(body!.account_number);

  const admin = wholesalePortalAdmin();
  if (!admin) return configError();

  const { data, error } = await admin
    .from("storefront_profiles")
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
