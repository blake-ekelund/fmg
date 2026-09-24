import { describe, it, expect } from "vitest";
import { validateTemplateBody } from "../htmlTemplate";
import { suggestToken, unknownTokens } from "../mergeFields";

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
    expect(suggestToken("trackingNumber")).toBeNull();
    expect(suggestToken("productSku")).toBeNull();
  });

  it("does not confuse two short, genuinely different tokens", () => {
    expect(suggestToken("city")).toBe("city");
    expect(suggestToken("state")).toBe("state");
  });
});

describe("unknownTokens", () => {
  it("reports each distinct unknown once, in first-seen order", () => {
    expect(unknownTokens("{{a}} {{a}} {{firstName}} {{b}}")).toEqual(["a", "b"]);
  });

  it("accepts per-recipient discount codes and system fields", () => {
    expect(unknownTokens("{{discountCode:COMEBACK15}} {{unsubscribeUrl}}")).toEqual([]);
    expect(validateTemplateBody('<p>Code: {{discountCode:LASTCALL20}}</p><a href="{{unsubscribeUrl}}">x</a>', "html").ok).toBe(true);
  });
});
