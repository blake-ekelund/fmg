import { describe, it, expect } from "vitest";
import {
  renderBlocksToEmailHtml,
  sanitizeInlineHtml,
  safeUrl,
} from "../renderBlocks";
import { createDefaultBlock } from "@/components/templates/types";
import type {
  ButtonBlock,
  EmailBlock,
  ImageBlock,
  TextBlock,
  ColumnsBlock,
  HeroBlock,
  SocialBlock,
  PromotionBlock,
} from "@/components/templates/types";

const block = <T extends EmailBlock>(type: T["type"], patch: Partial<T> = {}): T =>
  ({ ...createDefaultBlock(type), ...patch }) as T;

describe("safeUrl", () => {
  it("passes http, https and mailto through", () => {
    expect(safeUrl("https://sassyandco.com")).toBe("https://sassyandco.com");
    expect(safeUrl("http://example.com/x?a=1")).toContain("http://example.com");
    expect(safeUrl("mailto:hi@example.com")).toBe("mailto:hi@example.com");
  });

  it("neutralises anything executable or unfilled", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe("#");
    expect(safeUrl("https://")).toBe("#"); // the editor's default placeholder
    expect(safeUrl("")).toBe("#");
    expect(safeUrl(null)).toBe("#");
  });

  it("escapes quotes so a url cannot break out of the attribute", () => {
    expect(safeUrl('https://x.com/"onload="alert(1)')).not.toContain('"onload');
  });
});

describe("sanitizeInlineHtml", () => {
  it("keeps basic formatting", () => {
    expect(sanitizeInlineHtml("<p>Hello <strong>there</strong></p>")).toBe(
      "<p>Hello <strong>there</strong></p>",
    );
  });

  it("removes scripts and their contents", () => {
    const out = sanitizeInlineHtml('<p>ok</p><script>alert("x")</script>');
    expect(out).toBe("<p>ok</p>");
    expect(out).not.toContain("alert");
  });

  it("strips event handlers and inline styles from allowed tags", () => {
    const out = sanitizeInlineHtml('<p onclick="steal()" style="color:red">hi</p>');
    expect(out).toBe("<p>hi</p>");
  });

  it("rewrites anchors through safeUrl and adds rel", () => {
    const out = sanitizeInlineHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).toContain('href="#"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).not.toContain("javascript:");
  });

  it("unwraps disallowed tags but keeps their text", () => {
    expect(sanitizeInlineHtml("<marquee>move</marquee>")).toBe("move");
  });

  it("drops comments so conditional markup cannot smuggle tags", () => {
    expect(sanitizeInlineHtml("a<!--[if mso]><script><![endif]-->b")).toBe("ab");
  });
});

describe("renderBlocksToEmailHtml", () => {
  it("emits a table-based document with no layout divs or classes", () => {
    const html = renderBlocksToEmailHtml([
      block<TextBlock>("text"),
      block<ButtonBlock>("button", { url: "https://sassyandco.com" }),
    ]);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('role="presentation"');
    // Nothing Outlook's Word engine ignores.
    expect(html).not.toMatch(/display:\s*flex/);
    expect(html).not.toMatch(/display:\s*grid/);
    expect(html).not.toMatch(/\sclass=/);
    expect(html).not.toContain("<style");
  });

  it("caps the content column with max-width so it shrinks on a phone", () => {
    const html = renderBlocksToEmailHtml([block<TextBlock>("text")], { contentWidth: 640 });
    expect(html).toContain("max-width:640px");
  });

  it("pins the column for Outlook via an mso-only conditional table", () => {
    const html = renderBlocksToEmailHtml([block<TextBlock>("text")], { contentWidth: 640 });
    expect(html).toContain("<!--[if mso]>");
    expect(html).toMatch(/<!--\[if mso\]>[\s\S]*width="640"/);
    expect(html).toContain("<![endif]-->");
  });

  it("leaves merge tokens intact for later substitution", () => {
    const html = renderBlocksToEmailHtml([
      block<TextBlock>("text", { html: "<p>Hi {{firstName}} at {{customerName}}</p>" }),
    ]);
    expect(html).toContain("{{firstName}}");
    expect(html).toContain("{{customerName}}");
  });

  it("renders a button as a padded table cell, not a bare anchor", () => {
    const html = renderBlocksToEmailHtml([
      block<ButtonBlock>("button", { text: "Shop Now", url: "https://sassyandco.com" }),
    ]);
    expect(html).toContain("Shop Now");
    expect(html).toContain('bgcolor="#1a5632"');
    expect(html).toMatch(/<td bgcolor[^>]*>\s*<a href="https:\/\/sassyandco\.com"/);
  });

  it("skips an image block with no source instead of emitting a placeholder", () => {
    expect(renderBlocksToEmailHtml([block<ImageBlock>("image", { src: "" })])).not.toContain("<img");
  });

  it("sizes a half-width image against the content column minus padding", () => {
    const html = renderBlocksToEmailHtml([
      block<ImageBlock>("image", { src: "https://cdn.example.com/a.jpg", width: "half", padding: 10 }),
    ]);
    // (600 - 20) / 2 = 290
    expect(html).toContain('width="290"');
  });

  it("lays columns out as table cells", () => {
    const html = renderBlocksToEmailHtml([block<ColumnsBlock>("columns")]);
    const cells = html.match(/<td width="\d+" valign="top"/g) ?? [];
    expect(cells.length).toBe(2);
  });

  it("degrades the hero to image-over-panel rather than an overlay", () => {
    const html = renderBlocksToEmailHtml([
      block<HeroBlock>("hero", { imageUrl: "https://cdn.example.com/h.jpg", heading: "Spring" }),
    ]);
    expect(html).toContain("Spring");
    expect(html).not.toContain("position:absolute");
  });

  it("renders social links as text, and nothing at all when unset", () => {
    expect(renderBlocksToEmailHtml([block<SocialBlock>("social")])).not.toContain("Instagram");
    const html = renderBlocksToEmailHtml([
      block<SocialBlock>("social", { instagram: "https://instagram.com/sassy" }),
    ]);
    expect(html).toContain("Instagram");
  });

  it("escapes user text so a stray angle bracket cannot inject markup", () => {
    const html = renderBlocksToEmailHtml([
      block<PromotionBlock>("promotion", { headline: '<script>alert("x")</script>' }),
    ]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes a hidden preheader when one is supplied", () => {
    const html = renderBlocksToEmailHtml([block<TextBlock>("text")], {
      previewText: "Your spring order is ready",
    });
    expect(html).toContain("Your spring order is ready");
    expect(html).toMatch(/display:none;[^"]*max-height:0/);
  });
});
