import { describe, it, expect } from "vitest";
import { validateTemplateBody } from "../htmlTemplate";
import { applyMergeFields, suggestToken, unknownTokens } from "../mergeFields";
import { buildTrackedHtmlDocument, escapeHtml } from "../tracking";

const ORIGIN = "https://app.example.com";

function codes(body: string, format: "text" | "html") {
  return validateTemplateBody(body, format).issues.map((i) => i.code);
}

describe("validateTemplateBody", () => {
  it("accepts a body using only supported tokens", () => {
    const r = validateTemplateBody("Hi {{firstName}} at {{customerName}}", "text");
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("rejects an unknown token and suggests the right one", () => {
    const r = validateTemplateBody("Hi {{first_name}}", "html");
    expect(r.ok).toBe(false);
    expect(r.issues[0].code).toBe("unknown_token");
    expect(r.issues[0].message).toContain("{{firstName}}");
  });

  it("catches a token URL-encoded inside a link", () => {
    const html = `<a href="https://x.com/?u=%7B%7BfirstName%7D%7D">go</a>`;
    expect(codes(html, "html")).toContain("encoded_token");
    expect(validateTemplateBody(html, "html").ok).toBe(false);
  });

  it("catches a token split by a tag boundary", () => {
    const html = `<p>Hi {{first<span>Name}}</p>`;
    expect(codes(html, "html")).toContain("split_token");
  });

  it("catches an unclosed token", () => {
    expect(codes(`<p>Hi {{firstName</p>`, "html")).toContain("unclosed_token");
  });

  it("warns without blocking on <script> and oversize bodies", () => {
    const big = `<body>${"x".repeat(110 * 1024)}<script>a()</script></body>`;
    const r = validateTemplateBody(big, "html");
    expect(r.ok).toBe(true); // warnings must not block a save
    expect(r.issues.map((i) => i.code).sort()).toEqual(["script_tag", "size"]);
  });

  it("does not apply markup-only checks to plain text", () => {
    // A textarea can legitimately hold a stray "<" next to braces.
    expect(codes("costs {{lifetimeRevenue}} < budget", "text")).toEqual([]);
  });

  it("does not flag ordinary minified CSS as a broken token", () => {
    const html = `<style>@media screen{.a{color:red}}</style><p>{{firstName}}</p>`;
    expect(validateTemplateBody(html, "html").ok).toBe(true);
  });
});

describe("suggestToken", () => {
  it("maps foreign naming conventions onto ours", () => {
    expect(suggestToken("first_name")).toBe("firstName");
    expect(suggestToken("FIRSTNAME")).toBe("firstName");
    expect(suggestToken("customer-name")).toBe("customerName");
  });

  it("corrects typos", () => {
    expect(suggestToken("custmerName")).toBe("customerName");
  });

  it("returns null rather than a wild guess", () => {
    expect(suggestToken("unsubscribeUrl")).toBeNull();
    expect(suggestToken("productSku")).toBeNull();
  });

  it("does not confuse two short, genuinely different tokens", () => {
    expect(suggestToken("city")).toBe("city");
    expect(suggestToken("state")).toBe("state");
  });
});

describe("applyMergeFields", () => {
  it("leaves unknown tokens in place", () => {
    expect(applyMergeFields("Hi {{nope}}", { firstName: "Alex" })).toBe("Hi {{nope}}");
  });

  it("renders a null value as empty rather than 'null'", () => {
    expect(applyMergeFields("Hi {{firstName}}!", { firstName: null })).toBe("Hi !");
  });

  it("escapes values when asked, so HTML bodies stay well-formed", () => {
    const out = applyMergeFields(
      "<p>{{customerName}}</p>",
      { customerName: "Smith & Sons <Ltd>" },
      { escapeValue: escapeHtml },
    );
    expect(out).toBe("<p>Smith &amp; Sons &lt;Ltd&gt;</p>");
  });

  it("does not escape by default, preserving the plain-text path", () => {
    expect(applyMergeFields("{{customerName}}", { customerName: "Smith & Sons" })).toBe(
      "Smith & Sons",
    );
  });

  it("unknownTokens reports each distinct unknown once", () => {
    expect(unknownTokens("{{a}} {{a}} {{firstName}} {{b}}")).toEqual(["a", "b"]);
  });
});

describe("buildTrackedHtmlDocument", () => {
  const messageId = "msg-1";

  it("rewrites http links and records the original url", () => {
    const { html, links } = buildTrackedHtmlDocument({
      html: `<a href="https://shop.example.com/x?a=1">Shop</a>`,
      origin: ORIGIN,
      messageId,
    });
    expect(links).toHaveLength(1);
    expect(links[0].original_url).toBe("https://shop.example.com/x?a=1");
    expect(html).toContain(`href="${ORIGIN}/api/email/link/${links[0].id}"`);
    expect(html).not.toContain("shop.example.com");
  });

  it("decodes entities so the redirect target is the real url", () => {
    const { links } = buildTrackedHtmlDocument({
      html: `<a href="https://x.com/?a=1&amp;b=2">go</a>`,
      origin: ORIGIN,
      messageId,
    });
    expect(links[0].original_url).toBe("https://x.com/?a=1&b=2");
  });

  it("leaves mailto, tel, and anchor links alone", () => {
    const src = `<a href="mailto:a@b.com">m</a><a href="tel:+15551234">t</a><a href="#top">a</a>`;
    const { html, links } = buildTrackedHtmlDocument({ html: src, origin: ORIGIN, messageId });
    expect(links).toHaveLength(0);
    expect(html).toContain(`href="mailto:a@b.com"`);
    expect(html).toContain(`href="#top"`);
  });

  it("injects the pixel inside </body>, not after it", () => {
    const { html } = buildTrackedHtmlDocument({
      html: `<html><body><p>hi</p></body></html>`,
      origin: ORIGIN,
      messageId,
    });
    expect(html).toContain(`/api/email/pixel/${messageId}.gif`);
    expect(html).toMatch(/<img[^>]*><\/body><\/html>$/);
  });

  it("appends the pixel when the export is a fragment with no body tag", () => {
    const { html } = buildTrackedHtmlDocument({
      html: `<div>hi</div>`,
      origin: ORIGIN,
      messageId,
    });
    expect(html.startsWith("<div>hi</div>")).toBe(true);
    expect(html).toContain(`/api/email/pixel/${messageId}.gif`);
  });

  it("preserves the author's markup verbatim", () => {
    const src = `<table role="presentation"><tr><td style="color:#fff">Hi &amp; welcome</td></tr></table>`;
    const { html } = buildTrackedHtmlDocument({ html: src, origin: ORIGIN, messageId });
    expect(html).toContain(src);
  });

  it("does not nest anchors when a url also appears as link text", () => {
    const src = `<a href="https://x.com/p">https://x.com/p</a>`;
    const { html, links } = buildTrackedHtmlDocument({ html: src, origin: ORIGIN, messageId });
    expect(links).toHaveLength(1);
    // The visible text must stay untouched — only the href is rewritten.
    expect(html).toContain(`>https://x.com/p</a>`);
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("assigns each link its own id and index", () => {
    const { links } = buildTrackedHtmlDocument({
      html: `<a href="https://a.com">a</a><a href="https://b.com">b</a>`,
      origin: ORIGIN,
      messageId,
    });
    expect(links.map((l) => l.link_index)).toEqual([0, 1]);
    expect(new Set(links.map((l) => l.id)).size).toBe(2);
  });
});
