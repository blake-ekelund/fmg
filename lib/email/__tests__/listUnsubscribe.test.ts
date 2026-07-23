import { describe, it, expect, beforeAll } from "vitest";

// lib/email/unsubscribe imports supabaseServer, which builds a client at module
// load, and crypto, which needs a key. Neither is exercised by these tests —
// they only cover the pure header/URL construction.
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://stub.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "stub";
  // Must base64-decode to exactly 32 bytes for AES-256-GCM.
  process.env.EMAIL_TOKEN_ENC_KEY ??= Buffer.alloc(32, 7).toString("base64");
});

const ORIGIN = "https://portal.example.com";

describe("listUnsubscribeHeaders", () => {
  it("emits both headers RFC 8058 one-click requires", async () => {
    const { listUnsubscribeHeaders } = await import("../unsubscribe");
    const headers = listUnsubscribeHeaders(ORIGIN, { email: "buyer@example.com" });
    const byName = Object.fromEntries(headers.map((h) => [h.name, h.value]));

    expect(Object.keys(byName).sort()).toEqual([
      "List-Unsubscribe",
      "List-Unsubscribe-Post",
    ]);
    // The Post header value is fixed by the RFC — any variation and mailbox
    // providers ignore one-click entirely.
    expect(byName["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("wraps the URL in angle brackets, as RFC 2369 requires", async () => {
    const { listUnsubscribeHeaders } = await import("../unsubscribe");
    const [listUnsub] = listUnsubscribeHeaders(ORIGIN, { email: "buyer@example.com" });
    expect(listUnsub.value.startsWith("<")).toBe(true);
    expect(listUnsub.value.endsWith(">")).toBe(true);
    expect(listUnsub.value).toContain(`${ORIGIN}/api/email/unsubscribe?t=`);
  });

  it("carries the token in the query string, not a body", async () => {
    // One-click is a bare POST from the mailbox provider with no form fields we
    // control, so the token has to be in the URL for the POST handler to read.
    const { listUnsubscribeHeaders } = await import("../unsubscribe");
    const [listUnsub] = listUnsubscribeHeaders(ORIGIN, { email: "buyer@example.com" });
    const url = new URL(listUnsub.value.slice(1, -1));
    expect(url.pathname).toBe("/api/email/unsubscribe");
    expect(url.searchParams.get("t")).toBeTruthy();
  });

  it("mints a distinct token per recipient", async () => {
    const { listUnsubscribeHeaders } = await import("../unsubscribe");
    const a = listUnsubscribeHeaders(ORIGIN, { email: "a@example.com" })[0].value;
    const b = listUnsubscribeHeaders(ORIGIN, { email: "b@example.com" })[0].value;
    expect(a).not.toBe(b);
  });

  it("round-trips the recipient back out of the token", async () => {
    const { listUnsubscribeHeaders, readUnsubscribeToken } = await import("../unsubscribe");
    const [listUnsub] = listUnsubscribeHeaders(ORIGIN, {
      email: "Buyer@Example.COM",
      customerType: "wholesale",
      customerRef: "10482",
    });
    const token = new URL(listUnsub.value.slice(1, -1)).searchParams.get("t")!;
    const payload = readUnsubscribeToken(token);
    // Addresses are normalised on the way in so suppression lookups match.
    expect(payload?.email).toBe("buyer@example.com");
    expect(payload?.customerType).toBe("wholesale");
    expect(payload?.customerRef).toBe("10482");
  });
});
