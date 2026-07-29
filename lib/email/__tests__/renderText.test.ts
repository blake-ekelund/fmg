import { describe, it, expect } from "vitest";
import { renderTextEmail } from "../renderText";

describe("renderTextEmail", () => {
  it("wraps a body in a full HTML document", () => {
    const html = renderTextEmail("Hello");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<body");
    expect(html).toContain("Hello");
  });

  it("escapes HTML so a stray tag can't become markup", () => {
    const html = renderTextEmail("a < b & c > d");
    expect(html).toContain("a &lt; b &amp; c &gt; d");
    expect(html).not.toContain("a < b");
  });

  it("converts newlines to <br> (all line-ending styles)", () => {
    const html = renderTextEmail("one\ntwo\r\nthree\rfour");
    expect(html).toContain("one<br>two<br>three<br>four");
  });

  it("leaves merge tokens intact for downstream substitution", () => {
    const html = renderTextEmail("Hi {{firstName}}, from {{senderName}}");
    expect(html).toContain("{{firstName}}");
    expect(html).toContain("{{senderName}}");
  });

  it("injects an escaped preheader when previewText is given", () => {
    const html = renderTextEmail("Body", { previewText: "Peek <at> this" });
    expect(html).toContain("display:none");
    expect(html).toContain("Peek &lt;at&gt; this");
  });

  it("omits the preheader when previewText is blank", () => {
    const html = renderTextEmail("Body", { previewText: "   " });
    expect(html).not.toContain("display:none");
  });

  it("handles an empty body without throwing", () => {
    expect(() => renderTextEmail("")).not.toThrow();
  });
});
