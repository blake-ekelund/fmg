import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { SITE_PAGES } from "@/lib/site/pageDefaults";

export const runtime = "nodejs";

/**
 * GET /api/site-pages/<brand> — every editable page with its state, for the
 * Website editor's page list: published (and when), and whether the draft
 * has unpublished changes. Pages with no row are "original".
 */
export async function GET(request: Request, ctx: { params: Promise<{ brand: string }> }) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { brand } = await ctx.params;
  if (brand !== "Sassy") return NextResponse.json({ pages: [] });

  const { data, error } = await supabaseServer
    .from("site_pages")
    .select("slug, draft_blocks, published_blocks, published_at, updated_at")
    .eq("brand", brand);
  // Tables not created yet → every page reads as original.
  const rows = error ? [] : (data ?? []);

  return NextResponse.json({
    pages: SITE_PAGES.map((p) => {
      const row = rows.find((r) => r.slug === p.slug);
      return {
        slug: p.slug,
        publishedAt: row?.published_at ?? null,
        updatedAt: row?.updated_at ?? null,
        unpublished: row
          ? JSON.stringify(row.draft_blocks) !== JSON.stringify(row.published_blocks)
          : false,
      };
    }),
  });
}
