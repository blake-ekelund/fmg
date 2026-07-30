import { describe, it, expect } from "vitest";
import {
  renderBlocksToEmailHtml,
  sanitizeInlineHtml,
  safeUrl,
  spaceBlocks,
} from "../renderBlocks";
import { createDefaultBlock, createSectionPreset } from "@/components/templates/types";
import type {
  ButtonBlock,
  EmailBlock,
  ImageBlock,
  TextBlock,
  ColumnsBlock,
  HeroBlock,
  SocialBlock,
  PromotionBlock,
  SectionBlock,
  CaptionBlock,
} from "@/components/templates/types";

const block = <T extends EmailBlock>(type: T["type"], patch: Partial<T> = {}): T =>
  ({ ...createDefaultBlock(type), ...patch }) as T;

describe("block margins", () => {
  it("emits a real spacer row for a positive top margin (email-safe, not a CSS margin)", () => {
    const html = renderBlocksToEmailHtml([block<TextBlock>("text", { marginTop: 30, html: "<p>Hi</p>" })]);
    expect(html).toContain('height="30"');
    expect(html).toContain("line-height:30px");
    // Not carried as a CSS margin (which Gmail/Outlook strip).
    expect(html).not.toContain("margin-top:30px");
  });

  it("adds spacer rows both above and below for top + bottom margins", () => {
    const html = renderBlocksToEmailHtml([block<TextBlock>("text", { marginTop: 20, marginBottom: 40 })]);
    expect(html).toContain('height="20"');
    expect(html).toContain('height="40"');
  });

  it("uses a negative CSS margin (best-effort overlap) only for negative values", () => {
    const html = renderBlocksToEmailHtml([block<TextBlock>("text", { marginTop: -25 })]);
    expect(html).toContain("margin-top:-25px");
    expect(html).not.toContain('height="-25"');
  });

  it("spaces sections apart with transparent spacer rows outside the section cell", () => {
    const s = { ...createSectionPreset("band"), marginTop: 32, marginBottom: 16 } as SectionBlock;
    const html = renderBlocksToEmailHtml([s]);
    expect(html).toContain('height="32"');
    expect(html).toContain('height="16"');
  });

  it("leaves a marginless block byte-identical (no stray spacer rows)", () => {
    const html = renderBlocksToEmailHtml([block<TextBlock>("text", { html: "<p>Hi</p>" })]);
    expect(html).not.toMatch(/height="\d+"[^>]*>&nbsp;/);
  });
});

describe("caption / overlay block (image-blocked fail-safe)", () => {
  it("overlays live text on a bulletproof background image with a solid fallback colour", () => {
    const html = renderBlocksToEmailHtml([
      block<CaptionBlock>("caption", {
        layout: "overlay",
        imageUrl: "https://cdn.example.com/hero.jpg",
        bgColor: "#1a5632",
        heading: "Winter Sale",
      }),
    ]);
    // Live text, not baked into the image.
    expect(html).toContain("Winter Sale");
    // Fallback colour is on the cell (shows when the image is blocked).
    expect(html).toContain('bgcolor="#1a5632"');
    expect(html).toContain("background-color:#1a5632");
    // Bulletproof background: CSS image + non-Outlook attr + VML for Outlook.
    expect(html).toContain("background-image:url('https://cdn.example.com/hero.jpg')");
    expect(html).toContain('background="https://cdn.example.com/hero.jpg"');
    expect(html).toContain("v:rect");
  });

  it("still shows the headline on the fallback colour when there is no image at all", () => {
    const html = renderBlocksToEmailHtml([
      block<CaptionBlock>("caption", { layout: "overlay", imageUrl: "", bgColor: "#1a5632", heading: "No Image" }),
    ]);
    expect(html).toContain("No Image");
    expect(html).toContain('bgcolor="#1a5632"');
    // No image → no VML / background attr.
    expect(html).not.toContain("v:rect");
    expect(html).not.toContain("background=");
  });

  it("adds an rgba scrim only when darkening is set (overlay)", () => {
    const dark = renderBlocksToEmailHtml([
      block<CaptionBlock>("caption", { layout: "overlay", imageUrl: "https://x/y.jpg", scrim: 40 }),
    ]);
    expect(dark).toContain("background-color:rgba(0,0,0,0.40)");
    const none = renderBlocksToEmailHtml([
      block<CaptionBlock>("caption", { layout: "overlay", imageUrl: "https://x/y.jpg", scrim: 0 }),
    ]);
    // No scrim layer (the text-shadow still uses rgba, so check the bg specifically).
    expect(none).not.toContain("background-color:rgba(0,0,0");
  });

  it("renders a solid caption panel beside the image for the below layout", () => {
    const html = renderBlocksToEmailHtml([
      block<CaptionBlock>("caption", { layout: "below", imageUrl: "https://x/y.jpg", bgColor: "#111827", heading: "Caption" }),
    ]);
    expect(html).toContain("<img");
    expect(html).toContain('bgcolor="#111827"');
    expect(html).toContain("Caption");
  });
});

describe("image block", () => {
  it("styles alt text so a blocked image degrades to legible text", () => {
    const html = renderBlocksToEmailHtml([block<ImageBlock>("image", { src: "https://x/y.jpg", alt: "Product shot" })]);
    const imgTag = html.slice(html.indexOf("<img"), html.indexOf(">", html.indexOf("<img")) + 1);
    expect(imgTag).toContain('alt="Product shot"');
    expect(imgTag).toContain("color:#6b7280");
    expect(imgTag).toContain("font-size:13px");
  });
});

describe("section rendering", () => {
  it("lays columns out as fluid inline-block divs with MSO ghost cells", () => {
    const html = renderBlocksToEmailHtml([createSectionPreset("twoCol")]);
    // Two column divs (inline-block) + the MSO ghost table for Outlook.
    const colDivs = html.match(/display:inline-block;vertical-align:/g) ?? [];
    expect(colDivs.length).toBe(2);
    expect(html).toContain("<!--[if mso]><table");
    expect(html).toMatch(/<!--\[if mso\]><td valign=/);
  });

  it("renders nested content blocks inside a column", () => {
    // imageText preset's right column has a heading, text and a button.
    const html = renderBlocksToEmailHtml([createSectionPreset("imageText")]);
    expect(html).toContain("Your Headline");
    expect(html).toContain("Supporting copy");
    // The button block renders its bulletproof anchor.
    expect(html).toContain("Shop Now");
  });

  it("emits a plain bgcolor for a colour-only section", () => {
    const s = { ...createSectionPreset("band") } as SectionBlock;
    s.bgColor = "#1a5632";
    s.bgImage = "";
    const html = renderBlocksToEmailHtml([s]);
    expect(html).toContain('bgcolor="#1a5632"');
    expect(html).not.toContain("v:rect");
  });

  it("uses a VML rect fallback for a background image", () => {
    const s = { ...createSectionPreset("band") } as SectionBlock;
    s.bgImage = "https://cdn.example.com/bg.jpg";
    const html = renderBlocksToEmailHtml([s]);
    expect(html).toContain("v:rect");
    expect(html).toContain('v:fill type="frame" src="https://cdn.example.com/bg.jpg"');
    expect(html).toContain('background="https://cdn.example.com/bg.jpg"'); // non-Outlook attr
    expect(html).toContain("background-image:url('https://cdn.example.com/bg.jpg')");
  });

  it("sizes a 2-column section to the real content width so it fits at a 600px client without stacking", () => {
    // The wrapper eats 12px each side → the white column is 576px at a 600px
    // client, and the section (24px padding) has 528px inside. The two column
    // divs + the gap must fit there, or the columns wrap (stack) — the very bug
    // where the editor showed side-by-side but the client preview stacked.
    const html = renderBlocksToEmailHtml([createSectionPreset("imageText")], { contentWidth: 600 });
    const colWidths = [...html.matchAll(/display:inline-block;vertical-align:[^;]+;width:100%;max-width:(\d+)px/g)].map(
      (m) => Number(m[1]),
    );
    expect(colWidths.length).toBe(2);
    const sectionInnerAtClient = 600 - 24 /* wrapper */ - 48 /* section padding */; // 528
    const gap = 20;
    expect(colWidths[0] + colWidths[1] + gap).toBeLessThanOrEqual(sectionInnerAtClient);
    // Equal-weight preset → roughly even columns.
    expect(Math.abs(colWidths[0] - colWidths[1])).toBeLessThanOrEqual(2);
  });
});

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

describe("spaceBlocks (text-block paragraph spacing)", () => {
  it("trims a single paragraph's margins so it hugs the block padding", () => {
    // The excess whitespace people see is the <p>'s default ~1em top+bottom.
    expect(spaceBlocks("<p>$220.00</p>")).toBe('<p style="margin:0;">$220.00</p>');
  });

  it("gives multiple paragraphs a bottom gap, with the last trimmed to zero", () => {
    expect(spaceBlocks("<p>One</p><p>Two</p>")).toBe(
      '<p style="margin:0 0 12px;">One</p><p style="margin:0;">Two</p>',
    );
  });

  it("spaces headings too", () => {
    expect(spaceBlocks("<h2>Title</h2><p>Body</p>")).toBe(
      '<h2 style="margin:0 0 12px;">Title</h2><p style="margin:0;">Body</p>',
    );
  });

  it("uses inline styles (no <style> block) so it survives Outlook", () => {
    const html = renderBlocksToEmailHtml([block<TextBlock>("text", { html: "<p>Hi</p>" })]);
    expect(html).not.toContain("<style");
    expect(html).toContain('style="margin:0;"');
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

  it("centers a half-width image with an aligned table + auto margins (not just text-align)", () => {
    const html = renderBlocksToEmailHtml([
      block<ImageBlock>("image", { src: "https://cdn.example.com/a.jpg", width: "half", align: "center" }),
    ]);
    expect(html).toContain('align="center" style="margin:0 auto;"');
  });

  it("right-aligns a half-width image with margin-left auto", () => {
    const html = renderBlocksToEmailHtml([
      block<ImageBlock>("image", { src: "https://cdn.example.com/a.jpg", width: "half", align: "right" }),
    ]);
    expect(html).toContain('align="right" style="margin:0 0 0 auto;"');
  });

  it("does not wrap a full-width image in a centering table (alignment is moot)", () => {
    const html = renderBlocksToEmailHtml([
      block<ImageBlock>("image", { src: "https://cdn.example.com/a.jpg", width: "full", align: "center" }),
    ]);
    // The image-alignment table uses this exact style; the document's content
    // table has `...max-width:600px;margin:0 auto;...`, which won't match.
    expect(html).not.toContain('style="margin:0 auto;"');
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
