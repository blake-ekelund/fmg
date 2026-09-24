import { describe, it, expect } from "vitest";
import {
  brandTemplate,
  createBlock,
  createSection,
  enforceFormat,
  insertBlogBlock,
  moveBlogBlock,
  nudgeBlogBlock,
  removeBlogBlock,
  type BlogBlock,
} from "../blocks";
import { normalizeBlogBlocks } from "../normalize";
import { renderBlogBlocks, safeUrl, sanitizeInline } from "../render";

const intro: BlogBlock = { id: "i", type: "intro", html: "<p>Hook</p>" };
const para = (id: string): BlogBlock => ({ id, type: "paragraph", html: `<p>${id}</p>` });

describe("enforceFormat", () => {
  it("puts one intro first and, on Sassy, one closing last", () => {
    const out = enforceFormat("Sassy", [para("a"), intro, para("b")]);
    expect(out.map((b) => b.type)).toEqual(["intro", "paragraph", "paragraph", "closing"]);
    expect(out[0].id).toBe("i");
  });

  it("drops the closing on NI", () => {
    const sassy = enforceFormat("Sassy", [intro, para("a")]);
    const ni = enforceFormat("NI", sassy);
    expect(ni.some((b) => b.type === "closing")).toBe(false);
  });

  it("promotes a leading paragraph to the intro when there is none", () => {
    const out = enforceFormat("NI", [para("a"), para("b")]);
    expect(out[0]).toMatchObject({ id: "a", type: "intro", html: "<p>a</p>" });
    expect(out).toHaveLength(2);
  });

  it("is idempotent", () => {
    const once = enforceFormat("Sassy", brandTemplate("Sassy"));
    expect(enforceFormat("Sassy", once)).toEqual(once);
  });
});

describe("locked blocks", () => {
  const doc = enforceFormat("Sassy", [intro, para("a"), para("b")]);
  const closingId = doc[doc.length - 1].id;

  it("can't be removed", () => {
    expect(removeBlogBlock(doc, "i")).toBe(doc);
    expect(removeBlogBlock(doc, closingId)).toBe(doc);
  });

  it("can't be moved, and nothing moves past them", () => {
    expect(nudgeBlogBlock(doc, "a", -1)).toBe(doc);
    expect(nudgeBlogBlock(doc, "b", 1)).toBe(doc);
    expect(moveBlogBlock(doc, "i", "b", "after")).toBe(doc);
  });

  it("insert before the intro lands after it; after the closing lands before it", () => {
    const x = para("x");
    expect(insertBlogBlock(doc, x, "i", "before")[1].id).toBe("x");
    const y = para("y");
    const out = insertBlogBlock(doc, y, closingId, "after");
    expect(out[out.length - 2].id).toBe("y");
    expect(out[out.length - 1].id).toBe(closingId);
  });

  it("sections never go inside sections", () => {
    const s = createSection("imageText");
    const withSection = [...doc.slice(0, 1), s, ...doc.slice(1)];
    const nestedTarget = s.columns[0].blocks[0].id;
    expect(insertBlogBlock(withSection, createSection("callout"), nestedTarget, "after")).toBe(withSection);
  });
});

describe("renderBlogBlocks", () => {
  it("emits plain semantic HTML with no builder markers", () => {
    const html = renderBlogBlocks(brandTemplate("NI"), "NI");
    expect(html).toContain("<h2>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("data-bb");
    expect(html).not.toContain("class=");
  });

  it("adds data-bb markers in editor mode, draggable except for locked blocks", () => {
    const html = renderBlogBlocks(enforceFormat("Sassy", [intro, para("a")]), "Sassy", { editor: true });
    expect(html).toContain(`data-bb="i" data-bb-type="intro" draggable="false"`);
    expect(html).toContain(`data-bb="a" data-bb-type="paragraph" draggable="true"`);
  });

  it("styles buttons from the brand theme, not the block", () => {
    const b = createBlock("button");
    expect(renderBlogBlocks([b], "Sassy")).toContain("#B3295C");
    expect(renderBlogBlocks([b], "NI")).toContain("#1F3D35");
  });

  it("escapes text and neutralises script URLs", () => {
    const html = renderBlogBlocks(
      [
        { id: "h", type: "heading", level: 2, text: "<script>x</script>" },
        { id: "b", type: "button", text: "Go", url: "javascript:alert(1)" },
      ],
      "Sassy",
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:");
  });

  it("skips images with no src", () => {
    expect(renderBlogBlocks([createBlock("image")], "NI")).toBe("");
  });
});

describe("sanitizeInline", () => {
  it("keeps inline marks and links, drops styles and block tags", () => {
    const out = sanitizeInline(`<p style="color:red">Hi <b>there</b> <a href="/shop" onclick="x()">shop</a></p><h2>Big</h2><script>bad()</script>`);
    expect(out).toBe(`<p>Hi <b>there</b> <a href="/shop">shop</a></p><p>Big</p>`);
  });

  it("wraps bare text in a paragraph", () => {
    expect(sanitizeInline("hello")).toBe("<p>hello</p>");
  });
});

describe("safeUrl", () => {
  it("allows http(s), site paths, anchors, mailto; adds https to bare domains", () => {
    expect(safeUrl("/shop")).toBe("/shop");
    expect(safeUrl("https://x.com")).toBe("https://x.com");
    expect(safeUrl("sassyandco.com/shop")).toBe("https://sassyandco.com/shop");
    expect(safeUrl("data:text/html,x")).toBe("#");
  });
});

describe("normalizeBlogBlocks", () => {
  it("returns just the format skeleton for junk input", () => {
    expect(normalizeBlogBlocks(null, "NI").map((b) => b.type)).toEqual(["intro"]);
    expect(normalizeBlogBlocks("nope", "Sassy").map((b) => b.type)).toEqual(["intro", "closing"]);
  });

  it("drops unknown types, fills defaults, and de-dupes ids", () => {
    const out = normalizeBlogBlocks(
      [
        { id: "x", type: "intro", text: "Hook" },
        { id: "x", type: "heading", text: "One" },
        { type: "carousel" },
        { type: "list", items: ["a", "", "b"] },
      ],
      "NI",
    );
    expect(out.map((b) => b.type)).toEqual(["intro", "heading", "list"]);
    expect(new Set(out.map((b) => b.id)).size).toBe(3);
    expect(out[2]).toMatchObject({ type: "list", ordered: false, items: ["a", "b"] });
  });

  it("keeps galleries to images and drops empty sections", () => {
    const out = normalizeBlogBlocks(
      [
        { type: "intro", html: "<p>Hi</p>" },
        {
          type: "section",
          layout: "gallery",
          columns: [{ blocks: [{ type: "image", src: "https://a/1.jpg" }, { type: "heading", text: "no" }] }, { blocks: [] }],
        },
        { type: "section", layout: "callout", columns: [{ blocks: [] }] },
      ],
      "NI",
    );
    expect(out).toHaveLength(2);
    const gallery = out[1];
    expect(gallery.type === "section" && gallery.columns[0].blocks.map((b) => b.type)).toEqual(["image"]);
  });

  it("strips unsafe characters from ids", () => {
    const out = normalizeBlogBlocks([{ id: `a"]{x}`, type: "intro", html: "<p>Hi</p>" }], "NI");
    expect(out[0].id).toBe("ax");
  });
});
