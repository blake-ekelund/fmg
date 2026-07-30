import { describe, it, expect } from "vitest";
import { normalizeBlocks } from "../normalizeBlocks";
import type { SectionBlock, ImageBlock, TextBlock } from "@/components/templates/types";

describe("normalizeBlocks", () => {
  it("returns [] for non-array input", () => {
    expect(normalizeBlocks(null)).toEqual([]);
    expect(normalizeBlocks({})).toEqual([]);
    expect(normalizeBlocks("nope")).toEqual([]);
  });

  it("drops blocks of unknown type", () => {
    const out = normalizeBlocks([{ type: "carousel" }, { type: "text", html: "<p>Hi</p>" }, { nope: true }]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("text");
  });

  it("fills missing fields from defaults and keeps provided ones", () => {
    const [b] = normalizeBlocks([{ type: "text", html: "<p>Custom</p>" }]) as [TextBlock];
    expect(b.html).toBe("<p>Custom</p>");
    // Defaults present even though not supplied.
    expect(typeof b.fontSize).toBe("number");
    expect(typeof b.textColor).toBe("string");
    expect(b.padding).toBeTypeOf("number");
    expect(b.id).toBeTruthy();
  });

  it("drops unknown fields the model hallucinates", () => {
    const [b] = normalizeBlocks([{ type: "button", text: "Go", url: "https://x.com", shadow: "huge", zIndex: 9 }]);
    expect(b).not.toHaveProperty("shadow");
    expect(b).not.toHaveProperty("zIndex");
    expect((b as { text: string }).text).toBe("Go");
  });

  it("coerces wrong primitive types (numeric string → number)", () => {
    const [b] = normalizeBlocks([{ type: "text", padding: "40", fontSize: "18" }]) as [TextBlock];
    expect(b.padding).toBe(40);
    expect(b.fontSize).toBe(18);
  });

  it("clamps image width number and falls back to a preset otherwise", () => {
    const [wide] = normalizeBlocks([{ type: "image", width: 250 }]) as [ImageBlock];
    expect(wide.width).toBe(100);
    const [preset] = normalizeBlocks([{ type: "image", width: "half" }]) as [ImageBlock];
    expect(preset.width).toBe("half");
    const [bad] = normalizeBlocks([{ type: "image", width: "enormous" }]) as [ImageBlock];
    expect(bad.width).toBe("full");
  });

  it("keeps numeric marginTop/marginBottom (incl. negative) and ignores junk", () => {
    const [b] = normalizeBlocks([{ type: "text", marginTop: -30, marginBottom: "12", padding: 0 }]) as [TextBlock];
    expect(b.marginTop).toBe(-30);
    expect(b.marginBottom).toBe(12);
    const [c] = normalizeBlocks([{ type: "text", marginTop: "lots" }]) as [TextBlock];
    expect(c.marginTop).toBeUndefined();
  });

  it("normalizes a section and its nested column blocks", () => {
    const [s] = normalizeBlocks([
      {
        type: "section",
        bgColor: "#1a5632",
        padding: "30",
        columns: [
          { weight: 2, blocks: [{ type: "text", html: "<p>Left</p>" }] },
          { blocks: [{ type: "button", text: "Buy" }] },
        ],
      },
    ]) as [SectionBlock];
    expect(s.type).toBe("section");
    expect(s.bgColor).toBe("#1a5632");
    expect(s.padding).toBe(30);
    expect(s.columns).toHaveLength(2);
    expect(s.columns[0].weight).toBe(2);
    expect(s.columns[0].blocks[0].type).toBe("text");
    expect(s.columns[1].blocks[0].type).toBe("button");
  });

  it("never nests a section inside a column", () => {
    const [s] = normalizeBlocks([
      { type: "section", columns: [{ blocks: [{ type: "section", columns: [] }, { type: "text" }] }] },
    ]) as [SectionBlock];
    expect(s.columns[0].blocks.every((b) => b.type !== "section")).toBe(true);
    expect(s.columns[0].blocks).toHaveLength(1);
  });

  it("gives a section at least one column even if none supplied", () => {
    const [s] = normalizeBlocks([{ type: "section", columns: [] }]) as [SectionBlock];
    expect(s.columns.length).toBeGreaterThanOrEqual(1);
  });

  it("regenerates duplicate ids so every block id is unique", () => {
    const out = normalizeBlocks([
      { id: "same", type: "text" },
      { id: "same", type: "button" },
      { id: "same", type: "divider" },
    ]);
    const ids = new Set(out.map((b) => b.id));
    expect(ids.size).toBe(3);
  });

  it("normalizes a full generated email without throwing", () => {
    const out = normalizeBlocks([
      { id: "h", type: "header", companyName: "Natural Inspirations" },
      { id: "c", type: "caption", heading: "Eucalyptus Rosemary Mint", layout: "overlay", scrim: 40 },
      { type: "section", columns: [
        { blocks: [{ type: "product", name: "Body Wash", price: "$18" }] },
        { blocks: [{ type: "product", name: "Lotion", price: "$16" }] },
      ] },
      { type: "promotion", promoCode: "SPRING15", discountLabel: "15% OFF" },
      { type: "social", instagram: "https://instagram.com/ni" },
    ]);
    expect(out).toHaveLength(5);
    expect(out.map((b) => b.type)).toEqual(["header", "caption", "section", "promotion", "social"]);
  });
});
