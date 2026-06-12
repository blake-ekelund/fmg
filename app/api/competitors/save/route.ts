import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { detectCompetitor } from "@/lib/competitor-detect";

export const runtime = "nodejs";

type SavePayload = {
  id?: string;
  name?: string;
  locatorUrl?: string;
  notes?: string | null;
  enabled?: boolean;
};

export async function POST(request: Request) {
  let body: SavePayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim();
  const locatorUrl = body.locatorUrl?.trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!locatorUrl) return NextResponse.json({ error: "Locator URL is required" }, { status: 400 });

  const detection = await detectCompetitor(locatorUrl);
  if (!detection.ok) {
    return NextResponse.json({ error: detection.reason }, { status: 422 });
  }

  const { config } = detection;
  const row: Record<string, unknown> = {
    name,
    base_url: config.base_url,
    endpoint_path: config.endpoint_path,
    request_config: { ...config.request_config, platform: config.platform },
    response_config: config.response_config,
    enabled: body.enabled ?? true,
    notes: body.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (config.rate_limit_ms != null) {
    row.rate_limit_ms = config.rate_limit_ms;
  }

  if (body.id) {
    const { data, error } = await supabaseServer
      .from("competitors")
      .update(row)
      .eq("id", body.id)
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id, platform: config.platform });
  }

  const { data, error } = await supabaseServer
    .from("competitors")
    .insert(row)
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id, platform: config.platform });
}
