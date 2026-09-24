import { describe, it, expect } from "vitest";
import type { BlogBlock } from "../blocks";
import { renderBlogBlocks } from "../render";

const blocks: BlogBlock[] = [
  { id: "i", type: "intro", html: "<p>Hook</p>" },
  { id: "p", type: "paragraph", html: "<p>Body</p>" },
];
const credit = {
  name: "Brooke <Ekelund>",
  profileUrl: "https://unsplash.com/@brookeekelund?utm_source=fmg_portal&utm_medium=referral",
  unsplashUrl: "https://unsplash.com/photos/abc?utm_source=fmg_portal&utm_medium=referral",
};

describe("renderBlogBlocks heroCredit", () => {
  it("appends the cover credit after everything else, so the intro stays the first <p>", () => {
    const html = renderBlogBlocks(blocks, "NI", { heroCredit: credit });
    expect(html.startsWith("<p>Hook</p>")).toBe(true);
    expect(html.trimEnd().endsWith("</div>")).toBe(true);
    expect(html).toContain("Cover photo by <a href=");
    expect(html).toContain(">Unsplash</a>");
    expect(html.indexOf("Cover photo")).toBeGreaterThan(html.indexOf("Body"));
  });

  it("escapes the photographer's name and keeps the utm links", () => {
    const html = renderBlogBlocks(blocks, "Sassy", { heroCredit: credit });
    expect(html).toContain("Brooke &lt;Ekelund&gt;");
    expect(html).toContain("utm_source=fmg_portal&amp;utm_medium=referral");
  });

  it("renders nothing extra without a credit", () => {
    expect(renderBlogBlocks(blocks, "NI")).toBe(renderBlogBlocks(blocks, "NI", { heroCredit: null }));
    expect(renderBlogBlocks(blocks, "NI")).not.toContain("Cover photo");
  });
});
