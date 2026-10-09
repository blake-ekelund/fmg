import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: {} }));

import {
  compileCaption,
  newSlide,
  normalizeCaption,
  normalizeDesign,
  slideHash,
  slideProblems,
  type Slide,
} from "@/lib/social/design";
import { buildSocialPrompt, checkDesignImages } from "@/lib/social/generate";
import { renderSlideJpeg } from "@/lib/social/renderSlides";
import type { ImageCandidate } from "@/lib/generatorImages";

describe("normalizeDesign", () => {
  it("cleans AI output: unknown layouts, bad urls, too many items, dup ids", () => {
    const d = normalizeDesign({
      slides: [
        { id: "a", layout: "cover", headline: "Hi", image: "https://x.test/a.jpg" },
        { id: "a", layout: "banana", tone: "neon", headline: "Text", image: "javascript:alert(1)" },
        { layout: "list", headline: "L", items: ["1", "2", "3", "4", "5", "6"] },
      ],
      caption: { hook: "Hook", hashtags: "#spa, selfcare #spa" },
    })!;
    const slides = d.slides as Slide[];
    expect(slides.map((s) => s.layout)).toEqual(["cover", "text", "list"]);
    expect(slides[1].id).not.toBe("a");
    expect(slides[1].tone).toBe("light");
    expect(slides[1].image).toBe("");
    expect(slides[2].items).toHaveLength(5);
    expect(d.caption.hashtags).toEqual(["spa", "selfcare"]);
  });

  it("returns null without slides", () => {
    expect(normalizeDesign({ slides: [] })).toBeNull();
    expect(normalizeDesign("nope")).toBeNull();
  });
});

describe("caption + checks", () => {
  it("compiles hook, body, cta and hashtags", () => {
    expect(compileCaption(normalizeCaption({ hook: "A", body: "B", cta: "", hashtags: ["x", "y"] }))).toBe("A\n\nB\n\n#x #y");
  });

  it("flags slides that would render broken", () => {
    expect(slideProblems({ ...newSlide("product", "NI"), image: "" }, 2)).toContain("Slide 2 needs an image.");
    expect(slideProblems({ ...newSlide("list", "NI"), items: ["one"] }, 1)).toContain("Slide 1 needs at least two list items.");
    expect(slideProblems(newSlide("text", "NI"), 1)).toEqual([]);
  });

  it("hash changes with content and brand, not with id", () => {
    const s = newSlide("text", "NI");
    expect(slideHash({ ...s, id: "other" }, "NI")).toBe(slideHash(s, "NI"));
    expect(slideHash({ ...s, headline: "New" }, "NI")).not.toBe(slideHash(s, "NI"));
    expect(slideHash(s, "Sassy")).not.toBe(slideHash(s, "NI"));
  });
});

describe("checkDesignImages", () => {
  const lib: ImageCandidate = { url: "https://lib.test/1.jpg", title: "Lib", alt: null, description: null, source: "library" };
  const stock: ImageCandidate = { url: "https://unsplash.test/2.jpg", title: null, alt: null, description: null, source: "unsplash", downloadLocation: "dl" };
  const product = { part: "P1", name: "Lotion", fragrance: null, size: null, price: 24, blurb: "", images: [{ url: "https://prod.test/front.jpg", type: "front" }] };

  it("keeps offered images, blanks invented ones, keeps Unsplash off product slides", () => {
    const d = normalizeDesign({
      slides: [
        { layout: "cover", headline: "a", image: stock.url },
        { layout: "product", headline: "b", image: stock.url },
        { layout: "product", headline: "c", image: product.images[0].url },
        { layout: "photo", image: "https://made-up.test/x.jpg" },
        { layout: "photo", image: lib.url },
      ],
    })!;
    const { design, usedUnsplash } = checkDesignImages(d, [lib, stock], [product]);
    expect((design.slides as Slide[]).map((s) => s.image)).toEqual([stock.url, "", product.images[0].url, "", lib.url]);
    expect(usedUnsplash.map((u) => u.url)).toEqual([stock.url]);
  });

  it("prompt lists the offered photos and the slide count", () => {
    const p = buildSocialPrompt({
      brand: "NI", purpose: "education", platforms: ["instagram"], format: "carousel", slideCount: 4,
      prompt: "Lavender ritual", products: [product], catalog: ["Sea Salt Lotion"], images: [lib, stock],
    });
    expect(p).toContain("Exactly 4 slides");
    expect(p).toContain(product.images[0].url);
    expect(p).toContain(lib.url);
    expect(p).toContain(stock.url);
    expect(p).toContain("Lavender ritual");
  });
});

describe("renderSlideJpeg", () => {
  it("renders a 1080x1350 JPEG with the brand fonts", async () => {
    const jpg = await renderSlideJpeg({ ...newSlide("text", "NI"), headline: "A calm Sunday" }, "NI", 1, 3);
    const meta = await sharp(jpg).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1080, 1350]);
  }, 60_000);
});
