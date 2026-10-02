import { describe, it, expect } from "vitest";
import { isRichText, plainTextToRichText, richTextToPlain, sanitizeRichText } from "../richText";

describe("sanitizeRichText", () => {
  it("normalizes browser-editor output to our tag set", () => {
    expect(
      sanitizeRichText('<div><b>Bold</b> and <i class="x">it</i></div><div><br></div><ul><li style="a">One</li></ul>'),
    ).toBe("<p><strong>Bold</strong> and <em>it</em></p><ul><li>One</li></ul>");
  });

  it("leaves scripts, images and links as inert text", () => {
    expect(sanitizeRichText("<p>Hi<script>alert(1)</script><img src=x onerror=alert(1)></p>")).toBe(
      "<p>Hi&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;</p>",
    );
    expect(sanitizeRichText('<a href="javascript:x">y</a>')).toBe(
      "&lt;a href=&quot;javascript:x&quot;&gt;y&lt;/a&gt;",
    );
  });

  it("unwraps a list the browser nested inside a paragraph", () => {
    expect(sanitizeRichText("<p><ul><li><b>A</b> one</li><li>B</li></ul></p>")).toBe(
      "<ul><li><strong>A</strong> one</li><li>B</li></ul>",
    );
  });

  it("strips attributes from allowed tags", () => {
    expect(sanitizeRichText('<p onclick="x()">a</p>')).toBe("<p>a</p>");
  });
});

describe("plain text ↔ rich text", () => {
  it("turns legacy plain text into paragraphs and bullet lists", () => {
    expect(plainTextToRichText("Soft skin\n\n• Hydrates\n• Calms\nEnd & more")).toBe(
      "<p>Soft skin</p><ul><li>Hydrates</li><li>Calms</li></ul><p>End &amp; more</p>",
    );
  });

  it("flattens rich text for places that can't show formatting", () => {
    expect(richTextToPlain("<p><strong>Soft</strong> skin &amp; more</p><ul><li>Hydrates</li><li>Calms</li></ul>")).toBe(
      "Soft skin & more\n\n• Hydrates\n• Calms",
    );
  });

  it("leaves plain text alone", () => {
    expect(isRichText("Use 2 < 3 times")).toBe(false);
    expect(richTextToPlain("Just <3 text")).toBe("Just <3 text");
  });
});
