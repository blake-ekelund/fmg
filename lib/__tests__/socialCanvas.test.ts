import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: {} }));

import {
  blankCanvas,
  fillTokens,
  fontsUsed,
  newShapeLayer,
  newTextLayer,
  normalizeCanvasSlide,
} from "@/lib/social/canvas";
import { fontByFamilyName, fontsForBrand, resolveVariant } from "@/lib/social/fonts";
import { isCanvas, normalizeDesign, slideHash, slideProblems } from "@/lib/social/design";
import { renderSlideJpeg } from "@/lib/social/renderSlides";

describe("normalizeCanvasSlide", () => {
  it("clamps numbers, whitelists fonts/colours/urls and drops junk layers", () => {
    const s = normalizeCanvasSlide({
      id: "x",
      kind: "canvas",
      bg: { color: "javascript:alert(1)", texture: "linen", textureOpacity: 7, image: "http://insecure/x.jpg" },
      layers: [
        { id: "t", type: "text", text: "Hi", font: "comic-sans", size: 9999, opacity: -2, color: "red; background:url(x)" },
        { id: "i", type: "image", src: "not-a-url" },
        { id: "s", type: "shape", shape: "star", gradient: "url(evil)" },
        { id: "z", type: "video" },
      ],
    });
    expect(s.bg).toMatchObject({ color: "#FFFFFF", texture: "linen", textureOpacity: 1, image: "" });
    expect(s.layers.map((l) => l.type)).toEqual(["text", "shape"]);
    expect(s.layers[0]).toMatchObject({ font: "figtree", size: 600, opacity: 0, color: "#1A1A1A" });
    expect(s.layers[1]).toMatchObject({ shape: "rect", gradient: null });
  });

  it("keeps a valid template gradient", () => {
    const g = "linear-gradient(to top, rgba(0, 0, 0, 0.68) 0%, rgba(0, 0, 0, 0) 70%)";
    const s = normalizeCanvasSlide({ layers: [{ type: "shape", gradient: g }] });
    expect((s.layers[0] as { gradient: string }).gradient).toBe(g);
  });
});

describe("design with canvas slides", () => {
  it("normalizes mixed template + canvas slides and checks them", () => {
    const d = normalizeDesign({ slides: [{ layout: "text", headline: "Hi" }, { ...blankCanvas("NI"), id: "c1" }] })!;
    expect(d.slides.map(isCanvas)).toEqual([false, true]);
    expect(slideProblems(d.slides[1], 2)).toEqual(["Slide 2 is empty."]);
  });

  it("hashes canvas content", () => {
    const a = blankCanvas("NI");
    const b = { ...a, layers: [newTextLayer("NI", "heading")] };
    expect(slideHash(a, "NI")).not.toBe(slideHash(b, "NI"));
    expect(slideHash(a, "NI")).toBe(slideHash({ ...a }, "NI"));
  });
});

describe("fonts", () => {
  it("resolves the nearest variant and puts brand fonts first", () => {
    expect(resolveVariant("playfair", 600, false)).toMatchObject({ weight: 500, style: "normal" });
    expect(resolveVariant("playfair", 500, true)).toMatchObject({ style: "italic" });
    expect(resolveVariant("bebas", 700, true)).toMatchObject({ weight: 400, style: "normal" });
    expect(fontsForBrand("NI").slice(0, 2).map((f) => f.id)).toEqual(["eb-garamond", "figtree"]);
    expect(fontByFamilyName('"EB Garamond", serif')?.id).toBe("eb-garamond");
  });

  it("knows which fonts a slide uses and fills page tokens", () => {
    const s = { ...blankCanvas("NI"), layers: [{ ...newTextLayer("NI", "body"), font: "caveat" }, newShapeLayer("NI", "rect")] };
    expect(fontsUsed(s)).toEqual(["caveat"]);
    expect(fillTokens("{n} / {total}", 2, 5)).toBe("2 / 5");
  });
});

describe("renderSlideJpeg (canvas)", () => {
  it("renders text, shapes, rotation and a texture to a 1080x1350 JPEG", async () => {
    const s = blankCanvas("NI");
    s.bg = { ...s.bg, texture: "grain", textureOpacity: 0.3, textureOnTop: true };
    s.layers = [{ ...newShapeLayer("NI", "arch"), rotation: 10 }, { ...newTextLayer("NI", "heading"), font: "playfair", italic: true }];
    const meta = await sharp(await renderSlideJpeg(s, "NI", 1, 1)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1080, 1350]);
  }, 60_000);
});
