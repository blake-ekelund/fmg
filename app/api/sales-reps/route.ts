import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAuthUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/** Columns we read/return to the client. */
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

/** Normalize an incoming rep payload to the exact table shape (never NULL text). */
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

/**
 * GET /api/sales-reps — list every rep. If the table hasn't been created yet
 * (migration not pushed), report notReady so the page falls back to its
 * built-in roster instead of erroring.
 */
export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("sales_reps")
    .select(COLS)
    .order("agency", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (/schema cache|does not exist|relation .* does not exist/i.test(error.message)) {
      return NextResponse.json({ reps: [], notReady: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reps: data ?? [], notReady: false });
}

/**
 * POST /api/sales-reps — create a rep. Name is required.
 */
export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: RepInput;
  try {
    body = (await request.json()) as RepInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const row = normalize(body);
  if (!row.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("sales_reps")
    .insert(row)
    .select(COLS)
    .single();

  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) {
      return NextResponse.json(
        { error: "The sales_reps table doesn't exist yet — run the migration (supabase db push)." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rep: data });
}
