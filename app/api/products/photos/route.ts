import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/** The photo tags a product page can assign (media_kit_assets.asset_type). */
const PHOTO_TAGS = ["front", "benefits", "lifestyle", "ingredients", "fragrance", "other"] as const;

/**
 * PATCH /api/products/photos — re-tag one product photo `{ id, assetType }`.
 *
 * Only the tag changes; the file and its storage path (and so every URL that
 * uses it) stay put. The storefronts read the tag to pick hero / gallery
 * order, and the Image Library groups by product, so both follow along.
 * Runs with the service role and is gated to internal staff.
 */
export async function PATCH(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: string; assetType?: string } | null;
  const id = body?.id?.trim();
  const assetType = body?.assetType?.trim();
  if (!id) return NextResponse.json({ error: "Missing photo id" }, { status: 400 });
  if (!assetType || !(PHOTO_TAGS as readonly string[]).includes(assetType)) {
    return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("media_kit_assets")
    .update({ asset_type: assetType, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
