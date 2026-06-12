import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";

const BRANDS = ["Sassy", "NI", "both"] as const;
const KINDS = ["percent", "fixed"] as const;

/** Missing-table errors surface as schema-cache misses through PostgREST. */
function isMissingTable(message: string | undefined): boolean {
  return !!message && /schema cache|does not exist/i.test(message);
}

function tableMissingResponse() {
  return NextResponse.json(
    {
      error:
        "The storefront_discounts table doesn't exist yet — apply the pending migration (npx supabase db push) to activate discounts.",
      needsMigration: true,
    },
    { status: 503 }
  );
}

export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("storefront_discounts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error.message)) return tableMissingResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ discounts: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const code = String(body?.code ?? "")
    .trim()
    .toUpperCase();
  const brand = String(body?.brand ?? "both");
  const kind = String(body?.kind ?? "percent");
  const value = Number(body?.value);

  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }
  if (!BRANDS.includes(brand as (typeof BRANDS)[number])) {
    return NextResponse.json({ error: "invalid brand" }, { status: 400 });
  }
  if (!KINDS.includes(kind as (typeof KINDS)[number])) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json(
      { error: "value must be a positive number" },
      { status: 400 }
    );
  }
  if (kind === "percent" && value > 100) {
    return NextResponse.json(
      { error: "percent discounts can't exceed 100" },
      { status: 400 }
    );
  }

  const minSubtotal = Number(body?.min_subtotal);
  const insert = {
    code,
    brand,
    kind,
    value,
    min_subtotal:
      Number.isFinite(minSubtotal) && minSubtotal > 0 ? minSubtotal : null,
    starts_at: body?.starts_at ? String(body.starts_at) : null,
    ends_at: body?.ends_at ? String(body.ends_at) : null,
    note: body?.note ? String(body.note) : null,
    active: body?.active !== false,
  };

  const { data, error } = await supabaseServer
    .from("storefront_discounts")
    .insert(insert)
    .select()
    .single();
  if (error) {
    if (isMissingTable(error.message)) return tableMissingResponse();
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `code "${code}" already exists` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ discount: data });
}

export async function PATCH(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const id = body?.id ? String(body.id) : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.active === "boolean") patch.active = body.active;
  if (body?.note !== undefined) patch.note = body.note ? String(body.note) : null;
  if (body?.ends_at !== undefined)
    patch.ends_at = body.ends_at ? String(body.ends_at) : null;

  const { data, error } = await supabaseServer
    .from("storefront_discounts")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) return tableMissingResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ discount: data });
}

export async function DELETE(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseServer
    .from("storefront_discounts")
    .delete()
    .eq("id", id);
  if (error) {
    if (isMissingTable(error.message)) return tableMissingResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
