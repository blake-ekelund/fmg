import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { hostedImageUrl, rewriteEmailImageUrls, storagePublicPrefix } from "../imageUrls";

const PROJECT = "https://vxisjubwezhxfxocoawk.supabase.co";
const APP = "https://app.fragrancemarketinggroup.com";
const STORAGE = `${PROJECT}/storage/v1/object/public/email-assets`;

describe("email image URLs", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROJECT);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("builds the storage prefix from the configured project", () => {
    expect(storagePublicPrefix()).toBe(`${STORAGE}/`);
  });

  describe("hostedImageUrl", () => {
    it("moves a storage URL onto the app domain, preserving the path", () => {
      expect(hostedImageUrl(`${STORAGE}/images/1785333066204-logo-email.png`)).toBe(
        `${APP}/email-assets/images/1785333066204-logo-email.png`,
      );
    });

    it("preserves nested paths", () => {
      expect(hostedImageUrl(`${STORAGE}/holiday-prebook/gift-ho-ho-glow.jpg`)).toBe(
        `${APP}/email-assets/holiday-prebook/gift-ho-ho-glow.jpg`,
      );
    });

    it("leaves URLs on other hosts alone", () => {
      const foreign = "https://cdn.shopify.com/s/files/1/x.png";
      expect(hostedImageUrl(foreign)).toBe(foreign);
    });

    it("leaves data URIs and relative paths alone", () => {
      expect(hostedImageUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
      expect(hostedImageUrl("/logo.png")).toBe("/logo.png");
    });

    it("is idempotent — an already-rewritten URL is untouched", () => {
      const once = hostedImageUrl(`${STORAGE}/images/logo.png`);
      expect(hostedImageUrl(once)).toBe(once);
    });

    it("does not touch a different bucket", () => {
      const other = `${PROJECT}/storage/v1/object/public/activity-files/note.png`;
      expect(hostedImageUrl(other)).toBe(other);
    });
  });

  describe("rewriteEmailImageUrls", () => {
    it("rewrites every occurrence in one pass", () => {
      const html =
        `<img src="${STORAGE}/images/logo.png">` +
        `<img src="${STORAGE}/holiday-prebook/lip-butter-display.jpg">`;
      const out = rewriteEmailImageUrls(html);
      expect(out).not.toContain("supabase.co");
      expect(out).toContain(`${APP}/email-assets/images/logo.png`);
      expect(out).toContain(`${APP}/email-assets/holiday-prebook/lip-butter-display.jpg`);
    });

    it("covers the non-src shapes the renderers emit", () => {
      // background attr, CSS url(), and Outlook's VML fill all carry the same URL.
      const url = `${STORAGE}/holiday-prebook/hand-creme-display.jpg`;
      const html =
        `<td background="${url}" style="background-image:url('${url}');">` +
        `<!--[if gte mso 9]><v:fill type="frame" src="${url}" /><![endif]-->`;
      const out = rewriteEmailImageUrls(html);
      expect(out).not.toContain("supabase.co");
      expect(out.split(`${APP}/email-assets/`).length - 1).toBe(3);
    });

    it("leaves the rest of the markup untouched", () => {
      const html = `<a href="https://naturalinspirations.com">Shop</a>`;
      expect(rewriteEmailImageUrls(html)).toBe(html);
    });

    it("no-ops when Supabase isn't configured", () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
      const html = `<img src="${STORAGE}/images/logo.png">`;
      expect(rewriteEmailImageUrls(html)).toBe(html);
    });

    it("handles empty input", () => {
      expect(rewriteEmailImageUrls("")).toBe("");
    });
  });

  describe("origin selection", () => {
    // A recipient's mail client fetches these; it is never on our network, so
    // a dev machine's localhost origin must never reach an outbound email.
    it.each([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://0.0.0.0:3000",
      "http://fmg.local",
      "not a url",
      "",
    ])("falls back to the public domain when NEXT_PUBLIC_APP_URL is %j", (configured) => {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", configured);
      expect(hostedImageUrl(`${STORAGE}/images/logo.png`)).toBe(
        `${APP}/email-assets/images/logo.png`,
      );
    });

    it("honours a real public origin", () => {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://mail.example.com");
      expect(hostedImageUrl(`${STORAGE}/images/logo.png`)).toBe(
        "https://mail.example.com/email-assets/images/logo.png",
      );
    });
  });
});
