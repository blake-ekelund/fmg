import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MEDIA_KIT_BASE = `${SUPABASE_URL}/storage/v1/object/public/media-kit/`;
const PHOTO_SHARE_BASE = `${SUPABASE_URL}/storage/v1/object/public/marketing-photo-share/`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NI_CONTEXT = `You are writing for Natural Inspirations (NI Spa), a spa-inspired personal care brand.

## BRAND ESSENCE
Fresh. Nourishing. Elevated.
Philosophy: "Indulge in the Good. Eliminate the Bad."

## TARGET AUDIENCE
Women ages 35-65 who love clean, fresh, spa-inspired fragrances.

## BRAND VOICE
- Calm confidence with sensory warmth
- Spa-inspired, ingredient-led, fragrance-forward
- Knowledgeable without being clinical
- Elevated but never pretentious

We sound like: Calm, warm, knowledgeable, refined, reassuring
We NEVER sound like: Trendy, loud, clinical, fear-based, gimmicky, salesy

## FORMATTING RULES
- NEVER use emojis anywhere in the content. They undermine the brand's elevated tone.
- Use typographic symbols for visual breaks: bullet points (•), em dashes (—), arrows (→), stars (★) for reviews.
- Let whitespace, strong headings, and elegant punctuation do the visual work.

## KEY BRAND ELEMENTS
- ExSeed Deep Moisturizing Complex: cold-pressed pomegranate, cranberry, black cumin, carrot, grape seed oils. 4x antioxidant levels.

## PRODUCTS
Hand + Body Lotion, Hand Crème, Body Butter, Hand + Face Wash, Fragrance Mist, Spa Pillows

## FRAGRANCES
Agave Pear, Coconut Ambre Vanille, Cyprès, Eucalyptus Rosemary Mint, Fragrance Free, Grapefruit Bergamot, Lavender Ylang, Orange Ginger, Sea Salt Citrus`;

const SASSY_CONTEXT = `You are writing for Sassy by Natural Inspirations, a fun, bold sub-brand.

## BRAND ESSENCE
Bold. Playful. Unapologetically You.
"Soft skin, big mood." "Queen energy, in a tube." "Baddies without the bad stuff."

## TARGET AUDIENCE
Women 18-35, trend-savvy, self-expression, confidence. The friend group that texts in caps lock and exfoliates while watching reality TV.

## BRAND VOICE
- Energetic, witty, empowering — playful, never too serious
- Punchy and scannable: short paragraphs, strong verbs, varied sentence rhythm. The energy comes from sharp word choice and confidence — NEVER from dropping capitalization or punctuation.
- PROPER grammar, spelling, and punctuation throughout. Capitalize the start of every sentence and all proper nouns. Write complete, well-formed sentences. Sassy in TONE, polished in MECHANICS — never lazy all-lowercase social-caption style.
- Substance under the sass: name real ingredients (botanical oils, shea, squalane, humectants) and what they actually do for skin — pull specifics from the product copy provided; never invent.

We sound like: Fun, energetic, witty, empowering, relatable, bold — and genuinely well-written
We NEVER sound like: Corporate, boring, preachy, clinical, salesy, sloppy, or AI-generated

## EDITORIAL FIRST, PRODUCTS SECOND
The reader came for the story, the tips, the vibe — NOT a sales pitch. Write like a magazine column or a friend who knows skincare, not a catalog.
- Don't force products in. Mention them only where they genuinely belong, woven in lightly — a natural aside, not a spotlight.
- Never list or "feature" products for the sake of it. A great post might name just one or two, in passing — or barely at all.
- Earn every mention. One soft CTA at the very end is plenty; the body should be worth reading even if you ignored the products entirely.

## FORMATTING RULES
- NEVER use emojis anywhere in the content. They feel juvenile and undermine brand confidence.
- Let the copy carry the energy — short punchy sentences, bold statements, and strong verbs.
- Use typographic symbols for visual breaks: bullet points (•), em dashes (—), arrows (→), stars (★) for reviews.
- No fake claims, no medical claims, no invented stats/reviews. Vegan, cruelty-free, no sulfates/parabens, small-batch, "clean-ish, mostly luxe" are all fair and true.

Sassy is SEPARATE from NI. It lives at sassyandco.com. Bold, fun, energetic only.`;

type BlogPost = { title: string; body: string; seo_meta: string; tags: string[]; hero_image_url?: string };
type ImageAsset = { display_name: string; fragrance: string | null; url: string; asset_type: string; tags: string[]; usage_count: number; id: string };
type LifestyleAsset = { title: string; description: string | null; url: string; tags: string[]; usage_count: number; id: string };
type ProductCopy = { part: string; name: string; displayName: string; fragrance: string | null; collection: string | null; subtitle: string | null; shortDescription: string | null; longDescription: string | null; benefits: string | null; infusedWith: string | null };

async function sbFetch(path: string) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
}

async function sbPatch(table: string, id: string, data: Record<string, unknown>) {
  return fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify(data),
  });
}

async function fetchPublishedTitles(brand: string) {
  const res = await sbFetch(`blog_posts?select=title,tags&or=(status.eq.published,status.eq.deleted)&brand=eq.${brand}&order=updated_at.desc&limit=50`);
  return res.ok ? await res.json() : [];
}

async function fetchDeleteFeedback(brand: string) {
  const res = await sbFetch(`content_feedback?select=reasons,comment,content_id&content_type=eq.blog&action=eq.delete&order=created_at.desc&limit=30`);
  if (!res.ok) return [];
  const feedback = await res.json();
  const ids = feedback.map((f: { content_id: string }) => f.content_id);
  if (!ids.length) return [];
  const postsRes = await sbFetch(`blog_posts?select=id,title,brand&id=in.(${ids.join(",")})`);
  const posts = postsRes.ok ? await postsRes.json() : [];
  const map = new Map(posts.map((p: { id: string; title: string; brand: string }) => [p.id, p]));
  return feedback.map((f: { reasons: string[]; comment: string | null; content_id: string }) => ({
    reasons: f.reasons, comment: f.comment,
    title: (map.get(f.content_id) as { title: string } | undefined)?.title,
    brand: (map.get(f.content_id) as { brand: string } | undefined)?.brand,
  })).filter((f: { brand?: string }) => f.brand === brand);
}

async function fetchAllProductAssets(brand: string): Promise<ImageAsset[]> {
  const b = brand === "Sassy" ? "Sassy" : "NI";
  const res = await sbFetch(`media_kit_assets?select=id,storage_path,asset_type,tags,usage_count,inventory_products!inner(display_name,fragrance,brand)&inventory_products.brand=eq.${b}&order=usage_count.asc&limit=120`);
  if (!res.ok) return [];
  return (await res.json())
    .filter((r: { inventory_products: { display_name: string } }) => {
      const name = (r.inventory_products?.display_name || "").toUpperCase();
      return !name.includes("TESTER") && !name.includes("MARKETING") && !name.includes("SAMPLE");
    })
    .map((r: { id: string; storage_path: string; asset_type: string; tags: string[]; usage_count: number; inventory_products: { display_name: string; fragrance: string | null } }) => ({
      id: r.id, display_name: r.inventory_products?.display_name || "",
      fragrance: r.inventory_products?.fragrance, url: `${MEDIA_KIT_BASE}${r.storage_path}`,
      asset_type: r.asset_type, tags: r.tags || [], usage_count: r.usage_count || 0,
    }));
}

async function fetchLifestyleAssets(): Promise<LifestyleAsset[]> {
  const res = await sbFetch(`photo_share_assets?select=id,title,description,file_path,tags,usage_count&is_active=eq.true&order=usage_count.asc&limit=20`);
  if (!res.ok) return [];
  return (await res.json()).map((r: { id: string; title: string; description: string | null; file_path: string; tags: string[]; usage_count: number }) => ({
    id: r.id, title: r.title, description: r.description,
    url: `${PHOTO_SHARE_BASE}${r.file_path}`, tags: r.tags || [], usage_count: r.usage_count || 0,
  }));
}

// Real on-site product copy (long descriptions, benefits) from the
// storefront_products view — the SAME source sassyandco.com renders from — so the
// agent writes accurate per-product detail instead of inventing it. Returns []
// for a brand whose products aren't in that view (e.g. NI on Shopify); the
// catalog block is then simply omitted from the prompt.
async function fetchProductCopy(brand: "NI" | "Sassy"): Promise<ProductCopy[]> {
  const cols = "part,display_name,fragrance,collection,subtitle,short_description,long_description,benefits,infused_with";
  const res = await sbFetch(`storefront_products?select=${cols}&brand=eq.${brand}&order=part`);
  if (!res.ok) return [];
  const rows = await res.json() as Array<{ part: string; display_name: string | null; fragrance: string | null; collection: string | null; subtitle: string | null; short_description: string | null; long_description: string | null; benefits: string | null; infused_with: string | null }>;
  return rows
    .filter((r) => !(r.display_name || "").toUpperCase().includes("TESTER"))
    .map((r) => {
      const dn = (r.display_name || r.part).trim();
      const idx = dn.search(/\s[–—-]\s/); // "Glow Up – Mini Hand Crème" → "Glow Up"
      return {
        part: r.part,
        name: idx > 0 ? dn.slice(0, idx).trim() : dn,
        displayName: dn,
        fragrance: r.fragrance,
        collection: r.collection,
        subtitle: r.subtitle,
        shortDescription: r.short_description,
        longDescription: r.long_description,
        benefits: r.benefits,
        infusedWith: r.infused_with,
      };
    });
}

// Image selection with product preference boost
function selectSmartImages(allProducts: ImageAsset[], lifestyle: LifestyleAsset[], title: string, description?: string, preferredProducts?: string[]) {
  const searchText = `${title} ${description || ""}`.toLowerCase();
  const usedUrls = new Set<string>();
  const preferredSet = new Set((preferredProducts || []).map(p => p.toLowerCase()));

  const scored = allProducts.map(img => {
    let score = 0;
    // HUGE boost for user-selected products
    if (preferredSet.size > 0 && preferredSet.has(img.display_name.toLowerCase())) score += 50;
    if (img.fragrance && searchText.includes(img.fragrance.toLowerCase())) score += 10;
    if (searchText.includes(img.display_name.toLowerCase())) score += 8;
    for (const tag of img.tags) { if (searchText.includes(tag.toLowerCase())) score += 3; }
    score -= (img.usage_count || 0) * 0.5;
    if (img.asset_type === "lifestyle") score += 4;
    if (img.asset_type === "ingredients") score += 3;
    if (img.asset_type === "fragrance") score += 2;
    return { ...img, score };
  }).sort((a, b) => b.score - a.score);

  const scoredLifestyle = lifestyle.map(img => {
    let score = 0;
    if (img.title && searchText.includes(img.title.toLowerCase())) score += 5;
    if (img.description && searchText.includes(img.description.toLowerCase())) score += 3;
    score -= (img.usage_count || 0) * 0.5;
    return { ...img, score };
  }).sort((a, b) => b.score - a.score);

  const heroLifestyle = scoredLifestyle[0] || null;
  if (heroLifestyle) usedUrls.add(heroLifestyle.url);
  const heroProduct = scored.find(i => i.asset_type === "front" && !usedUrls.has(i.url)) || null;
  if (heroProduct) usedUrls.add(heroProduct.url);

  const usedProducts = new Set<string>();
  const inlineImages: ImageAsset[] = [];
  for (const img of scored) {
    if (inlineImages.length >= 3) break;
    if (usedUrls.has(img.url)) continue;
    if (usedProducts.has(img.display_name) && inlineImages.length >= 2) continue;
    inlineImages.push(img);
    usedUrls.add(img.url);
    usedProducts.add(img.display_name);
  }

  const pullQuoteBg = scoredLifestyle.find(img => !usedUrls.has(img.url)) || null;
  if (pullQuoteBg) usedUrls.add(pullQuoteBg.url);
  const ctaImage = scored.find(i => i.asset_type === "front" && !usedUrls.has(i.url)) || scored.find(i => !usedUrls.has(i.url)) || null;
  if (ctaImage) usedUrls.add(ctaImage.url);

  return { heroLifestyle, heroProduct, inlineImages, pullQuoteBg, ctaImage };
}

async function trackImageUsage(imageIds: string[], table: "media_kit_assets" | "photo_share_assets") {
  for (const id of imageIds) {
    await sbPatch(table, id, { last_used_at: new Date().toISOString(), usage_count: 1 });
  }
}

// ── NI (naturalinspirations.com / Shopify) — rich, CSS-class layout ────────
const NI_IMAGE_GUIDE = `
## IMAGE LAYOUT RULES (CRITICAL)

Images flow NATURALLY with text. Text WRAPS AROUND images. NEVER full-width except hero.

### 1. HERO — full width, placed FIRST:
<div class="blog-hero"><img src="HERO_URL" alt="desc" /></div>

### 2. INLINE — plain <img> INSIDE a <p> tag (CSS auto-floats):
<p><img src="INLINE_URL" alt="Product Name" />Paragraph text wraps around the image naturally.</p>
Do 2 times, spaced 3-4 paragraphs apart.

### 3. PULL QUOTE — one impactful sentence:
<div class="blog-pull-quote" style="background-image:url('PULLQUOTE_URL')"><blockquote>Quote.</blockquote></div>

### 4. END CTA:
<div class="blog-end-cta"><img src="CTA_URL" alt="Product" /><div><p class="cta-text">Ready to experience [product]?</p><p class="cta-link">Shop at naturalinspirations.com</p></div></div>

RULES: 4 images total. EVERY URL unique. No inline styles. No wrapper divs on inline. Space 3+ paragraphs apart.
`;

// ── Sassy (sassyandco.com) — plain semantic HTML the storefront actually styles ──
// The storefront renders the body string with dangerouslySetInnerHTML and a
// sanitizer that strips scripts/iframes/handlers. It styles ONLY bare tags —
// no .blog-hero / .blog-pull-quote / .blog-end-cta CSS exists there. The hero
// image is a SEPARATE field shown above the article, so it must NOT also live
// in the body, or it renders twice.
const SASSY_IMAGE_GUIDE = `
## SASSY BLOG HTML (renders on sassyandco.com — plain HTML, NO css classes)

The body is plain semantic HTML, injected as-is. title, hero image, tags, and
seo_meta are SEPARATE fields — NEVER put them in the body. NEVER emit <h1>
(the title IS the h1; start sections at <h2>).

Use ONLY these tags (everything else is unstyled or stripped by the sanitizer):
<h2> <h3> <p> <ul>/<ol>/<li> <a> <strong> <em> <blockquote>
BANNED: <img>, real image URLs, <div>, class="…", style="…", <script>,
<iframe>, <table>. No wrapper divs, no CSS classes, no inline styles.

### Images = PLACEHOLDERS ONLY (a human adds the real images during review)
Do NOT embed images or URLs. Mark each image spot with a placeholder paragraph:
<p>[ IMAGE: a short art-direction note — e.g. "sunlit hands, soft focus" or "Glow Up crème on a marble vanity" ]</p>
- Place 3-4 of these through the post: one right after the opening hook, the
  rest spaced every 3-4 paragraphs.
- Mix lifestyle / mood shots with the occasional product shot — don't make every image a product.
- hero_image_url MUST be an empty string "" — the reviewer sets the hero in FMG.

### Pull quote
A single <blockquote>one punchy line</blockquote>. No background image, no wrapper.

### End CTA
Finish with a <p> linking to a Sassy collection or the shop. Valid internal
paths only: /shop, /collections/everyday, /collections/love,
/collections/holiday, /gifts. Example:
<p>Ready to commit? <a href="/collections/everyday">Meet the everyday edit →</a></p>
Sassy lives at sassyandco.com — NEVER link to or mention naturalinspirations.com.
`;

function imageLayoutGuide(brand: "NI" | "Sassy"): string {
  return brand === "Sassy" ? SASSY_IMAGE_GUIDE : NI_IMAGE_GUIDE;
}

const SEO_AIO_GUIDE = `
## SEO + GOOGLE AI OVERVIEW
1. Start sections with direct 2-3 sentence answers (featured snippet targets)
2. H2 headings as questions when natural
3. Include numbered/bullet lists
4. End with FAQ: <h2>Frequently Asked Questions</h2> then 3-4 <h3> questions with concise answers
5. Primary keyword in first 100 words. Semantic variations throughout.
6. seo_meta: 120-155 chars with primary keyword
`;

function buildContext(brand: "NI" | "Sassy", published: { title: string; tags: string[] | null }[], feedback: { reasons: string[]; comment: string | null; title?: string }[], images: ReturnType<typeof selectSmartImages>, preferredProducts?: string[], productCopy: ProductCopy[] = [], collection?: string): string {
  let ctx = "";
  if (published.length) {
    ctx += `\n\n## PREVIOUSLY WRITTEN (DO NOT REPEAT)\n`;
    for (const p of published.slice(0, 30)) ctx += `- "${p.title}"\n`;
  }
  if (feedback.length) {
    ctx += `\n\n## REVIEWER FEEDBACK (AVOID)\n`;
    for (const f of feedback.slice(0, 15)) ctx += `- "${f.title || "?"}":${f.reasons.length ? " " + f.reasons.join(", ") : ""}${f.comment ? ` — "${f.comment}"` : ""}\n`;
  }
  if (preferredProducts?.length) {
    ctx += `\n\n## PRODUCTS TO WORK IN (naturally — do not force)\n`;
    for (const p of preferredProducts) ctx += `- ${p}\n`;
    ctx += `Mention these only where they genuinely fit the story, woven in lightly. Don't list them mechanically or hard-sell.\n`;
  }
  if (productCopy.length) {
    const strip = (s: string | null, n: number) => (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
    ctx += `\n\n## PRODUCT REFERENCE — real on-site copy${collection ? ` (${collection})` : ""}\n`;
    ctx += `For ACCURACY, not a checklist. ONLY when you naturally mention a product, pull its real details below (never invent ingredients, scents, or benefits). Do NOT try to include every product — most posts mention just one or two, in passing.\n`;
    for (const p of productCopy.slice(0, 8)) {
      const desc = strip(p.longDescription, 420) || strip(p.shortDescription, 280) || strip(p.subtitle, 160);
      ctx += `\n• ${p.name}${p.fragrance ? ` — ${p.fragrance}` : ""}${p.collection ? ` [${p.collection}]` : ""}\n`;
      if (desc) ctx += `  ${desc}\n`;
      const ben = strip(p.benefits, 220);
      if (ben) ctx += `  benefits: ${ben}\n`;
      const inf = strip(p.infusedWith, 120);
      if (inf) ctx += `  infused with: ${inf}\n`;
    }
  }
  ctx += imageLayoutGuide(brand);
  ctx += SEO_AIO_GUIDE;
  // Sassy uses image PLACEHOLDERS (see SASSY_IMAGE_GUIDE), so it gets no real
  // image URLs. NI keeps the real-URL floated layout.
  if (brand !== "Sassy") {
    ctx += `\n\n## IMAGES (each URL is UNIQUE — use each ONLY ONCE)\n`;
    if (images.heroLifestyle) ctx += `\nHERO_URL: ${images.heroLifestyle.url} ("${images.heroLifestyle.title}")\n`;
    else if (images.heroProduct) ctx += `\nHERO_URL: ${images.heroProduct.url} (${images.heroProduct.display_name})\n`;
    images.inlineImages.forEach((img, i) => {
      ctx += `INLINE_URL_${i + 1}: ${img.url} (${img.display_name}${img.fragrance ? " - " + img.fragrance : ""})\n`;
    });
    if (images.pullQuoteBg) ctx += `PULLQUOTE_URL: ${images.pullQuoteBg.url}\n`;
    if (images.ctaImage) ctx += `CTA_URL: ${images.ctaImage.url} (${images.ctaImage.display_name})\n`;
  }
  return ctx;
}

function deduplicateImages(html: string): string {
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
  const seen = new Set<string>();
  return html.replace(imgRegex, (match, url) => {
    if (seen.has(url)) return "";
    seen.add(url);
    return match;
  });
}

async function callClaude(prompt: string): Promise<BlogPost> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-opus-4-8", max_tokens: 16000, stream: true, thinking: { type: "adaptive" }, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic: ${res.status} ${await res.text()}`);
  if (!res.body) throw new Error("Anthropic: no response body");

  // Stream the SSE response and accumulate text deltas. Streaming keeps the
  // connection alive token-by-token so a long generation can't hit the edge
  // function's wall-clock limit the way a single non-streaming hold would.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep the trailing partial line for the next chunk
    for (const line of lines) {
      if (!line.startsWith("data:")) continue; // skip `event:` lines and blanks
      const payload = line.slice(5).trim();
      if (!payload) continue;
      const evt = JSON.parse(payload);
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
        text += evt.delta.text;
      } else if (evt.type === "error") {
        throw new Error(`Anthropic stream: ${evt.error?.message ?? "unknown"}`);
      }
    }
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON");
  return JSON.parse(match[0]);
}

async function savePost(post: BlogPost, brand: string, rowId?: string) {
  // Enforce max 5 tags
  const tags = (post.tags || []).slice(0, 5);
  const payload = {
    title: post.title, body: post.body, seo_meta: post.seo_meta,
    tags, hero_image_url: post.hero_image_url || "",
    brand, status: "ai_draft", updated_at: new Date().toISOString(),
  };
  const url = rowId ? `${SUPABASE_URL}/rest/v1/blog_posts?id=eq.${rowId}` : `${SUPABASE_URL}/rest/v1/blog_posts`;
  const method = rowId ? "PATCH" : "POST";
  const res = await fetch(url, {
    method, headers: { "Content-Type": "application/json", apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Save error: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function generatePost(brand: "NI" | "Sassy", userTitle?: string, userDesc?: string, rowId?: string, preferredProducts?: string[], collection?: string) {
  const brandCtx = brand === "NI" ? NI_CONTEXT : SASSY_CONTEXT;
  const brandName = brand === "NI" ? "Natural Inspirations" : "Sassy by Natural Inspirations";
  const [published, feedback, allProducts, lifestyle, productCopyAll] = await Promise.all([
    fetchPublishedTitles(brand), fetchDeleteFeedback(brand), fetchAllProductAssets(brand), fetchLifestyleAssets(), fetchProductCopy(brand),
  ]);
  // Scope the catalog to the requested collection (loose, case-insensitive so
  // "everyday" matches "Everyday"); fall back to the full catalog when nothing
  // matches (collection name/casing differs from the view's value).
  const scoped = collection
    ? productCopyAll.filter((p) => (p.collection || "").toLowerCase().includes(collection.toLowerCase()))
    : productCopyAll;
  const catalog = scoped.length ? scoped : productCopyAll;
  const activeCollection = collection && scoped.length ? collection : undefined;
  // With a collection in scope and no explicit picks, steer image selection
  // toward that collection's products (reuses selectSmartImages' +50 boost).
  const effectivePreferred = preferredProducts?.length
    ? preferredProducts
    : (activeCollection ? catalog.map((p) => p.displayName) : undefined);
  const images = selectSmartImages(allProducts, lifestyle, userTitle || brandName, userDesc, effectivePreferred);
  const ctx = buildContext(brand, published, feedback, images, preferredProducts, catalog, activeCollection);
  const topic = userTitle && userDesc
    ? `TOPIC (follow precisely):\nTitle: ${userTitle}\nDirection: ${userDesc}\n\nIMPORTANT: Use the title exactly as given. Follow direction closely. Write in the ${brandName} brand voice.`
    : `Choose a compelling topic for ${brandName}. Pick a topic NOT in the previously written list.`;
  // Length + inline-image rule differ by brand: NI runs long with floated
  // images; Sassy is punchier with standalone images.
  const lengthRule = brand === "Sassy"
    ? "(a full 8-minute read, 1,700-2,000 words — go deep with real detail, no filler or padding)"
    : "(6-8 min read, 1,200-1,800 words)";
  const inlineRule = brand === "Sassy"
    ? "- Mark image spots with <p>[ IMAGE: art-direction note ]</p> placeholders (see image rules) — NO real <img> tags or URLs"
    : "- Inline images INSIDE <p> tags";
  const heroRule = brand === "Sassy"
    ? '- hero_image_url = "" (empty string — the reviewer adds the hero image in FMG)'
    : "- hero_image_url = URL used in blog-hero";
  const collectionRule = activeCollection
    ? `\n- This post touches on the ${activeCollection} collection — cover it as a natural, editorial roundup (scent vibes, when you'd reach for each), NOT a product-by-product sales list; mention only the ones that earn their place`
    : "";
  const prompt = `${brandCtx}${ctx}\n\n---\n\nWrite a blog post for ${brandName} ${lengthRule}.\n\n${topic}\n\nRequirements:\n- HTML using the layout rules above\n- TRUE to ${brandName} brand voice${collectionRule}\n- Craft: open with a strong hook, vary sentence rhythm, choose concrete specifics over filler, and cut clichés / AI-slop phrasing ("in today's world", "elevate your routine", "look no further", "say goodbye to", "nestled")\n- Proper grammar, spelling, and punctuation throughout — sassy in tone, clean in mechanics\n- Natural and editorial — NOT salesy: lead with value/story, weave products in lightly and only where earned; no product parade, no hard sell\n${inlineRule}\n- Include FAQ section (3-4 questions)\n- Generate exactly 5 tags\n${heroRule}\n- ABSOLUTELY NO EMOJIS anywhere in the output — use typographic symbols (•, —, →, ★) instead\n\nReturn ONLY valid JSON:\n{"title":"...","body":"...","seo_meta":"120-155 chars","tags":["tag1","tag2","tag3","tag4","tag5"],"hero_image_url":"URL"}`;
  const post = await callClaude(prompt);
  post.body = deduplicateImages(post.body);
  post.tags = (post.tags || []).slice(0, 5); // Enforce 5 tag limit
  const saved = await savePost(post, brand, rowId);
  const usedProductIds = allProducts.filter(img => post.body.includes(img.url)).map(img => img.id);
  const usedLifestyleIds = lifestyle.filter(img => post.body.includes(img.url) || post.hero_image_url === img.url).map(img => img.id);
  if (usedProductIds.length) await trackImageUsage(usedProductIds, "media_kit_assets");
  if (usedLifestyleIds.length) await trackImageUsage(usedLifestyleIds, "photo_share_assets");
  return { post, saved };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  try {
    let body: { mode?: string; brand?: string; title?: string; description?: string; row_id?: string; products?: string[]; collection?: string } = {};
    try { body = await req.json(); } catch { /* daily batch */ }
    if (body.mode === "single" && body.brand && body.title && body.description) {
      const brand = body.brand as "NI" | "Sassy";
      const { post, saved } = await generatePost(brand, body.title, body.description, body.row_id, body.products, body.collection);
      return new Response(JSON.stringify({ success: true, post: { ...post, brand, id: saved?.[0]?.id || body.row_id } }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
    // Daily batch: 2 NI + 2 Sassy in parallel pairs
    const results: { brand: string; title: string; success: boolean; error?: string }[] = [];
    for (const pair of [["NI", "Sassy"], ["NI", "Sassy"]] as const) {
      const settled = await Promise.allSettled(pair.map(b => generatePost(b as "NI" | "Sassy")));
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        if (s.status === "fulfilled") results.push({ brand: pair[i], title: s.value.post.title, success: true });
        else results.push({ brand: pair[i], title: "", success: false, error: String(s.reason) });
      }
    }
    return new Response(JSON.stringify({ results, generated_at: new Date().toISOString() }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
});
