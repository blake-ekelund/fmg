import { describe, it, expect } from "vitest";
import {
  lintEmailHtml,
  findingsForClient,
  EMAIL_CLIENTS,
  GMAIL_CLIP_BYTES,
  type CompatFinding,
} from "../clientCompat";

const rule = (findings: CompatFinding[], r: string) => findings.find((f) => f.rule === r);

describe("lintEmailHtml", () => {
  it("returns nothing for a clean, inline-styled email", () => {
    const html = `<!DOCTYPE html><html><body>
      <table role="presentation"><tr><td style="padding:16px;background:#ffffff">
        <img src="logo.png" alt="Acme" width="120">
        <p style="font-family:Arial,sans-serif">Hi there</p>
      </td></tr></table></body></html>`;
    expect(lintEmailHtml(html)).toEqual([]);
  });

  it("flags CSS background images for Outlook desktop only", () => {
    const f = rule(lintEmailHtml(`<div style="background-image:url('hero.jpg')">x</div>`), "background-image");
    expect(f).toBeTruthy();
    expect(f!.clients).toEqual(["outlook-desktop"]);
    expect(f!.severity).toBe("warning");
  });

  it("also catches the background: shorthand with url()", () => {
    expect(rule(lintEmailHtml(`<td style="background:#eee url(x.png) no-repeat">x</td>`), "background-image")).toBeTruthy();
  });

  it("flags media queries as info for Outlook desktop", () => {
    const f = rule(lintEmailHtml(`<style>@media (max-width:600px){.c{width:100%}}</style>`), "media-queries");
    expect(f).toBeTruthy();
    expect(f!.severity).toBe("info");
    expect(f!.clients).toEqual(["outlook-desktop"]);
  });

  it("flags external stylesheets as an error for all clients", () => {
    const f = rule(lintEmailHtml(`<link rel="stylesheet" href="/style.css">`), "external-stylesheet");
    expect(f).toBeTruthy();
    expect(f!.severity).toBe("error");
    expect(f!.clients).toEqual(EMAIL_CLIENTS.map((c) => c.id));
  });

  it("counts images missing alt but ignores alt=\"\" and present alt", () => {
    const html = `<img src="a.png"><img src="b.png" alt=""><img src="c.png" alt="C"><img src="d.png">`;
    const f = rule(lintEmailHtml(html), "img-missing-alt");
    expect(f).toBeTruthy();
    expect(f!.count).toBe(2);
  });

  it("does not flag alt when only decorative/among valid images", () => {
    expect(rule(lintEmailHtml(`<img src="a.png" alt="A">`), "img-missing-alt")).toBeUndefined();
  });

  it("warns about the Gmail clip limit past ~102 KB", () => {
    const big = `<body>${"x".repeat(GMAIL_CLIP_BYTES + 10)}</body>`;
    const f = rule(lintEmailHtml(big), "gmail-clip");
    expect(f).toBeTruthy();
    expect(f!.clients).toEqual(["gmail"]);
  });

  it("does not warn about clipping under the limit", () => {
    expect(rule(lintEmailHtml("<body>small</body>"), "gmail-clip")).toBeUndefined();
  });

  it("flags border-radius and box-shadow as info for Outlook desktop", () => {
    const findings = lintEmailHtml(`<div style="border-radius:8px;box-shadow:0 2px 4px #0003">x</div>`);
    expect(rule(findings, "border-radius")?.clients).toEqual(["outlook-desktop"]);
    expect(rule(findings, "box-shadow")?.clients).toEqual(["outlook-desktop"]);
  });

  it("flags inline SVG for non-WebKit clients", () => {
    const f = rule(lintEmailHtml(`<svg viewBox="0 0 10 10"><rect/></svg>`), "svg");
    expect(f!.clients).toEqual(["gmail", "outlook-web", "outlook-desktop"]);
  });

  it("flags prefers-color-scheme as ignored by Gmail/Outlook", () => {
    const f = rule(lintEmailHtml(`<style>@media (prefers-color-scheme:dark){body{background:#000}}</style>`), "dark-mode-media");
    expect(f).toBeTruthy();
    expect(f!.clients).toContain("gmail");
    expect(f!.clients).not.toContain("apple-mail");
  });

  it("ignores patterns that appear only inside HTML comments", () => {
    const f = rule(lintEmailHtml(`<!-- <link rel="stylesheet" href="x.css"> --><p>ok</p>`), "external-stylesheet");
    expect(f).toBeUndefined();
  });

  it("sorts errors before warnings before info", () => {
    const html = `<link rel="stylesheet" href="x.css"><div style="background-image:url(a.jpg);border-radius:4px">x</div>`;
    const sev = lintEmailHtml(html).map((f) => f.severity);
    const idx = { error: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < sev.length; i++) {
      expect(idx[sev[i]]).toBeGreaterThanOrEqual(idx[sev[i - 1]]);
    }
  });
});

describe("findingsForClient", () => {
  it("filters to findings that affect the given client", () => {
    const findings = lintEmailHtml(`<div style="border-radius:8px">x</div><img src="a.png">`);
    // border-radius → outlook-desktop only; missing alt → all clients.
    expect(findingsForClient(findings, "outlook-desktop").map((f) => f.rule).sort()).toEqual(
      ["border-radius", "img-missing-alt"],
    );
    expect(findingsForClient(findings, "apple-mail").map((f) => f.rule)).toEqual(["img-missing-alt"]);
  });
});
