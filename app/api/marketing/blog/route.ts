import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import {
  BLOG_LIST_COLUMNS,
  isBlogBrand,
  normalizeTags,
  slugify,
  type BlogPostSummary,
} from "@/lib/blogPosts";
import { isBlogAudience, isBlogPurpose } from "@/lib/blog/meta";
import { normalizeBlogBlocks } from "@/lib/blog/normalize";
import { renderBlogBlocks } from "@/lib/blog/render";
import { heroCreditFor } from "@/lib/blog/heroCredit";
import { builderColumnMissing, BUILDER_MIGRATION_HINT } from "@/lib/blog/serverCompat";

export const runtime = "nodejs";

/**
 * GET  /api/marketing/blog?brand=Sassy|NI|all
 *      Every post that is not soft-deleted, without bodies. The board sorts
 *      and buckets client-side; there are a few hundred rows at most.
 *
 * POST /api/marketing/blog  { brand, title?, blocks?, audience?, purpose?,
 *                              description?, seo_meta?, tags?, hero_image_url? }
 *      Creates a draft and returns it. The new-post wizard sends the lot;
 *      with `blocks` the post is a builder post and `body` is compiled from
 *      them here. Before the builder migration is applied the draft is still
 *      created (body compiled, blocks dropped) and the response says so.
 *
 * Internal-only, same guard as the rest of the portal. Writes go through the
 * service role — blog_posts has RLS on with no policies, on purpose.
 */

function columnMissing(message: string): boolean {
  return /column .*(publish_at|published_at|slug).* does not exist/i.test(message);
}

const MIGRATION_HINT =
  "blog scheduling columns are missing — run supabase/migrations/20260913000000_blog_scheduling.sql";

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const brand = new URL(request.url).searchParams.get("brand") ?? "all";

  let query = supabaseServer
    .from("blog_posts")
    .select(BLOG_LIST_COLUMNS)
    .neq("status", "deleted")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (isBlogBrand(brand)) query = query.eq("brand", brand);

  const { data, error } = await query;
  if (error) {
    if (columnMissing(error.message)) {
      return NextResponse.json({ posts: [], notReady: true, hint: MIGRATION_HINT });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ posts: (data ?? []) as unknown as BlogPostSummary[] });
}

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const brand = isBlogBrand(body.brand) ? body.brand : "Sassy";
  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled post";

  const blocks = Array.isArray(body.blocks) ? normalizeBlogBlocks(body.blocks, brand) : null;
  const heroUrl = typeof body.hero_image_url === "string" ? body.hero_image_url.trim() : "";
  const base = {
    brand,
    title,
    slug: slugify(title) || null,
    body: blocks ? renderBlogBlocks(blocks, brand, { heroCredit: await heroCreditFor(heroUrl) }) : "",
    status: "draft",
    tags: normalizeTags(body.tags),
    seo_meta: typeof body.seo_meta === "string" && body.seo_meta.trim() ? body.seo_meta.trim() : null,
    hero_image_url: heroUrl,
    updated_at: new Date().toISOString(),
  };
  const builder = {
    blocks,
    audience: isBlogAudience(body.audience) ? body.audience : null,
    purpose: isBlogPurpose(body.purpose) ? body.purpose : null,
    description:
      typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
  };

  let { data, error } = await supabaseServer
    .from("blog_posts")
    .insert({ ...base, ...builder })
    .select("*")
    .single();
  let hint: string | undefined;
  if (error && builderColumnMissing(error)) {
    ({ data, error } = await supabaseServer.from("blog_posts").insert(base).select("*").single());
    hint = BUILDER_MIGRATION_HINT;
  }

  if (error) {
    if (columnMissing(error.message)) {
      return NextResponse.json({ error: MIGRATION_HINT }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ post: data, hint });
}
