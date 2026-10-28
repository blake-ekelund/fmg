import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * /api/inventory/purchasing-settings — the ordering rules edited on the
 * Purchasing page (see migration 20261028000000).
 *
 * GET   → { ready, parts: PartSetting[], vendors: VendorSetting[] }
 * PATCH { kind: "part", part, ...fields } | { kind: "vendor", vendor, ...fields }
 *       A field sent as null (or "") clears it back to Fishbowl's value.
 *
 * A missing table (migration not pushed yet) answers GET with ready:false and
 * PATCH with 503, so the page keeps working on Fishbowl's numbers alone.
 */

const MISSING = /does not exist|schema cache|relation/i;
const PART_FIELDS = ["min_qty", "multiple", "unit_price", "lead_days", "note"] as const;
const VENDOR_FIELDS = ["min_run_qty", "item_min_qty", "lead_days", "note"] as const;

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [parts, vendors] = await Promise.all([
    supabaseServer.from("purchasing_part_settings").select("*"),
    supabaseServer.from("purchasing_vendor_settings").select("*"),
  ]);
  const err = parts.error ?? vendors.error;
  if (err) {
    if (MISSING.test(err.message)) return NextResponse.json({ ready: false, parts: [], vendors: [] });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  return NextResponse.json({ ready: true, parts: parts.data ?? [], vendors: vendors.data ?? [] });
}

function clean(field: string, v: unknown): number | string | null {
  if (v === null || v === undefined || v === "") return null;
  if (field === "note") return String(v).trim() || null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} must be a positive number`);
  return field === "lead_days" ? Math.round(n) : n;
}

export async function PATCH(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const isPart = body.kind === "part";
  const key = String((isPart ? body.part : body.vendor) ?? "").trim();
  if (!key || (body.kind !== "part" && body.kind !== "vendor")) {
    return NextResponse.json({ error: "Send kind 'part' with part, or kind 'vendor' with vendor." }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    [isPart ? "part" : "vendor"]: key,
    updated_at: new Date().toISOString(),
    updated_by: user.email ?? null,
  };
  try {
    for (const f of isPart ? PART_FIELDS : VENDOR_FIELDS) {
      if (f in body) row[f] = clean(f, body[f]);
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  const table = isPart ? "purchasing_part_settings" : "purchasing_vendor_settings";
  const { data, error } = await supabaseServer
    .from(table)
    .upsert(row, { onConflict: isPart ? "part" : "vendor" })
    .select()
    .single();
  if (error) {
    if (MISSING.test(error.message)) {
      return NextResponse.json(
        { error: "Saving needs migration 20261028000000 — run `supabase db push`." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, setting: data });
}
