import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { sanitizeRichText } from "@/lib/richText";

export const runtime = "nodejs";

/**
 * A product's storefront copy — the same `media_kit_products` columns the
 * Products page edits, so a change made here IS the catalog change (no
 * draft: the stores read it live, within about a minute).
 *
 *  GET   ?part=…                      — the copy fields + the product's name.
 *  PATCH { part, field, value }       — one field, rich-text sanitized.
 *
 * Used by the Website editor, where shoppers' product text is typed straight
 * onto the page. Service role, internal staff only.
 */

/** Editor field name → media_kit_products column. */
const COPY_FIELDS = {
  shortDescription: "short_description",
  longDescription: "long_description",
  benefits: "benefits",
  ingredients: "ingredients_text",
  howToUse: "how_to_use",
} as const;
type CopyField = keyof typeof COPY_FIELDS;

const MAX = 20000;

/** The page's editor can hand back any markup it shows (links, headings,
 *  the ® superscript): keep the text of anything the catalog doesn't allow,
 *  then the catalog's own allowlist sanitizer. */
function clean(value: string): string {
  const kept = value
    // Headings from the page's toolbar → paragraphs.
    .replace(/<(\/?)h[1-6][^>]*>/gi, "<$1p>")
    .replace(/<(?!\/?(p|br|strong|em|b|i|ul|ol|li|div)\b)\/?[a-z][^>]*>/gi, "");
  const html = sanitizeRichText(kept);
  // One plain paragraph = plain text, like legacy copy.
  const single = html.match(/^<p>([^<]*)<\/p>$/);
  return single ? single[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'") : html;
}

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const part = new URL(request.url).searchParams.get("part");
  if (!part) return NextResponse.json({ error: "part is required" }, { status: 400 });
  const [copy, product] = await Promise.all([
    supabaseServer
      .from("media_kit_products")
      .select("short_description, long_description, benefits, ingredients_text, how_to_use")
      .eq("part", part)
      .maybeSingle(),
    supabaseServer.from("inventory_products").select("display_name").eq("part", part).maybeSingle(),
  ]);
  if (copy.error) return NextResponse.json({ error: copy.error.message }, { status: 500 });
  const row = (copy.data ?? {}) as Record<string, string | null>;
  return NextResponse.json({
    part,
    name: (product.data as { display_name: string | null } | null)?.display_name || part,
    copy: Object.fromEntries(
      Object.entries(COPY_FIELDS).map(([field, col]) => [field, row[col] ?? ""]),
    ) as Record<CopyField, string>,
  });
}

export async function PATCH(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { part?: unknown; field?: unknown; value?: unknown };
  const part = typeof body.part === "string" ? body.part.trim() : "";
  const field = body.field as CopyField;
  if (!part || !(field in COPY_FIELDS) || typeof body.value !== "string") {
    return NextResponse.json({ error: "part, field and value are required" }, { status: 400 });
  }
  if (body.value.length > MAX) return NextResponse.json({ error: "That's too long." }, { status: 400 });
  const value = clean(body.value);
  const { error } = await supabaseServer.from("media_kit_products").upsert(
    { part, [COPY_FIELDS[field]]: value || null, updated_at: new Date().toISOString() },
    { onConflict: "part" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, value });
}
