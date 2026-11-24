import { supabaseServer } from "@/lib/supabaseServer";
import { productName } from "@/lib/productImageNames";
import { LIBRARY_BUCKET, PRODUCT_BUCKET, type Bucket } from "./registry";

/**
 * Where one stored image is used. SERVER ONLY (service role).
 *
 * Two kinds of use:
 *   links    — products (media_kit_assets) and fragrances (fragrance_images)
 *              that point at a media-kit file. A linked product that is live
 *              on a storefront shows the photo to shoppers.
 *   mentions — places whose saved content contains the image's URL: website
 *              pages and saved sections (draft and published), blog posts and
 *              email templates.
 *
 * It can't see a URL pasted somewhere outside FMG (storefront code, a sent
 * email, another site), so "not used" means "not used anywhere FMG knows of".
 */

export type ImageUsage = {
  products: { part: string; name: string; brand: string | null; viaFragrance: string | null; live: boolean }[];
  fragrances: { id: string; brand: string; fragrance: string }[];
  pages: { brand: string; slug: string; live: boolean; draft: boolean }[];
  sections: { brand: string | null; name: string; live: boolean; draft: boolean }[];
  blogPosts: { id: string; title: string; brand: string | null; live: boolean }[];
  emails: { id: string; name: string; status: string | null }[];
  /** Shoppers can see it right now (live product, published page/section, or published post). */
  liveOnSite: boolean;
  /** Anything at all points at it. */
  inUse: boolean;
};

/** "media-kit:<path>" / "<path>" → bucket + path. */
export function parseLibraryKey(key: string): { bucket: Bucket; path: string } {
  return key.startsWith(`${PRODUCT_BUCKET}:`)
    ? { bucket: PRODUCT_BUCKET, path: key.slice(PRODUCT_BUCKET.length + 1) }
    : { bucket: LIBRARY_BUCKET, path: key };
}

/** Every row of a table (PostgREST caps a response at 1000). Empty on error — a missing table isn't fatal. */
async function allRows<T>(table: string, columns: string, max = 5000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await supabaseServer.from(table).select(columns).order("id").range(from, from + 999);
    if (error || !data) break;
    out.push(...(data as unknown as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

export async function imageUsage(bucket: Bucket, path: string): Promise<ImageUsage> {
  // The public URL always contains "<bucket>/<path>"; a stored URL may have
  // the path percent-encoded.
  const needles = Array.from(
    new Set([`${bucket}/${path}`, `${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, `${bucket}/${encodeURI(path)}`]),
  );
  const mentions = (value: unknown): boolean => {
    if (value == null) return false;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return needles.some((n) => text.includes(n));
  };

  const usage: ImageUsage = {
    products: [],
    fragrances: [],
    pages: [],
    sections: [],
    blogPosts: [],
    emails: [],
    liveOnSite: false,
    inUse: false,
  };

  /* Links — media-kit files only. */
  if (bucket === PRODUCT_BUCKET) {
    const [{ data: linkRows }, { data: fiRows }] = await Promise.all([
      supabaseServer.from("media_kit_assets").select("part, shared_from").eq("storage_path", path),
      supabaseServer.from("fragrance_images").select("id, brand, fragrance").eq("storage_path", path),
    ]);
    usage.fragrances = ((fiRows ?? []) as ImageUsage["fragrances"]).map((f) => ({ id: f.id, brand: f.brand, fragrance: f.fragrance }));
    const fragranceOf = new Map(usage.fragrances.map((f) => [f.id, f.fragrance]));

    const links = (linkRows ?? []) as { part: string; shared_from?: string | null }[];
    const parts = Array.from(new Set(links.map((l) => l.part)));
    if (parts.length) {
      type P = { part: string; brand: string | null; display_name: string | null; fragrance: string | null };
      const info = new Map<string, P>();
      const live = new Set<string>();
      for (let i = 0; i < parts.length; i += 200) {
        const chunk = parts.slice(i, i + 200);
        const [{ data: ps }, { data: sf }] = await Promise.all([
          supabaseServer.from("inventory_products").select("part, brand, display_name, fragrance").in("part", chunk),
          supabaseServer.from("storefront_products").select("part").in("part", chunk),
        ]);
        for (const p of (ps ?? []) as P[]) info.set(p.part, p);
        for (const r of (sf ?? []) as { part: string }[]) live.add(r.part);
      }
      usage.products = parts
        .map((part) => {
          const p = info.get(part);
          const link = links.find((l) => l.part === part && l.shared_from) ?? null;
          return {
            part,
            name: productName(p?.display_name ?? null, p?.fragrance ?? null, part),
            brand: p?.brand ?? null,
            viaFragrance: link?.shared_from ? fragranceOf.get(link.shared_from) ?? "fragrance" : null,
            live: live.has(part),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  /* Mentions — saved content holding the URL. */
  const [pages, widgets, posts, templates] = await Promise.all([
    allRows<{ brand: string; slug: string; draft_blocks: unknown; published_blocks: unknown }>(
      "site_pages",
      "id, brand, slug, draft_blocks, published_blocks",
    ),
    allRows<{ brand?: string | null; name: string; draft_block: unknown; published_block: unknown }>(
      "site_widgets",
      "id, brand, name, draft_block, published_block",
    ),
    allRows<{ id: string; title: string; brand: string | null; status: string | null; body: unknown; hero_image_url: string | null }>(
      "blog_posts",
      "id, title, brand, status, body, hero_image_url",
    ),
    allRows<{ id: string; name: string; status: string | null; blocks: unknown; raw_html: string | null }>(
      "email_templates",
      "id, name, status, blocks, raw_html",
    ),
  ]);

  for (const p of pages) {
    const live = mentions(p.published_blocks);
    const draft = mentions(p.draft_blocks);
    if (live || draft) usage.pages.push({ brand: p.brand, slug: p.slug, live, draft });
  }
  for (const w of widgets) {
    const live = mentions(w.published_block);
    const draft = mentions(w.draft_block);
    if (live || draft) usage.sections.push({ brand: w.brand ?? null, name: w.name, live, draft });
  }
  for (const b of posts) {
    if (b.status === "deleted") continue; // soft-deleted posts don't hold an image hostage
    if (mentions(b.body) || mentions(b.hero_image_url)) {
      usage.blogPosts.push({ id: b.id, title: b.title, brand: b.brand, live: b.status === "published" });
    }
  }
  for (const t of templates) {
    if (mentions(t.blocks) || mentions(t.raw_html)) usage.emails.push({ id: t.id, name: t.name, status: t.status });
  }

  usage.liveOnSite =
    usage.products.some((p) => p.live) ||
    usage.pages.some((p) => p.live) ||
    usage.sections.some((s) => s.live) ||
    usage.blogPosts.some((b) => b.live);
  usage.inUse =
    usage.products.length + usage.fragrances.length + usage.pages.length + usage.sections.length + usage.blogPosts.length + usage.emails.length > 0;
  return usage;
}
