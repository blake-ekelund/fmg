import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/email/link/<id>
 *
 * Logs a click event then 302-redirects to the original URL. If the id is
 * unknown or the lookup fails, redirect to the portal home rather than show
 * an error page — the recipient's experience should never look broken.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const home = new URL("/", request.url).toString();

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.redirect(home, { status: 302 });
  }

  try {
    const { data: link } = await supabaseServer
      .from("email_message_links")
      .select("id, original_url")
      .eq("id", id)
      .maybeSingle();
    if (!link?.original_url) {
      return NextResponse.redirect(home, { status: 302 });
    }

    const userAgent = request.headers.get("user-agent");
    const xff = request.headers.get("x-forwarded-for");
    const ip = xff?.split(",")[0]?.trim() || null;

    await supabaseServer.from("email_message_link_clicks").insert({
      link_id: id,
      user_agent: userAgent,
      ip,
    });

    return NextResponse.redirect(link.original_url as string, { status: 302 });
  } catch {
    return NextResponse.redirect(home, { status: 302 });
  }
}
