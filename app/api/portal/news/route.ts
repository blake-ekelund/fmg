import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * GET /api/portal/news — the portal's What's New feed (published items, newest
 * first). Same for every rep (not agency-scoped); resolvePortalAgency is used
 * only to confirm the caller is a signed-in portal user (or previewing admin).
 */
export async function GET(request: Request) {
  const rep = await resolvePortalAgency(request);
  if (!rep) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("portal_news")
    .select("id, brand, category, title, summary, body, image_url, link_url, published_at")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ news: data ?? [] });
}
