import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/** The photo types a product page can assign (media_kit_assets.asset_type). */
const PHOTO_TAGS = ["front", "benefits", "lifestyle", "ingredients", "fragrance", "other"] as const;

/**
 * Product photo details.
 *
 *  GET   ?part=… — per photo id: free-form `tags` plus title / alt text /
 *                  description.
 *  PATCH         — reorder `{ part, order: [ids] }` (sets sort_order), or
 *                  update one photo `{ id, assetType?, tags?, title?, altText?,
 *                  description? }`; only provided fields change.
 *
 * Type + tags live on `media_kit_assets`. Title / alt / description live in
 * the Image Library's `email_asset_meta` sidecar under the key the library
 * already uses for product photos — "media-kit:<storage_path>" — so a title
 * set here shows in the Image Library too. Nothing here moves the file or
 * changes its URL. Service role, internal staff only (the table's RLS lives
 * outside the repo).
 */

const metaKey = (storagePath: string) => `media-kit:${storagePath}`;

type MetaRow = { path: string; title: string | null; alt_text: string | null; description: string | null };

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const part = new URL(request.url).searchParams.get("part")?.trim();
  if (!part) return NextResponse.json({ error: "Missing part" }, { status: 400 });

  const { data: assets, error } = await supabaseServer
    .from("media_kit_assets")
    .select("id, storage_path, tags")
    .eq("part", part);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (assets ?? []) as { id: string; storage_path: string; tags: string[] | null }[];
  const { data: meta } = rows.length
    ? await supabaseServer
        .from("email_asset_meta")
        .select("path, title, alt_text, description")
        .in("path", rows.map((r) => metaKey(r.storage_path)))
    : { data: [] };
  const byKey = new Map(((meta ?? []) as MetaRow[]).map((m) => [m.path, m]));

  const photos: Record<string, { tags: string[]; title: string | null; altText: string | null; description: string | null }> = {};
  for (const r of rows) {
    const m = byKey.get(metaKey(r.storage_path));
    photos[r.id] = {
      tags: r.tags ?? [],
      title: m?.title ?? null,
      altText: m?.alt_text ?? null,
      description: m?.description ?? null,
    };
  }
  return NextResponse.json({ photos });
}

export async function PATCH(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    part?: string;
    order?: unknown;
    assetType?: string;
    tags?: unknown;
    title?: string;
    altText?: string;
    description?: string;
  } | null;

  // Reorder: `{ part, order: [photo ids, first → last] }` sets sort_order 0…n.
  if (body?.order !== undefined) {
    const part = body.part?.trim();
    if (!part || !Array.isArray(body.order) || body.order.some((x) => typeof x !== "string")) {
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }
    const order = body.order as string[];
    const { data: owned, error: ownErr } = await supabaseServer
      .from("media_kit_assets")
      .select("id")
      .eq("part", part);
    if (ownErr) return NextResponse.json({ error: ownErr.message }, { status: 500 });
    const ids = new Set(((owned ?? []) as { id: string }[]).map((r) => r.id));
    if (order.length !== ids.size || order.some((x) => !ids.has(x)) || new Set(order).size !== order.length) {
      return NextResponse.json({ error: "Order must list each of this product's photos once" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const results = await Promise.all(
      order.map((photoId, i) =>
        supabaseServer.from("media_kit_assets").update({ sort_order: i, updated_at: now }).eq("id", photoId),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const id = body?.id?.trim();
  if (!id) return NextResponse.json({ error: "Missing photo id" }, { status: 400 });

  const assetType = body?.assetType?.trim();
  if (assetType !== undefined && !(PHOTO_TAGS as readonly string[]).includes(assetType)) {
    return NextResponse.json({ error: "Invalid photo type" }, { status: 400 });
  }
  let tags: string[] | undefined;
  if (body?.tags !== undefined) {
    if (!Array.isArray(body.tags)) return NextResponse.json({ error: "Invalid tags" }, { status: 400 });
    tags = Array.from(
      new Set(body.tags.map((t) => String(t).trim().toLowerCase().slice(0, 40)).filter(Boolean)),
    ).slice(0, 25);
  }

  const now = new Date().toISOString();
  const assetPatch: Record<string, unknown> = {};
  if (assetType !== undefined) assetPatch.asset_type = assetType;
  if (tags !== undefined) assetPatch.tags = tags;

  // Always read the row (we need its storage path for the details key).
  const { data: asset, error: readErr } = await supabaseServer
    .from("media_kit_assets")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  if (Object.keys(assetPatch).length) {
    const { error } = await supabaseServer
      .from("media_kit_assets")
      .update({ ...assetPatch, updated_at: now })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Only overwrite the details that were provided; empty strings clear a field.
  const norm = (v: string | undefined) => (v == null ? undefined : v.trim() === "" ? null : v.trim());
  const meta: Record<string, unknown> = {};
  if (body?.title !== undefined) meta.title = norm(body.title);
  if (body?.altText !== undefined) meta.alt_text = norm(body.altText);
  if (body?.description !== undefined) meta.description = norm(body.description);
  if (Object.keys(meta).length) {
    const { error } = await supabaseServer
      .from("email_asset_meta")
      .upsert(
        { path: metaKey((asset as { storage_path: string }).storage_path), ...meta, updated_by: user.id, updated_at: now },
        { onConflict: "path" },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
