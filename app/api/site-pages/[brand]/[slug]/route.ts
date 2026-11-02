import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { parseOverrideSlug, widgetIds, type PageBlock } from "@/lib/site/pageBlocks";
import { publishWidgets } from "@/lib/site/widgetsServer";
import { isSiteBrand, normalizeSitePage, siteDefaults, sitePageFor, type SiteBrand } from "@/lib/site/registry";
import { sitePagePreviewUrl } from "@/lib/site/preview";

export const runtime = "nodejs";

/**
 * One storefront page in the Website editor (pages per brand: lib/site/registry.ts).
 *
 *   GET   — draft + published blocks, publish history and the preview link.
 *           No row yet = the store's built-in default, returned as the draft.
 *   PUT   { blocks }                — save the draft (autosave).
 *   POST  { action: "publish" }     — draft goes live; a history row is kept.
 *         { action: "discard" }     — draft reset to what's live.
 *         { action: "restore", versionId } — a past publish copied into the draft.
 *         { action: "reset" }       — draft reset to the original hand-coded page.
 *
 * A product's or collection's own page (`product~SKU`, `collection~slug`)
 * starts as a copy of its template as it's live now, and `followsTemplate`
 * says the item still shows the template. On one, "reset" (and "discard"
 * before its first publish) deletes it — the item goes back to the template,
 * live at once.
 *
 * GET /api/site-pages/<brand> (sibling route) lists every page with its state.
 *
 * Internal-only; writes use the service role (site_pages has RLS, no policies).
 */

type Ctx = { params: Promise<{ brand: string; slug: string }> };

type PageRow = {
  id: string;
  draft_blocks: unknown;
  published_blocks: unknown;
  published_at: string | null;
  updated_at: string;
};

function notReady(message: string): boolean {
  return /site_pages|site_page_versions/.test(message) && /does not exist|schema cache/i.test(message);
}

const MIGRATION_HINT =
  "The Website tables aren't in the database yet — run supabase/migrations/20261009000000_site_pages.sql (npx supabase db push).";

async function resolve(request: Request, ctx: Ctx) {
  const user = await requireInternalUser(request);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const { brand, slug } = await ctx.params;
  if (!isSiteBrand(brand) || !sitePageFor(brand, slug)) {
    return { error: NextResponse.json({ error: "Unknown page" }, { status: 404 }) };
  }
  return { user, brand, slug };
}

async function loadRow(brand: string, slug: string) {
  return supabaseServer
    .from("site_pages")
    .select("id, draft_blocks, published_blocks, published_at, updated_at")
    .eq("brand", brand)
    .eq("slug", slug)
    .maybeSingle<PageRow>();
}

/** An own page's starting point: its template as it's live (published, else
 *  the hand-coded default). Null for a regular page. */
async function templateLive(brand: SiteBrand, slug: string): Promise<PageBlock[] | null> {
  const own = parseOverrideSlug(slug);
  if (!own) return null;
  const { data } = await loadRow(brand, own.base);
  return (
    (data?.published_blocks ? normalizeSitePage(brand, own.base, data.published_blocks) : null) ??
    siteDefaults(brand, own.base)
  );
}

/** Delete an own page — the item shows its template again. */
async function dropOwnPage(id: string) {
  const { error } = await supabaseServer.from("site_pages").delete().eq("id", id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : null;
}

async function respond(brand: SiteBrand, slug: string) {
  const { data: row, error } = await loadRow(brand, slug);
  const template = await templateLive(brand, slug);
  if (error) {
    if (notReady(error.message)) {
      return NextResponse.json({
        draft: template ?? siteDefaults(brand, slug),
        published: null,
        publishedAt: null,
        updatedAt: null,
        versions: [],
        previewUrl: sitePagePreviewUrl(brand, slug),
        notReady: true,
        hint: MIGRATION_HINT,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let versions: { id: string; published_at: string }[] = [];
  if (row) {
    const { data } = await supabaseServer
      .from("site_page_versions")
      .select("id, published_at")
      .eq("page_id", row.id)
      .order("published_at", { ascending: false })
      .limit(20);
    versions = data ?? [];
  }

  const published = row?.published_blocks ? normalizeSitePage(brand, slug, row.published_blocks) : null;
  return NextResponse.json({
    draft: normalizeSitePage(brand, slug, row?.draft_blocks) ?? template ?? siteDefaults(brand, slug),
    // An own page that isn't live yet: what's live is the template.
    published: published ?? template,
    ...(template ? { followsTemplate: !published, ownStarted: !!row } : {}),
    publishedAt: row?.published_at ?? null,
    updatedAt: row?.updated_at ?? null,
    versions,
    previewUrl: sitePagePreviewUrl(brand, slug),
  });
}

/** Insert-or-update the draft; returns an error response or null. */
async function saveDraft(brand: string, slug: string, blocks: PageBlock[], userId: string) {
  const { error } = await supabaseServer.from("site_pages").upsert(
    {
      brand,
      slug,
      draft_blocks: blocks,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "brand,slug" },
  );
  if (!error) return null;
  return NextResponse.json(
    { error: notReady(error.message) ? MIGRATION_HINT : error.message },
    { status: 500 },
  );
}

export async function GET(request: Request, ctx: Ctx) {
  const r = await resolve(request, ctx);
  if ("error" in r) return r.error;
  return respond(r.brand, r.slug);
}

export async function PUT(request: Request, ctx: Ctx) {
  const r = await resolve(request, ctx);
  if ("error" in r) return r.error;
  const body = (await request.json().catch(() => ({}))) as { blocks?: unknown };
  const blocks = normalizeSitePage(r.brand, r.slug, body.blocks);
  if (!blocks) return NextResponse.json({ error: "blocks must be an array" }, { status: 400 });
  const failed = await saveDraft(r.brand, r.slug, blocks, r.user.id);
  if (failed) return failed;
  const { data } = await loadRow(r.brand, r.slug);
  return NextResponse.json({
    ok: true,
    updatedAt: data?.updated_at ?? null,
    previewUrl: sitePagePreviewUrl(r.brand, r.slug),
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const r = await resolve(request, ctx);
  if ("error" in r) return r.error;
  const body = (await request.json().catch(() => ({}))) as { action?: string; versionId?: string };
  const { data: row, error } = await loadRow(r.brand, r.slug);
  if (error) {
    return NextResponse.json(
      { error: notReady(error.message) ? MIGRATION_HINT : error.message },
      { status: 500 },
    );
  }

  switch (body.action) {
    case "publish": {
      if (!row) return NextResponse.json({ error: "Nothing saved yet." }, { status: 400 });
      const blocks = normalizeSitePage(r.brand, r.slug, row.draft_blocks) ?? siteDefaults(r.brand, r.slug);
      const now = new Date().toISOString();
      const { error: upErr } = await supabaseServer
        .from("site_pages")
        .update({ published_blocks: blocks, published_at: now, published_by: r.user.id })
        .eq("id", row.id);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
      await supabaseServer
        .from("site_page_versions")
        .insert({ page_id: row.id, blocks, published_at: now, published_by: r.user.id });
      // The widgets this page links to go live with it (on every page that
      // uses them — that's the point of a widget).
      await publishWidgets(r.brand, widgetIds(blocks), now);
      break;
    }
    case "discard": {
      if (row && !row.published_blocks && parseOverrideSlug(r.slug)) {
        const failed = await dropOwnPage(row.id);
        if (failed) return failed;
        break;
      }
      if (!row?.published_blocks) {
        return NextResponse.json({ error: "Nothing is published yet." }, { status: 400 });
      }
      const failed = await saveDraft(
        r.brand,
        r.slug,
        normalizeSitePage(r.brand, r.slug, row.published_blocks) ?? siteDefaults(r.brand, r.slug),
        r.user.id,
      );
      if (failed) return failed;
      break;
    }
    case "restore": {
      if (!row || typeof body.versionId !== "string") {
        return NextResponse.json({ error: "Unknown version." }, { status: 400 });
      }
      const { data: v } = await supabaseServer
        .from("site_page_versions")
        .select("blocks")
        .eq("id", body.versionId)
        .eq("page_id", row.id)
        .maybeSingle<{ blocks: unknown }>();
      if (!v) return NextResponse.json({ error: "Unknown version." }, { status: 404 });
      const failed = await saveDraft(
        r.brand,
        r.slug,
        normalizeSitePage(r.brand, r.slug, v.blocks) ?? siteDefaults(r.brand, r.slug),
        r.user.id,
      );
      if (failed) return failed;
      break;
    }
    case "reset": {
      if (parseOverrideSlug(r.slug)) {
        const failed = row ? await dropOwnPage(row.id) : null;
        if (failed) return failed;
        break;
      }
      const failed = await saveDraft(r.brand, r.slug, siteDefaults(r.brand, r.slug), r.user.id);
      if (failed) return failed;
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return respond(r.brand, r.slug);
}
