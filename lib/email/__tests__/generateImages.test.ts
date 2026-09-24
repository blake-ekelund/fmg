import { describe, it, expect } from "vitest";
import { createDefaultBlock, type EmailBlock, type FooterBlock, type SectionBlock } from "@/components/templates/types";
import type { ImageCandidate } from "@/lib/generatorImages";
import { checkEmailImages, unsplashCreditLine } from "../generateImages";

const LIB = "https://x.supabase.co/storage/v1/object/public/email-assets/images/lotion.jpg";
const STOCK = "https://images.unsplash.com/photo-1?ixid=abc&w=1600&q=80&fm=jpg&fit=max";
const STOCK2 = "https://images.unsplash.com/photo-2?ixid=def&w=1600&q=80&fm=jpg&fit=max";

const stock = (url: string, photographer: string): ImageCandidate => ({
  url,
  title: null,
  alt: null,
  description: null,
  source: "unsplash",
  photographer,
  credit: `Photo by ${photographer} on Unsplash`,
  downloadLocation: `${url}#dl`,
});
const candidates: ImageCandidate[] = [
  { url: LIB, title: "Lotion", alt: null, description: null, source: "library" },
  stock(STOCK, "Brooke Ekelund"),
  stock(STOCK2, "Sam Lee"),
];

const block = <T extends EmailBlock>(type: EmailBlock["type"], patch: Partial<T>): T =>
  ({ ...(createDefaultBlock(type) as T), ...patch });

describe("checkEmailImages", () => {
  it("keeps listed URLs and blanks invented ones", () => {
    const r = checkEmailImages(
      [block("image", { src: LIB }), block("hero", { imageUrl: "https://made.up/x.jpg" })],
      candidates,
    );
    expect(r.blocks[0]).toMatchObject({ src: LIB });
    expect(r.blocks[1]).toMatchObject({ imageUrl: "" });
    expect(r.blanked).toBe(1);
  });

  it("keeps Unsplash photos out of product, columns and header blocks", () => {
    const r = checkEmailImages(
      [
        block("product", { imageUrl: STOCK }),
        block("header", { logoUrl: STOCK }),
        block("columns", { items: [{ heading: "a", text: "", imageUrl: STOCK }, { heading: "b", text: "", imageUrl: LIB }] }),
      ],
      candidates,
    );
    expect(r.blocks[0]).toMatchObject({ imageUrl: "" });
    expect(r.blocks[1]).toMatchObject({ logoUrl: "" });
    expect(r.blocks[2]).toMatchObject({ items: [{ imageUrl: "" }, { imageUrl: LIB }] });
    expect(r.usedUnsplash).toHaveLength(0);
  });

  it("checks section backgrounds and blocks inside columns", () => {
    const section = block<SectionBlock>("section", {
      bgImage: STOCK,
      columns: [{ id: "c", weight: 1, bgColor: "", verticalAlign: "middle", padding: 0, blocks: [block("caption", { imageUrl: "https://nope/x.jpg" })] }],
    });
    const r = checkEmailImages([section], candidates);
    const s = r.blocks[0] as SectionBlock;
    expect(s.bgImage).toBe(STOCK);
    expect(s.columns[0].blocks[0]).toMatchObject({ imageUrl: "" });
  });

  it("adds one credit line to the footer", () => {
    const r = checkEmailImages(
      [block("hero", { imageUrl: STOCK }), block("image", { src: STOCK2 }), block<FooterBlock>("footer", { text: "You're on our list." })],
      candidates,
    );
    expect((r.blocks[2] as FooterBlock).text).toBe("You're on our list. Photos by Brooke Ekelund and Sam Lee on Unsplash.");
    expect(r.usedUnsplash.map((p) => p.url)).toEqual([STOCK, STOCK2]);
  });

  it("appends a small credit text block when there's no footer", () => {
    const r = checkEmailImages([block("image", { src: STOCK })], candidates);
    expect(r.blocks).toHaveLength(2);
    expect(r.blocks[1]).toMatchObject({ type: "text", html: "<p>Photo by Brooke Ekelund on Unsplash.</p>" });
  });

  it("adds nothing when no Unsplash photo is used", () => {
    const r = checkEmailImages([block("image", { src: LIB })], candidates);
    expect(r.blocks).toHaveLength(1);
  });
});

describe("unsplashCreditLine", () => {
  it("groups photos by photographer", () => {
    const b = stock(STOCK, "Brooke Ekelund");
    expect(unsplashCreditLine([b, { ...b, url: STOCK2 }])).toBe("Photos by Brooke Ekelund on Unsplash.");
    expect(unsplashCreditLine([])).toBe("");
  });
});
