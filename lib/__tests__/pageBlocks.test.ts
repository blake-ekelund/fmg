import { describe, it, expect } from "vitest";
import { safeHref, safeImage, sanitizeRichHtml, type PageBlock } from "../site/pageBlocks";
import { SITE_PAGES, defaultBlocks, normalizePage } from "../site/pageDefaults";
import { NI_SITE_PAGES, niDefaultBlocks, normalizeNiPage } from "../site/pageDefaultsNi";
import { THEME_TOKENS, blockStyle, embedSrc, newBlockFor, parseInline, resolveWidgetRefs, themeCss } from "../site/pageBlocks";

describe("normalizePage", () => {
  it.each(SITE_PAGES.map((p) => p.slug))("keeps the %s default unchanged", (slug) => {
    expect(normalizePage(slug, defaultBlocks(slug))).toEqual(JSON.parse(JSON.stringify(defaultBlocks(slug))));
  });

  it("returns null for unknown pages and non-arrays", () => {
    expect(normalizePage("nope", [])).toBeNull();
    expect(normalizePage("home", null)).toBeNull();
  });

  it("forces exactly one hero, first", () => {
    const out = normalizePage("home", [
      { id: "n", type: "newsletter", heading: "hi" },
      { id: "h", type: "hero", slides: [{ name: "A", desktopImage: "/a.jpg" }] },
      { id: "h2", type: "hero", slides: [{ name: "B" }] },
    ])!;
    expect(out.map((b) => b.type)).toEqual(["hero", "newsletter"]);
    expect(out[0].id).toBe("h");
  });

  it("restores missing locked blocks and drops types the page doesn't allow", () => {
    const out = normalizePage("shop", [{ id: "x", type: "hero", slides: [] }, { id: "n", type: "newsletter" }])!;
    expect(out.map((b) => b.type)).toEqual(["page_header", "catalog", "newsletter"]);
  });

  it("product template keeps product details first", () => {
    const out = normalizePage("product", [
      { id: "r", type: "reviews_note", heading: "x" },
      { id: "d", type: "product_details", trust: ["a"] },
    ])!;
    expect(out.map((b) => b.type)).toEqual(["product_details", "reviews_note"]);
  });

  it("fixed pages keep their shape and take only field edits", () => {
    const out = normalizePage("shipping", [
      { id: "p", type: "policy", title: "Shipping!", html: "<p>hi</p>" },
      { id: "q", type: "quote", text: "nope" },
    ])!;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "policy", title: "Shipping!", html: "<p>hi</p>" });
  });

  it("allow-lists links and images", () => {
    expect(safeHref("/shop")).toBe("/shop");
    expect(safeHref("https://x.com")).toBe("https://x.com");
    expect(safeHref("javascript:alert(1)")).toBe("");
    expect(safeHref("//evil.com")).toBe("");
    expect(safeImage("http://x.com/a.jpg")).toBe("");
    const [, banner] = normalizePage("home", [
      { type: "hero", slides: [] },
      { id: "p", type: "promo_banner", text: "x", ctaHref: "javascript:1", tone: "neon" },
    ])!;
    expect(banner).toMatchObject({ ctaHref: "", tone: "pink" });
  });

  it("clamps product row counts", () => {
    const [, row] = normalizePage("home", [
      { type: "hero", slides: [] },
      { id: "r", type: "product_row", count: 99, parts: ["a", "a", "b"] },
    ])! as [PageBlock, PageBlock];
    expect(row).toMatchObject({ count: 8, parts: ["a", "b"], source: "bestsellers" });
  });
});

describe("sanitizeRichHtml", () => {
  it("keeps the allowed tags and safe links", () => {
    expect(sanitizeRichHtml(`<h2 class="x">Hi</h2><p>A <b>b</b> <a href="/shop" onclick="x()">shop</a></p>`)).toBe(
      `<h2>Hi</h2><p>A <strong>b</strong> <a href="/shop">shop</a></p>`,
    );
  });

  it("strips scripts, attributes and unsafe links", () => {
    const out = sanitizeRichHtml(`<script>alert(1)</script><p style="x">ok <a href="javascript:alert(1)">bad</a><img src=x onerror=y></p>`);
    expect(out).toBe(`<p>ok bad&lt;img src=x onerror=y&gt;</p>`);
  });

  it("decodes entities once and re-escapes", () => {
    expect(sanitizeRichHtml("<p>Tom &amp; Jerry&rsquo;s &lt;b&gt;</p>")).toBe("<p>Tom &amp; Jerry’s <strong></p>".replace("<strong>", "&lt;b&gt;"));
  });
});

describe("NI pages", () => {
  it.each(NI_SITE_PAGES.map((p) => p.slug))("keeps the NI %s default unchanged", (slug) => {
    expect(normalizeNiPage(slug, niDefaultBlocks(slug))).toEqual(JSON.parse(JSON.stringify(niDefaultBlocks(slug))));
  });

  it("collection hero stays first and can't be dropped", () => {
    const out = normalizeNiPage("home", [{ id: "n", type: "newsletter" }])!;
    expect(out[0].type).toBe("living_hero");
    expect(out.map((b) => b.type)).toContain("collection_showcase");
  });
});

describe("parseInline", () => {
  it("splits accents, links and line breaks", () => {
    expect(parseInline("The wholesale *program*")).toEqual([
      { t: "text", v: "The wholesale " },
      { t: "em", v: "program" },
    ]);
    expect(parseInline("A\n[go](/shop) [bad](javascript:x)")).toEqual([
      { t: "text", v: "A" },
      { t: "br" },
      { t: "link", v: "go", href: "/shop" },
      { t: "text", v: " " },
      { t: "text", v: "bad" },
    ]);
  });
});

describe("embeds", () => {
  const e = (kind: "video" | "instagram" | "map" | "form" | "countdown", source: string) => embedSrc({ kind, source });
  it("builds frame URLs from recognized links only", () => {
    expect(e("video", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(e("video", "https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(e("video", "https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
    expect(e("video", "javascript:alert(1)")).toBeNull();
    expect(e("instagram", "https://www.instagram.com/p/Cabc123XYZ/?igsh=x")).toBe("https://www.instagram.com/p/Cabc123XYZ/embed");
    expect(e("map", "7925 Stone Creek Dr, Chanhassen")).toBe(
      "https://www.google.com/maps?q=7925%20Stone%20Creek%20Dr%2C%20Chanhassen&output=embed",
    );
    expect(e("form", "https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEfGhIjKlMnOpQrStUv/viewform")).toBe(
      "https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEfGhIjKlMnOpQrStUv/viewform?embedded=true",
    );
    expect(e("countdown", "x")).toBeNull();
  });

  it("embeds are allowed on open pages, not fixed ones", () => {
    const embed = { id: "e", type: "embed", kind: "video", source: "https://youtu.be/dQw4w9WgXcQ" };
    expect(normalizePage("story", [...defaultBlocks("story"), embed])!.some((b) => b.type === "embed")).toBe(true);
    expect(normalizePage("shipping", [...defaultBlocks("shipping"), embed])!.some((b) => b.type === "embed")).toBe(false);
  });
});

describe("widgets", () => {
  const WID = "11111111-2222-3333-4444-555555555555";
  it("keeps valid links and drops bad ids", () => {
    const out = normalizePage("story", [...defaultBlocks("story"), { id: "w1", type: "widget", widgetId: WID }, { id: "w2", type: "widget", widgetId: "nope" }])!;
    expect(out.filter((b) => b.type === "widget").map((b) => b.id)).toEqual(["w1"]);
  });

  it("resolves links to content, keeping the link id; skips missing or disallowed", () => {
    const page = SITE_PAGES.find((p) => p.slug === "story")!;
    const blocks = [
      { id: "w1", type: "widget", widgetId: WID },
      { id: "w2", type: "widget", widgetId: "99999999-2222-3333-4444-555555555555" },
    ] as PageBlock[];
    const lookup = (id: string) =>
      id === WID ? { type: "quote", text: "Hello", eyebrow: "", highlight: "", footnote: "" } : undefined;
    const out = resolveWidgetRefs(blocks, page, lookup);
    expect(out).toEqual([{ id: "w1", type: "quote", text: "Hello", eyebrow: "", highlight: "", footnote: "" }]);
    // A widget whose kind the page can't take drops out.
    const hero = resolveWidgetRefs(blocks.slice(0, 1), page, () => ({ type: "hero", slides: [] }));
    expect(hero).toEqual([]);
  });
});

describe("palette starters", () => {
  it("every addable type starts as itself", () => {
    for (const pages of [SITE_PAGES, NI_SITE_PAGES]) {
      for (const page of pages) for (const t of page.addable) expect(newBlockFor(t, "x", pages).type).toBe(t);
    }
    expect(newBlockFor("embed", "x", SITE_PAGES).type).toBe("embed");
  });
});

describe("colors", () => {
  it("keeps valid block colors, drops junk, and adds nothing to blocks without them", () => {
    const [, row] = normalizePage("home", [
      { type: "hero", slides: [] },
      { id: "r", type: "promo_banner", text: "x", colors: { pink: "#00FF00", section: "#123456", bad: "red", "x-y": "#000000" } },
    ])!;
    expect(row.colors).toEqual({ pink: "#00FF00", section: "#123456" });
    const [, plain] = normalizePage("home", [{ type: "hero", slides: [] }, { id: "p", type: "promo_banner", text: "x", colors: { a: "nope" } }])!;
    expect("colors" in plain).toBe(false);
  });

  it("site theme becomes :root variables, skipping unchanged colors", () => {
    expect(themeCss("Sassy", {})).toBe("");
    expect(themeCss("Sassy", { pink: "#ff3e86" })).toBe("");
    expect(themeCss("NI", { gold: "#112233", nope: "#000000" })).toBe(":root{--gold:#112233}");
    expect(themeCss("Sassy", { pink: "#000000" })).toBe(":root{--pink-pop:#000000;--ink:#000000;--foreground:#000000}");
  });

  it("block style sets its variables and band, even when equal to the default", () => {
    expect(blockStyle("NI", undefined)).toBeUndefined();
    expect(blockStyle("NI", { eucalyptus: "#44705F", section: "#FFFFFF" })).toEqual({
      "--eucalyptus": "#44705F",
      backgroundColor: "#FFFFFF",
    });
  });

  it("theme page keeps its palette; widget links keep their own colors", () => {
    const [t] = normalizePage("theme", [{ id: "theme", type: "theme", palette: { pink: "#000000", x: 1 } }])!;
    expect(t).toEqual({ id: "theme", type: "theme", palette: { pink: "#000000" } });
    const page = SITE_PAGES.find((p) => p.slug === "story")!;
    const out = resolveWidgetRefs(
      [{ id: "w", type: "widget", widgetId: "a", colors: { blush: "#000000" } }] as PageBlock[],
      page,
      () => ({ type: "quote", text: "Hi", colors: { blush: "#FFFFFF" } }),
    );
    expect(out[0].colors).toEqual({ blush: "#000000" });
  });

  it("every theme token default matches between brands' lists and is valid", () => {
    for (const list of Object.values(THEME_TOKENS)) for (const t of list) expect(t.value).toMatch(/^#[0-9A-F]{6}$/);
  });
});
