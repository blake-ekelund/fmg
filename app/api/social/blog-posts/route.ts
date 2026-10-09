import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { BLOG_LIST_COLUMNS, isBlogBrand, type BlogPostSummary } from "@/lib/blogPosts";
import { BLOG_SOURCE_STATUSES } from "@/lib/social/fromBlog";

export const runtime = "nodejs";

/**
 * GET /api/social/blog-posts?brand=Sassy|NI — the brand's blog posts a
 * social post can be made from (drafts, scheduled and published; not
 * archived or deleted), newest first.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const brand = new URL(request.url).searchParams.get("brand");
  if (!isBlogBrand(brand)) return NextResponse.json({ error: "Pick a brand." }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("blog_posts")
    .select(BLOG_LIST_COLUMNS)
    .eq("brand", brand)
    .in("status", BLOG_SOURCE_STATUSES)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: (data ?? []) as unknown as BlogPostSummary[] });
}
