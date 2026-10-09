import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { canBeWidget, normalizeBlock } from "@/lib/site/pageBlocks";
import { isSiteBrand } from "@/lib/site/registry";
import { WIDGET_MIGRATION_HINT, widgetUsage, widgetsNotReady } from "@/lib/site/widgetsServer";

export const runtime = "nodejs";

/**
 * One saved widget.
 *   PUT    { name?, block? } — rename and/or save the draft content (autosave).
 *          A widget keeps its kind of block.
 *   DELETE — only when no page (draft or live) links to it.
 */

type Ctx = { params: Promise<{ brand: string; id: string }> };

async function resolve(request: Request, ctx: Ctx) {
  const user = await requireInternalUser(request);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const { brand, id } = await ctx.params;
  if (!isSiteBrand(brand) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { error: NextResponse.json({ error: "Unknown widget" }, { status: 404 }) };
  }
  return { user, brand, id };
}

export async function PUT(request: Request, ctx: Ctx) {
  const r = await resolve(request, ctx);
  if ("error" in r) return r.error;
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; block?: unknown };
  const patch: Record<string, unknown> = { updated_by: r.user.id, updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 80);
  if (body.block !== undefined) {
    const block = normalizeBlock(body.block, new Set());
    if (!block || !canBeWidget(block.type)) return NextResponse.json({ error: "Invalid block." }, { status: 400 });
    const { data: current, error: readErr } = await supabaseServer
      .from("site_widgets")
      .select("draft_block")
      .eq("id", r.id)
      .eq("brand", r.brand)
      .maybeSingle<{ draft_block: { type?: string } }>();
    if (readErr) {
      return NextResponse.json({ error: widgetsNotReady(readErr.message) ? WIDGET_MIGRATION_HINT : readErr.message }, { status: 500 });
    }
    if (!current) return NextResponse.json({ error: "Unknown widget" }, { status: 404 });
    if (current.draft_block?.type !== block.type) {
      return NextResponse.json({ error: "A widget can't change its kind of block." }, { status: 400 });
    }
    const content: Record<string, unknown> = { ...block };
    delete content.id;
    delete content.hidden;
    patch.draft_block = content;
  }
  const { error } = await supabaseServer.from("site_widgets").update(patch).eq("id", r.id).eq("brand", r.brand);
  if (error) {
    return NextResponse.json({ error: widgetsNotReady(error.message) ? WIDGET_MIGRATION_HINT : error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const r = await resolve(request, ctx);
  if ("error" in r) return r.error;
  const used = (await widgetUsage(r.brand)).get(r.id) ?? [];
  if (used.length) {
    return NextResponse.json(
      { error: `Still used on: ${used.map((u) => u.label).join(", ")}. Unlink it there first.` },
      { status: 409 },
    );
  }
  const { error } = await supabaseServer.from("site_widgets").delete().eq("id", r.id).eq("brand", r.brand);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
