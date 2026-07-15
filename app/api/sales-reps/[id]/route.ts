import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

const COLS =
  "id, agency_code, agency, name, email, phone, city, state, zip, territory, samples";

type RepInput = {
  agency_code?: number | null;
  agency?: string;
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  zip?: string;
  territory?: string;
  samples?: string;
};

function normalize(input: RepInput) {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const rawCode = input.agency_code;
  const code = rawCode === null || rawCode === undefined ? null : Number(rawCode);
  return {
    agency_code: code !== null && Number.isFinite(code) ? code : null,
    agency: s(input.agency),
    name: s(input.name),
    email: s(input.email).toLowerCase(),
    phone: s(input.phone),
    city: s(input.city),
    state: s(input.state),
    zip: s(input.zip),
    territory: s(input.territory),
    samples: s(input.samples),
  };
}

/** PATCH /api/sales-reps/:id — update a rep. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: RepInput;
  try {
    body = (await request.json()) as RepInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const row = { ...normalize(body), updated_at: new Date().toISOString() };
  if (!row.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("sales_reps")
    .update(row)
    .eq("id", id)
    .select(COLS)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Rep not found." }, { status: 404 });
  return NextResponse.json({ rep: data });
}

/** DELETE /api/sales-reps/:id — remove a rep. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { error } = await supabaseServer.from("sales_reps").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
