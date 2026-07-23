import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * GET /api/email/block-templates
 *
 * The designed, block-based templates from /templates — the ones the compose
 * modal can send via `block_template_id`. Distinct from /api/email/templates,
 * which serves the per-user plain-text snippets.
 *
 * Blocks themselves are deliberately not returned: the picker only needs
 * enough to label a row, and the send route re-reads and renders them
 * server-side anyway.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from("email_templates")
    .select("id, name, subject, preview_text, brand, channel, status, updated_at, blocks")
    .eq("type", "email")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const templates = (data ?? []).map((t) => {
    const blocks = Array.isArray(t.blocks) ? t.blocks : [];
    return {
      id: t.id as string,
      name: (t.name as string) ?? "Untitled",
      subject: (t.subject as string | null) ?? null,
      preview_text: (t.preview_text as string | null) ?? null,
      brand: (t.brand as string | null) ?? null,
      channel: (t.channel as string | null) ?? null,
      status: (t.status as string | null) ?? null,
      updated_at: t.updated_at as string,
      block_count: blocks.length,
    };
  });

  return NextResponse.json({ templates });
}
