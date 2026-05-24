import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAuthUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

type Config = {
  trigger_days?: number;
  lookback_days?: number;
  discount_code?: string;
  subject?: string;
  body?: string;
};

type PatchBody = {
  enabled?: boolean;
  sender_user_id?: string | null;
  config?: Config;
};

/**
 * GET /api/automations/d2c-reengagement
 * Returns the current settings row + a summary of recent sends.
 */
export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [settings, recent, totals] = await Promise.all([
    supabaseServer
      .from("automation_settings")
      .select("name, enabled, sender_user_id, config, updated_at")
      .eq("name", "d2c_reengagement")
      .maybeSingle(),
    supabaseServer
      .from("d2c_reengagement_sends")
      .select("id, person_key, customer_name, customer_email, status, error_text, sent_at, discount_code")
      .order("sent_at", { ascending: false })
      .limit(50),
    supabaseServer
      .from("d2c_reengagement_sends")
      .select("id", { count: "exact", head: true }),
  ]);

  if (settings.error) {
    return NextResponse.json({ error: settings.error.message }, { status: 500 });
  }

  return NextResponse.json({
    settings: settings.data,
    recent: recent.data ?? [],
    totalSent: totals.count ?? 0,
  });
}

/**
 * PATCH /api/automations/d2c-reengagement
 * Update the enabled flag, sender, or config. Whichever fields are present
 * in the body are updated; others are left alone.
 */
export async function PATCH(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (body.sender_user_id !== undefined) updates.sender_user_id = body.sender_user_id;
  if (body.config) {
    // Merge with existing config so a partial PATCH doesn't blow away other keys.
    const { data: current } = await supabaseServer
      .from("automation_settings")
      .select("config")
      .eq("name", "d2c_reengagement")
      .maybeSingle();
    const currentCfg = (current?.config as Record<string, unknown> | null) ?? {};
    updates.config = { ...currentCfg, ...body.config };
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("automation_settings")
    .update(updates)
    .eq("name", "d2c_reengagement")
    .select("name, enabled, sender_user_id, config, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
