import { describe, it, expect } from "vitest";
import { DEFAULT_SASSY_HOME, normalizePageBlocks, safeHref, safeImage } from "../site/pageBlocks";

describe("normalizePageBlocks", () => {
  it("keeps the default homepage unchanged", () => {
    expect(normalizePageBlocks(DEFAULT_SASSY_HOME)).toEqual(
      JSON.parse(JSON.stringify(DEFAULT_SASSY_HOME)),
    );
  });

  it("returns null for non-arrays so callers fall back", () => {
    expect(normalizePageBlocks(null)).toBeNull();
    expect(normalizePageBlocks({})).toBeNull();
  });

  it("forces exactly one hero, first", () => {
    const out = normalizePageBlocks([
      { id: "n", type: "newsletter", heading: "hi" },
      { id: "h", type: "hero", slides: [{ name: "A", desktopImage: "/a.jpg" }] },
      { id: "h2", type: "hero", slides: [{ name: "B" }] },
    ])!;
    expect(out.map((b) => b.type)).toEqual(["hero", "newsletter"]);
    expect(out[0].id).toBe("h");
  });

  it("adds the default hero when missing and drops unknown/duplicate single blocks", () => {
    const out = normalizePageBlocks([
      { type: "mystery" },
      { id: "a", type: "newsletter" },
      { id: "b", type: "newsletter" },
    ])!;
    expect(out.map((b) => b.type)).toEqual(["hero", "newsletter"]);
  });

  it("allow-lists links and images", () => {
    expect(safeHref("/shop")).toBe("/shop");
    expect(safeHref("https://x.com")).toBe("https://x.com");
    expect(safeHref("javascript:alert(1)")).toBe("");
    expect(safeHref("//evil.com")).toBe("");
    expect(safeImage("http://x.com/a.jpg")).toBe("");
    const [, banner] = normalizePageBlocks([
      { type: "hero", slides: [] },
      { id: "p", type: "promo_banner", text: "x", ctaHref: "javascript:1", tone: "neon" },
    ])!;
    expect(banner).toMatchObject({ ctaHref: "", tone: "pink" });
  });

  it("clamps product row counts", () => {
    const [, row] = normalizePageBlocks([
      { type: "hero", slides: [] },
      { id: "r", type: "product_row", count: 99, parts: ["a", "a", "b"] },
    ])!;
    expect(row).toMatchObject({ count: 8, parts: ["a", "b"], source: "bestsellers" });
  });
});
