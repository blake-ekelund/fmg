import { describe, it, expect } from "vitest";
import { sanitizeEmailHtml, renderRawHtmlEmail } from "../rawHtml";

describe("sanitizeEmailHtml", () => {
  it("keeps the styling a designed email relies on", () => {
    const input =
      `<table width="600" bgcolor="#1a5632"><tr>` +
      `<td style="padding:20px;color:#fff;font-family:Georgia">` +
      `<a href="https://sassyandco.com" style="color:#fff">Shop</a></td></tr></table>`;
    const out = sanitizeEmailHtml(input);
    expect(out).toContain('style="padding:20px;color:#fff;font-family:Georgia"');
    expect(out).toContain('bgcolor="#1a5632"');
    expect(out).toContain('href="https://sassyandco.com"');
  });

  it("removes scripts, contents and all", () => {
    const out = sanitizeEmailHtml(`<p>Hi</p><script>steal()</script><p>Bye</p>`);
    expect(out).not.toContain("steal");
    expect(out).not.toContain("<script");
    expect(out).toContain("<p>Hi</p>");
    expect(out).toContain("<p>Bye</p>");
  });

  it("drops embedded frames, objects and forms", () => {
    expect(sanitizeEmailHtml(`<iframe src="https://evil.test"></iframe>`)).not.toContain("<iframe");
    expect(sanitizeEmailHtml(`<object data="x"></object>`)).not.toContain("<object");
    expect(sanitizeEmailHtml(`<form action="/x"><input></form>`)).not.toContain("<form");
  });

  it("strips inline event handlers in any quoting style", () => {
    expect(sanitizeEmailHtml(`<img src="a.png" onerror="x()">`)).not.toContain("onerror");
    expect(sanitizeEmailHtml(`<div onclick='y()'>hi</div>`)).not.toContain("onclick");
    expect(sanitizeEmailHtml(`<a onmouseover=z()>hi</a>`)).not.toContain("onmouseover");
  });

  it("neutralises executable URL schemes but keeps the element", () => {
    const out = sanitizeEmailHtml(`<a href="javascript:alert(1)">Click</a>`);
    expect(out).not.toContain("javascript:");
    expect(out).toContain('href="#"');
    expect(out).toContain(">Click</a>");
  });

  it("leaves merge tokens intact for later substitution", () => {
    expect(sanitizeEmailHtml(`<p>Hi {{firstName}}</p>`)).toContain("{{firstName}}");
  });
});

describe("renderRawHtmlEmail", () => {
  it("serves a full document as-is, only sanitised", () => {
    const doc = `<!doctype html><html><body><h1>Hello</h1></body></html>`;
    expect(renderRawHtmlEmail(doc)).toContain("<h1>Hello</h1>");
  });

  it("injects the preheader just inside <body> of a full document", () => {
    const doc = `<!doctype html><html><body style="margin:0"><h1>Hi</h1></body></html>`;
    const out = renderRawHtmlEmail(doc, { previewText: "Peek" });
    expect(out).toMatch(/<body style="margin:0">[\s\S]*Peek[\s\S]*<h1>Hi<\/h1>/);
  });

  it("wraps a bare fragment in a standalone email shell", () => {
    const out = renderRawHtmlEmail(`<p>Just a snippet</p>`, { previewText: "hey" });
    expect(out).toContain("<!doctype html>");
    expect(out).toContain("<body");
    expect(out).toContain("<p>Just a snippet</p>");
    expect(out).toContain("hey");
  });
});
