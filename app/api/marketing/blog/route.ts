import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import {
  BLOG_LIST_COLUMNS,
  isBlogBrand,
  slugify,
  type BlogPostSummary,
} from "@/lib/blogPosts";

export const runtime = "nodejs";

/**
 * GET  /api/marketing/blog?brand=Sassy|NI|all
 *      Every post that is not soft-deleted, without bodies. The board sorts
 *      and buckets client-side; there are a few hundred rows at most.
 *
 * POST /api/marketing/blog  { brand, title? }
 *      Creates an empty draft and returns it, so the editor has an id to
 *      autosave against from the first keystroke.
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

  let body: { brand?: unknown; title?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const brand = isBlogBrand(body.brand) ? body.brand : "Sassy";
  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled post";

  const { data, error } = await supabaseServer
    .from("blog_posts")
    .insert({
      brand,
      title,
      slug: slugify(title) || null,
      body: "",
      status: "draft",
      tags: null,
      seo_meta: null,
      hero_image_url: "",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    if (columnMissing(error.message)) {
      return NextResponse.json({ error: MIGRATION_HINT }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ post: data });
}
