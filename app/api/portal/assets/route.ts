import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";

export const runtime = "nodejs";

const SIGN_TTL = 60 * 60; // 1 hour
const MAX = 300;

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
  const { data: media } = await supabaseServer
    .from("media_kit_assets")
    .select("id, part, asset_type, storage_path, file_name")
    .order("created_at", { ascending: false })
    .limit(MAX);

  const mediaRows = (media ?? []) as {
    id: string;
    part: string;
    asset_type: string;
    storage_path: string;
    file_name: string | null;
  }[];

  if (mediaRows.length > 0) {
    const { data: signed } = await supabaseServer.storage
      .from("media-kit")
      .createSignedUrls(mediaRows.map((m) => m.storage_path), SIGN_TTL);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const m of mediaRows) {
      assets.push({
        id: `media:${m.id}`,
        title: `${m.part} · ${m.asset_type}`,
        description: null,
        kind: "product",
        url: byPath.get(m.storage_path) ?? null,
        fileName: m.file_name ?? m.storage_path.split("/").pop() ?? m.part,
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
