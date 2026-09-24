import { describe, it, expect } from "vitest";
import type { BlogBlock } from "../blocks";
import { checkGeneratedImages, type BlogImageCandidate } from "../generateImages";

const LIB = "https://x.supabase.co/storage/v1/object/public/email-assets/images/lotion.jpg";
const STOCK = "https://images.unsplash.com/photo-1?ixid=abc&w=1600&q=80&fm=jpg&fit=max";

const candidates: BlogImageCandidate[] = [
  { url: LIB, title: "Lotion", alt: "Lotion bottle", description: null, source: "library" },
  {
    url: STOCK,
    title: null,
    alt: "Candle on a bath tray",
    description: null,
    source: "unsplash",
    credit: "Photo by Brooke Ekelund on Unsplash",
    downloadLocation: "https://api.unsplash.com/photos/1/download",
  },
];

const img = (id: string, src: string, caption = ""): BlogBlock => ({ id, type: "image", src, alt: "", caption });

describe("checkGeneratedImages", () => {
  it("keeps listed URLs and blanks invented ones", () => {
    const r = checkGeneratedImages([img("a", LIB), img("b", "https://example.com/made-up.jpg")], "", candidates);
    expect(r.blocks.map((b) => (b.type === "image" ? b.src : null))).toEqual([LIB, ""]);
    expect(r.blanked).toBe(1);
  });

  it("credits Unsplash photos in the caption and fills alt text", () => {
    const r = checkGeneratedImages([img("a", STOCK)], "", candidates);
    const b = r.blocks[0];
    expect(b.type === "image" && b.caption).toBe("Photo by Brooke Ekelund on Unsplash");
    expect(b.type === "image" && b.alt).toBe("Candle on a bath tray");
    expect(r.usedUnsplash.map((p) => p.url)).toEqual([STOCK]);
  });

  it("appends the credit to an existing caption, but doesn't double it", () => {
    const withCap = checkGeneratedImages([img("a", STOCK, "Sunday reset")], "", candidates).blocks[0];
    expect(withCap.type === "image" && withCap.caption).toBe("Sunday reset · Photo by Brooke Ekelund on Unsplash");
    const credited = checkGeneratedImages([img("a", STOCK, "Photo by B on Unsplash")], "", candidates).blocks[0];
    expect(credited.type === "image" && credited.caption).toBe("Photo by B on Unsplash");
  });

  it("keeps Unsplash photos out of product cards", () => {
    const product = (imageUrl: string): BlogBlock => ({ id: "p", type: "product", imageUrl, name: "Lotion", blurb: "", price: "", url: "/shop" });
    expect(checkGeneratedImages([product(STOCK)], "", candidates).blocks[0]).toMatchObject({ imageUrl: "" });
    expect(checkGeneratedImages([product(LIB)], "", candidates).blocks[0]).toMatchObject({ imageUrl: LIB });
  });

  it("checks images inside sections and the hero", () => {
    const section: BlogBlock = {
      id: "s",
      type: "section",
      layout: "gallery",
      columns: [
        { id: "c1", blocks: [{ id: "x", type: "image", src: STOCK, alt: "", caption: "" }] },
        { id: "c2", blocks: [{ id: "y", type: "image", src: "https://nope.test/a.jpg", alt: "", caption: "" }] },
      ],
    };
    const r = checkGeneratedImages([section], `  ${STOCK} `, candidates);
    const cols = r.blocks[0].type === "section" ? r.blocks[0].columns : [];
    expect(cols.map((c) => (c.blocks[0].type === "image" ? c.blocks[0].src : null))).toEqual([STOCK, ""]);
    expect(r.hero).toBe(STOCK);
    expect(r.usedUnsplash).toHaveLength(1); // hero + gallery are the same photo
    expect(checkGeneratedImages([], "https://nope.test/h.jpg", candidates).hero).toBe("");
  });
});
