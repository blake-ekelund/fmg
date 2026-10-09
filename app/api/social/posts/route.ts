import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { isSocialBrand, type SocialPost } from "@/lib/social/types";
import {
  DESIGN_MIGRATION_HINT,
  designColumnMissing,
  designFields,
  readPostFields,
  SOCIAL_MIGRATION_HINT,
  tableMissing,
} from "@/lib/social/server";

export const runtime = "nodejs";

/**
 * GET  /api/social/posts?brand=Sassy|NI|all — every post, newest scheduled first.
 * POST /api/social/posts { brand, platforms?, post_type?, caption?, media?, scheduled_at? }
 *      — creates a draft. Scheduling / publishing go through PATCH and /publish.
 *
 * Internal-only; writes through the service role (social_posts has RLS, no policies).
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const brand = new URL(request.url).searchParams.get("brand") ?? "all";
  let q = supabaseServer
    .from("social_posts")
    .select("*")
    .order("scheduled_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(500);
  if (isSocialBrand(brand)) q = q.eq("brand", brand);

  const { data, error } = await q;
  if (error) {
    if (tableMissing(error.message)) return NextResponse.json({ posts: [], notReady: true, hint: SOCIAL_MIGRATION_HINT });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ posts: (data ?? []) as SocialPost[] });
}

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const fields = readPostFields(body);
  if (!fields.brand) return NextResponse.json({ error: "Pick a brand." }, { status: 400 });
  if (fields.design) Object.assign(fields, designFields(fields.design));

  const { data, error } = await supabaseServer
    .from("social_posts")
    .insert({
      platforms: ["instagram", "facebook"],
      ...fields,
      status: "draft",
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) {
    if (tableMissing(error.message)) return NextResponse.json({ error: SOCIAL_MIGRATION_HINT }, { status: 503 });
    if (designColumnMissing(error.message)) return NextResponse.json({ error: DESIGN_MIGRATION_HINT }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ post: data as SocialPost });
}
