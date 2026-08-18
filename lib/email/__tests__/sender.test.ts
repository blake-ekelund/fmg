import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveSender, resendConfigured } from "../sender";

const ENV_KEYS = ["RESEND_API_KEY", "RESEND_FROM_DOMAIN", "RESEND_FROM_LOCAL", "RESEND_REPLY_TO"] as const;

describe("resolveSender", () => {
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.RESEND_FROM_DOMAIN = "send.fragrancemarketinggroup.com";
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("uses the brand display name over the shared domain", () => {
    expect(resolveSender({ brand: "ni" }).from).toBe("Natural Inspirations <hello@send.fragrancemarketinggroup.com>");
    expect(resolveSender({ brand: "sassy" }).from).toBe("Sassy <hello@send.fragrancemarketinggroup.com>");
    expect(resolveSender({ brand: "both" }).from).toBe("Fragrance Marketing Group <hello@send.fragrancemarketinggroup.com>");
    expect(resolveSender({ brand: null }).from).toBe("Fragrance Marketing Group <hello@send.fragrancemarketinggroup.com>");
  });

  it("defaults Reply-To to a monitored inbox so replies never bounce", () => {
    // No template reply_to, no RESEND_REPLY_TO env → fall back, not undefined.
    expect(resolveSender({ brand: "both" }).replyTo).toBe(
      "blake.ekelund@fragrancemarketinggroup.com"
    );
  });

  it("lets a template's own from_name and reply_to win", () => {
    const s = resolveSender({ brand: "ni", fromName: "NI Wholesale", replyTo: "maria@naturalinspirations.com" });
    expect(s.from).toBe("NI Wholesale <hello@send.fragrancemarketinggroup.com>");
    expect(s.replyTo).toBe("maria@naturalinspirations.com");
  });

  it("honours RESEND_FROM_LOCAL and RESEND_REPLY_TO env overrides", () => {
    process.env.RESEND_FROM_LOCAL = "news";
    process.env.RESEND_REPLY_TO = "ops@fragrancemarketinggroup.com";
    const s = resolveSender({ brand: "sassy" });
    expect(s.fromEmail).toBe("news@send.fragrancemarketinggroup.com");
    expect(s.replyTo).toBe("ops@fragrancemarketinggroup.com");
  });

  it("resendConfigured requires BOTH the key and the domain", () => {
    expect(resendConfigured()).toBe(false); // domain set, key missing
    process.env.RESEND_API_KEY = "re_test";
    expect(resendConfigured()).toBe(true);
    delete process.env.RESEND_FROM_DOMAIN;
    expect(resendConfigured()).toBe(false);
  });
});
