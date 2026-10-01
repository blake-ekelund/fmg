import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";
import { BRAND_NAMES, productName } from "@/lib/productImageNames";

export const runtime = "nodejs";

const SIGN_TTL = 60 * 60; // 1 hour
const MAX = 300;
/** Product photos: all of them (~1.1k today), paged and signed in batches. */
const MAX_PRODUCT = 5000;
const PAGE = 1000;
const SIGN_BATCH = 500;

type Asset = {
  id: string;
  title: string;
  description: string | null;
  kind: "photo" | "product" | "brand";
  url: string | null;
  fileName: string | null;
};

/**
 * GET /api/portal/assets — brand assets reps may download. Global (not agency
 * scoped): active marketing photos + product media-kit imagery + brand images
 * from the email-assets library marked safe for 3rd-party use. Photo/product
 * URLs are short-lived signed links; brand images live in a public bucket so
 * they use plain public URLs. Gated to provisioned reps.
 */
export async function GET(request: Request) {
  // Global data, but gated the same way so admin preview renders the real tab.
  const rep = await resolvePortalAgency(request);
  if (!rep) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const assets: Asset[] = [];

  // ── Marketing photo-share library (global) ──────────────────────────────────
  const { data: photos } = await supabaseServer
    .from("photo_share_assets")
    .select("id, title, description, file_path")
    .eq("is_active", true)
    .order("uploaded_at", { ascending: false })
    .limit(MAX);

  const photoRows = (photos ?? []) as {
    id: string;
    title: string;
    description: string | null;
    file_path: string;
  }[];

  if (photoRows.length > 0) {
    const { data: signed } = await supabaseServer.storage
      .from("marketing-photo-share")
      .createSignedUrls(photoRows.map((p) => p.file_path), SIGN_TTL);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const p of photoRows) {
      assets.push({
        id: `photo:${p.id}`,
        title: p.title,
        description: p.description,
        kind: "photo",
        url: byPath.get(p.file_path) ?? null,
        fileName: p.file_path.split("/").pop() ?? p.title,
      });
    }
  }

  // ── Product media-kit imagery (global) ──────────────────────────────────────
  // Every product photo, paged (PostgREST caps responses at 1000 rows; a unique
  // tiebreaker keeps .range() from dropping rows). media_kit_assets has
  // `uploaded_at` and no `file_name`.
  type MediaRow = { id: string; part: string; asset_type: string; storage_path: string };
  const mediaRows: MediaRow[] = [];
  for (let from = 0; from < MAX_PRODUCT; from += PAGE) {
    const { data, error } = await supabaseServer
      .from("media_kit_assets")
      .select("id, part, asset_type, storage_path")
      .order("uploaded_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[portal/assets] product imagery query failed:", error.message);
      break;
    }
    mediaRows.push(...((data ?? []) as MediaRow[]));
    if (!data || data.length < PAGE) break;
  }
  const productRows = mediaRows.filter((m) => /\.(png|jpe?g|gif|webp)$/i.test(m.storage_path));

  if (productRows.length > 0) {
    // Name photos by product ("Body Butter · Sea Salt"), not part number.
    type ProductRow = { part: string; display_name: string | null; fragrance: string | null; brand: string | null };
    const parts = Array.from(new Set(productRows.map((m) => m.part)));
    const byPart = new Map<string, ProductRow>();
    for (let i = 0; i < parts.length; i += 200) {
      const { data } = await supabaseServer
        .from("inventory_products")
        .select("part, display_name, fragrance, brand")
        .in("part", parts.slice(i, i + 200));
      for (const p of (data ?? []) as ProductRow[]) byPart.set(p.part, p);
    }

    const byPath = new Map<string, string>();
    for (let i = 0; i < productRows.length; i += SIGN_BATCH) {
      const { data: signed } = await supabaseServer.storage
        .from("media-kit")
        .createSignedUrls(productRows.slice(i, i + SIGN_BATCH).map((m) => m.storage_path), SIGN_TTL);
      for (const s of signed ?? []) if (s.path && s.signedUrl) byPath.set(s.path, s.signedUrl);
    }

    for (const m of productRows) {
      const p = byPart.get(m.part);
      const name = productName(p?.display_name ?? null, p?.fragrance ?? null, m.part);
      const brand = p?.brand ? BRAND_NAMES[p.brand] ?? p.brand : null;
      assets.push({
        id: `media:${m.id}`,
        title: `${name} — ${m.asset_type}`,
        description: [brand, m.part].filter(Boolean).join(" · "),
        kind: "product",
        url: byPath.get(m.storage_path) ?? null,
        fileName: m.storage_path.split("/").pop() ?? m.part,
      });
    }
  }

  // ── Brand image library (email-assets), curated for 3rd-party use ───────────
  // The bucket is public, so these get plain public URLs (no signing needed).
  const { data: brand } = await supabaseServer
    .from("email_asset_meta")
    .select("path, title, description")
    .eq("share_scope", "third_party")
    .order("updated_at", { ascending: false })
    .limit(MAX);

  const brandRows = (brand ?? []) as {
    path: string;
    title: string | null;
    description: string | null;
  }[];

  for (const b of brandRows) {
    const { data: pub } = supabaseServer.storage.from("email-assets").getPublicUrl(b.path);
    const fileName = b.path.split("/").pop() ?? null;
    assets.push({
      id: `brand:${b.path}`,
      title: b.title || fileName || "Brand image",
      description: b.description,
      kind: "brand",
      url: pub.publicUrl,
      fileName,
    });
  }

  return NextResponse.json({ assets });
}
