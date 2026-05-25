import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// Cap input lengths so a runaway form post can't dump megabytes into the DB.
const MAX_FIELD = 5000;
const MAX_NAME = 200;
const MAX_EMAIL = 320;

type Body = {
  customer_type?: "wholesale" | "d2c";
  customer_ref?: string;
  customer_name?: string;
  customer_email?: string;
  rating?: number | null;
  what_went_well?: string;
  what_didnt_go_well?: string;
  what_to_improve?: string;
};

function clip(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.slice(0, max);
}

/**
 * POST /api/quarterly-check-in
 * Public submission endpoint for the customer feedback form.
 * No auth required — INSERT goes through the service-role client. SELECT on
 * the table is admin-only via RLS so submissions can't be enumerated.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const customer_type =
    body.customer_type === "wholesale" || body.customer_type === "d2c"
      ? body.customer_type
      : null;
  const rating =
    typeof body.rating === "number" && body.rating >= 1 && body.rating <= 5
      ? Math.round(body.rating)
      : null;

  const went = clip(body.what_went_well, MAX_FIELD);
  const didnt = clip(body.what_didnt_go_well, MAX_FIELD);
  const improve = clip(body.what_to_improve, MAX_FIELD);

  // Require at least one piece of content so empty submissions don't pollute.
  if (rating == null && !went && !didnt && !improve) {
    return NextResponse.json(
      { error: "Please share at least one piece of feedback." },
      { status: 400 },
    );
  }

  const xff = request.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || null;

  const { error } = await supabaseServer
    .from("quarterly_check_in_responses")
    .insert({
      customer_type,
      customer_ref: clip(body.customer_ref, MAX_NAME),
      customer_name: clip(body.customer_name, MAX_NAME),
      customer_email: clip(body.customer_email, MAX_EMAIL),
      rating,
      what_went_well: went,
      what_didnt_go_well: didnt,
      what_to_improve: improve,
      ip,
      user_agent: request.headers.get("user-agent"),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
