import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { canBeWidget, normalizeBlock } from "@/lib/site/pageBlocks";
import { isSiteBrand } from "@/lib/site/registry";
import { WIDGET_MIGRATION_HINT, widgetUsage, widgetsNotReady } from "@/lib/site/widgetsServer";

export const runtime = "nodejs";

/**
 * Saved widgets for a store (Website editor).
 *
 *   GET  — every widget with its draft + published block and the pages that
 *          link to it (draft or live).
 *   POST { name, block } — save a block as a new widget (draft only; it goes
 *          live with the first page publish that links to it).
 *
 * Internal-only; the service role writes (site_widgets has RLS, no policies).
 */

type Row = {
  id: string;
  name: string;
  draft_block: unknown;
  published_block: unknown;
  updated_at: string;
};

export async function GET(request: Request, ctx: { params: Promise<{ brand: string }> }) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { brand } = await ctx.params;
  if (!isSiteBrand(brand)) return NextResponse.json({ widgets: [] });

  const { data, error } = await supabaseServer
    .from("site_widgets")
    .select("id, name, draft_block, published_block, updated_at")
    .eq("brand", brand)
    .order("name");
  if (error) {
    if (widgetsNotReady(error.message)) return NextResponse.json({ widgets: [], notReady: true, hint: WIDGET_MIGRATION_HINT });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const usage = await widgetUsage(brand);
  return NextResponse.json({
    widgets: ((data ?? []) as Row[]).map((w) => ({
      id: w.id,
      name: w.name,
      draft: normalizeBlock({ ...(w.draft_block as object), id: w.id }, new Set()),
      published: w.published_block ? normalizeBlock({ ...(w.published_block as object), id: w.id }, new Set()) : null,
      updatedAt: w.updated_at,
      usedOn: usage.get(w.id) ?? [],
    })),
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ brand: string }> }) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { brand } = await ctx.params;
  if (!isSiteBrand(brand)) return NextResponse.json({ error: "Unknown store" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; block?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const block = normalizeBlock(body.block, new Set());
  if (!name) return NextResponse.json({ error: "Give the widget a name." }, { status: 400 });
  if (!block || !canBeWidget(block.type)) {
    return NextResponse.json({ error: "That kind of block can't be a widget." }, { status: 400 });
  }
  const content: Record<string, unknown> = { ...block };
  delete content.id;
  delete content.hidden;
  const { data, error } = await supabaseServer
    .from("site_widgets")
    .insert({ brand, name, draft_block: content, created_by: user.id, updated_by: user.id })
    .select("id, name, draft_block, updated_at")
    .single<Row>();
  if (error) {
    return NextResponse.json({ error: widgetsNotReady(error.message) ? WIDGET_MIGRATION_HINT : error.message }, { status: 500 });
  }
  return NextResponse.json({
    widget: {
      id: data.id,
      name: data.name,
      draft: normalizeBlock({ ...(data.draft_block as object), id: data.id }, new Set()),
      published: null,
      updatedAt: data.updated_at,
      usedOn: [],
    },
  });
}
