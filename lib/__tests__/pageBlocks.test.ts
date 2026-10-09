import { describe, it, expect } from "vitest";
import { safeHref, safeImage, sanitizeRichHtml, type PageBlock } from "../site/pageBlocks";
import { SITE_PAGES, defaultBlocks, normalizePage } from "../site/pageDefaults";

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
