import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { SCENTS, hcField, gsField, lbField, HC_DISPLAY_KEY, LIP_BUTTER_KEY, HAND_CREME_PER_CASE } from "@/lib/storefrontPrebooking";

export const runtime = "nodejs";

/**
 * GET /api/storefront-prebookings — holiday prebook requests from the
 * storefronts (`holiday_prebook_requests`). Newest first. If the table hasn't
 * been created yet, report notReady so the admin page shows an honest empty
 * state rather than an error.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("holiday_prebook_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (/schema cache|does not exist|relation/i.test(error.message)) {
      return NextResponse.json({ prebookings: [], notReady: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ prebookings: data ?? [], notReady: false });
}

const STATUSES = new Set(["new", "contacted", "converted", "archived"]);

const intGte0 = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * POST /api/storefront-prebookings — add a prebook request by hand (e.g. one a
 * rep took over the phone). Mirrors the Sassy storefront's /prebook insert:
 * per-scent hand-crème case packs (hc_<scent>) + gift sets (gs_<scent>), two
 * displays, and the computed roll-ups (hand_creme_cases_total,
 * hand_creme_units_total, gift_sets_qty). Buyer identity is required.
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const business_name = String(body.business_name ?? "").trim();
  const contact_name = String(body.contact_name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!business_name || !contact_name || !email) {
    return NextResponse.json(
      { error: "Business name, contact name, and email are required." },
      { status: 400 },
    );
  }

  const status = STATUSES.has(String(body.status)) ? String(body.status) : "new";
  const store = body.store === "ni" ? "ni" : "sassy";

  const row: Record<string, unknown> = {
    store,
    business_name,
    contact_name,
    email,
    phone: body.phone ? String(body.phone).trim() : null,
    notes: body.notes ? String(body.notes).trim() : null,
    status,
    [HC_DISPLAY_KEY]: intGte0(body[HC_DISPLAY_KEY]),
    [LIP_BUTTER_KEY]: intGte0(body[LIP_BUTTER_KEY]),
  };

  let casesTotal = 0;
  let giftSetsTotal = 0;
  for (const s of SCENTS) {
    const cases = intGte0(body[hcField(s.key)]);
    const gifts = intGte0(body[gsField(s.key)]);
    row[hcField(s.key)] = cases;
    row[gsField(s.key)] = gifts;
    // Per-scent lip butter case packs — same shape the storefront form writes.
    row[lbField(s.key)] = intGte0(body[lbField(s.key)]);
    casesTotal += cases;
    giftSetsTotal += gifts;
  }
  row.hand_creme_cases_total = casesTotal;
  row.hand_creme_units_total = casesTotal * HAND_CREME_PER_CASE;
  row.gift_sets_qty = giftSetsTotal;

  const { data, error } = await supabaseServer
    .from("holiday_prebook_requests")
    .insert(row)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prebooking: data });
}
