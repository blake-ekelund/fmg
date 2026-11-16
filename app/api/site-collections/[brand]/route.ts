import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { safeImage, type CollectionCopy, type PageBlock } from "@/lib/site/pageBlocks";
import { isSiteBrand, normalizeSitePage, siteDefaults } from "@/lib/site/registry";

export const runtime = "nodejs";

/**
 * One collection's words or picture, set LIVE — from the Website editor's
 * collection pages, where they're typed straight onto the page.
 *
 *   GET   — every collection's current (live) entry.
 *   PATCH { slug, field, value } — field: tagline | description | notes.0–2 |
 *         image | heroProduct | (NI hero slide) heroLabel | heroTitle |
 *         heroAccent | heroDescription | heroInvitation | heroKicker | heroLine.
 *
 * They're stored on the store's "collection-copy" page (Fragrance collections
 * (words) on NI, Collections (words & pictures) on Sassy). A change here goes
 * into BOTH its draft and its published copy, for that one field only — like
 * a catalog edit, it's live within a minute, and nothing else pending in
 * that page's draft goes live with it. Internal-only; service role.
 */

type Ctx = { params: Promise<{ brand: string }> };
const SLUG = "collection-copy";
const FIELDS = new Set([
  "tagline",
  "description",
  "notes.0",
  "notes.1",
  "notes.2",
  "image",
  "heroProduct",
  // NI: the living hero slide on the collection page (and homepage).
  "heroLabel", "heroTitle", "heroAccent", "heroDescription", "heroInvitation", "heroKicker", "heroLine",
]);
const MAX: Record<string, number> = {
  tagline: 80,
  description: 600,
  image: 2000,
  heroProduct: 60,
  heroLabel: 60,
  heroTitle: 60,
  heroAccent: 60,
  heroDescription: 600,
  heroInvitation: 120,
  heroKicker: 80,
  heroLine: 120,
};

function setItemField(blocks: PageBlock[], slug: string, field: string, value: string): PageBlock[] | null {
  let hit = false;
  const next = blocks.map((b) => {
    if (b.type !== "collections_copy") return b;
    return {
      ...b,
      items: b.items.map((c): CollectionCopy => {
        if (c.slug !== slug) return c;
        hit = true;
        if (field.startsWith("notes.")) {
          const k = Number(field.slice(6));
          return { ...c, notes: [0, 1, 2].map((i) => (i === k ? value : (c.notes[i] ?? ""))) };
        }
        return { ...c, [field]: value };
      }),
    };
  });
  return hit ? next : null;
}

export async function GET(request: Request, ctx: Ctx) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { brand } = await ctx.params;
  if (!isSiteBrand(brand)) return NextResponse.json({ error: "Unknown store" }, { status: 404 });
  const { data } = await supabaseServer
    .from("site_pages")
    .select("published_blocks")
    .eq("brand", brand)
    .eq("slug", SLUG)
    .maybeSingle<{ published_blocks: unknown }>();
  const blocks = normalizeSitePage(brand, SLUG, data?.published_blocks) ?? siteDefaults(brand, SLUG);
  const block = blocks.find((b) => b.type === "collections_copy");
  return NextResponse.json({ items: block?.type === "collections_copy" ? block.items : [] });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { brand } = await ctx.params;
  if (!isSiteBrand(brand) || !siteDefaults(brand, SLUG).length) {
    return NextResponse.json({ error: "Unknown store" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { slug?: unknown; field?: unknown; value?: unknown };
  const slug = typeof body.slug === "string" ? body.slug : "";
  const field = typeof body.field === "string" ? body.field : "";
  if (!slug || !FIELDS.has(field) || typeof body.value !== "string") {
    return NextResponse.json({ error: "slug, field and value are required" }, { status: 400 });
  }
  // Typed on the page: plain text (line breaks become spaces).
  let value = body.value.replace(/\s*\n+\s*/g, " ").trim().slice(0, MAX[field] ?? 60);
  if (field === "image") {
    value = safeImage(value);
    if (body.value && !value) return NextResponse.json({ error: "That picture link isn't allowed." }, { status: 400 });
  }

  const { data: row, error } = await supabaseServer
    .from("site_pages")
    .select("id, draft_blocks, published_blocks")
    .eq("brand", brand)
    .eq("slug", SLUG)
    .maybeSingle<{ id: string; draft_blocks: unknown; published_blocks: unknown }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const defaults = siteDefaults(brand, SLUG);
  const draft = setItemField(normalizeSitePage(brand, SLUG, row?.draft_blocks) ?? defaults, slug, field, value);
  const live = setItemField(normalizeSitePage(brand, SLUG, row?.published_blocks) ?? defaults, slug, field, value);
  if (!draft || !live) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });

  const now = new Date().toISOString();
  // No history row: these are field edits saved as they're typed, and would
  // crowd the page's list of real publishes.
  const { error: upErr } = await supabaseServer
    .from("site_pages")
    .upsert(
      {
        brand,
        slug: SLUG,
        draft_blocks: draft,
        published_blocks: live,
        published_at: now,
        published_by: user.id,
        updated_by: user.id,
        updated_at: now,
      },
      { onConflict: "brand,slug" },
    );
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const block = live.find((b) => b.type === "collections_copy");
  const item = block?.type === "collections_copy" ? block.items.find((c) => c.slug === slug) : null;
  return NextResponse.json({ ok: true, item });
}
