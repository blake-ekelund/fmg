import { describe, it, expect } from "vitest";
import { buildTrackedHtmlFromHtml, buildTrackedHtmlBody } from "../tracking";
import { renderBlocksToEmailHtml } from "../renderBlocks";
import { createDefaultBlock } from "@/components/templates/types";
import type { ButtonBlock, TextBlock } from "@/components/templates/types";

const ORIGIN = "https://portal.example.com";
const MSG = "msg-123";

describe("buildTrackedHtmlFromHtml", () => {
  it("rewrites http(s) anchors through the click tracker", () => {
    const { html, links } = buildTrackedHtmlFromHtml({
      html: '<body><a href="https://sassyandco.com/spring">Shop</a></body>',
      origin: ORIGIN,
      messageId: MSG,
    });
    expect(links).toHaveLength(1);
    expect(links[0].original_url).toBe("https://sassyandco.com/spring");
    expect(html).toContain(`${ORIGIN}/api/email/link/${links[0].id}`);
    expect(html).not.toContain("sassyandco.com/spring");
  });

  it("leaves neutralised and non-http hrefs alone", () => {
    const { html, links } = buildTrackedHtmlFromHtml({
      html: '<a href="#">x</a><a href="mailto:hi@example.com">mail</a>',
      origin: ORIGIN,
      messageId: MSG,
    });
    expect(links).toHaveLength(0);
    expect(html).toContain('href="#"');
    expect(html).toContain("mailto:hi@example.com");
  });

  it("numbers links in document order", () => {
    const { links } = buildTrackedHtmlFromHtml({
      html: '<a href="https://a.com">a</a><a href="https://b.com">b</a>',
      origin: ORIGIN,
      messageId: MSG,
    });
    expect(links.map((l) => l.link_index)).toEqual([0, 1]);
    expect(links.map((l) => l.original_url)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("puts the open pixel inside body rather than after the document", () => {
    const { html } = buildTrackedHtmlFromHtml({
      html: "<html><body><p>hi</p></body></html>",
      origin: ORIGIN,
      messageId: MSG,
    });
    expect(html).toContain(`${ORIGIN}/api/email/pixel/${MSG}.gif`);
    expect(html).toMatch(/<img[^>]*pixel[^>]*>\s*<\/body>/);
  });

  it("does NOT escape the markup — that is the plain-text path's job", () => {
    const { html } = buildTrackedHtmlFromHtml({
      html: "<table><tr><td>cell</td></tr></table>",
      origin: ORIGIN,
      messageId: MSG,
    });
    expect(html).toContain("<table>");
    expect(html).not.toContain("&lt;table&gt;");
  });

  it("round-trips a rendered block template with its links tracked", () => {
    const rendered = renderBlocksToEmailHtml([
      createDefaultBlock("text") as TextBlock,
      { ...(createDefaultBlock("button") as ButtonBlock), url: "https://sassyandco.com" },
    ]);
    const { html, links } = buildTrackedHtmlFromHtml({
      html: rendered,
      origin: ORIGIN,
      messageId: MSG,
    });
    expect(links).toHaveLength(1);
    expect(html).toContain("<table"); // structure survived
    expect(html).toContain(`${ORIGIN}/api/email/pixel/${MSG}.gif`);
  });
});

describe("buildTrackedHtmlBody (plain text path, unchanged)", () => {
  it("still escapes markup typed into a plain-text body", () => {
    const { html } = buildTrackedHtmlBody({
      plainText: "<b>not bold</b>",
      origin: ORIGIN,
      messageId: MSG,
    });
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>not bold</b>");
  });

  it("still linkifies bare urls and appends the pixel", () => {
    const { html, links } = buildTrackedHtmlBody({
      plainText: "See https://sassyandco.com today",
      origin: ORIGIN,
      messageId: MSG,
    });
    expect(links).toHaveLength(1);
    expect(html).toContain(`${ORIGIN}/api/email/link/${links[0].id}`);
    expect(html).toContain(`${ORIGIN}/api/email/pixel/${MSG}.gif`);
  });
});
