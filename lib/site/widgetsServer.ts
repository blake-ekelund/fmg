import { supabaseServer } from "@/lib/supabaseServer";
import { widgetIds } from "@/lib/site/pageBlocks";
import { normalizeSitePage, sitePageFor, type SiteBrand } from "@/lib/site/registry";

/** Server-only helpers for saved widgets (site_widgets). */

export type WidgetUse = { slug: string; label: string };

export const WIDGET_MIGRATION_HINT =
  "Widgets need the site_widgets table — run supabase/migrations/20261010000000_site_widgets.sql (npx supabase db push).";

export function widgetsNotReady(message: string): boolean {
  return /site_widgets/.test(message) && /does not exist|schema cache/i.test(message);
}

/** widget id → the pages (draft or published) that link to it. */
export async function widgetUsage(brand: SiteBrand): Promise<Map<string, WidgetUse[]>> {
  const { data } = await supabaseServer
    .from("site_pages")
    .select("slug, draft_blocks, published_blocks")
    .eq("brand", brand);
  const usage = new Map<string, WidgetUse[]>();
  for (const row of (data ?? []) as { slug: string; draft_blocks: unknown; published_blocks: unknown }[]) {
    const def = sitePageFor(brand, row.slug);
    if (!def) continue;
    const ids = new Set([
      ...widgetIds(normalizeSitePage(brand, row.slug, row.draft_blocks) ?? []),
      ...widgetIds(normalizeSitePage(brand, row.slug, row.published_blocks) ?? []),
    ]);
    for (const id of ids) usage.set(id, [...(usage.get(id) ?? []), { slug: row.slug, label: def.label }]);
  }
  return usage;
}

/** Publish the drafts of these widgets (a page publish takes its widgets live). */
export async function publishWidgets(brand: SiteBrand, ids: string[], at: string): Promise<void> {
  if (!ids.length) return;
  const { data } = await supabaseServer
    .from("site_widgets")
    .select("id, draft_block")
    .eq("brand", brand)
    .in("id", ids);
  for (const w of (data ?? []) as { id: string; draft_block: unknown }[]) {
    await supabaseServer.from("site_widgets").update({ published_block: w.draft_block, published_at: at }).eq("id", w.id);
  }
}
