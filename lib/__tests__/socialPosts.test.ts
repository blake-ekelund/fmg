import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countHashtags, normalizeMedia, overallStatus, validatePost, type PostDraft } from "@/lib/social/types";
import { readPostFields } from "@/lib/social/server";

const img = (n = 1) => Array.from({ length: n }, (_, i) => ({ url: `https://x.test/${i}.jpg`, kind: "image" as const }));
const base: PostDraft = { brand: "Sassy", platforms: ["instagram", "facebook"], post_type: "image", caption: "hi", media: img() };

describe("validatePost", () => {
  it("accepts a single image post", () => {
    expect(validatePost(base)).toEqual([]);
  });

  it("needs a platform and the right media count per type", () => {
    expect(validatePost({ ...base, platforms: [] })).toContain("Pick at least one platform.");
    expect(validatePost({ ...base, media: img(2) })).toHaveLength(1);
    expect(validatePost({ ...base, post_type: "carousel", media: img(1) })[0]).toMatch(/2–10/);
    expect(validatePost({ ...base, post_type: "carousel", media: img(10) })).toEqual([]);
    expect(validatePost({ ...base, post_type: "reel", media: img(1) })[0]).toMatch(/video/);
    expect(
      validatePost({ ...base, post_type: "reel", media: [{ url: "https://x.test/a.mp4", kind: "video" }] }),
    ).toEqual([]);
  });

  it("enforces Instagram caption limits only when posting to Instagram", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect(validatePost({ ...base, caption: tags }).join(" ")).toMatch(/30 hashtags/);
    expect(validatePost({ ...base, platforms: ["facebook"], caption: tags })).toEqual([]);
    expect(validatePost({ ...base, caption: "x".repeat(2201) }).join(" ")).toMatch(/2200/);
  });
});

describe("countHashtags", () => {
  it("counts hashtags but not mid-word # or URLs fragments", () => {
    expect(countHashtags("#one two #three a#b https://x.com/#frag")).toBe(2);
  });
});

describe("normalizeMedia", () => {
  it("keeps https urls, infers kind, drops junk", () => {
    expect(
      normalizeMedia(["https://a.test/v.MP4", { url: "http://insecure.test/x.jpg" }, { url: "https://a.test/p.png" }, 5]),
    ).toEqual([
      { url: "https://a.test/v.MP4", kind: "video" },
      { url: "https://a.test/p.png", kind: "image" },
    ]);
  });
});

describe("overallStatus", () => {
  it("rolls platform results up", () => {
    const both = ["instagram", "facebook"] as const;
    expect(overallStatus([...both], { instagram: { status: "published" }, facebook: { status: "published" } })).toBe("published");
    expect(overallStatus([...both], { instagram: { status: "failed" }, facebook: { status: "published" } })).toBe("partial");
    expect(overallStatus([...both], { instagram: { status: "failed" }, facebook: { status: "failed" } })).toBe("failed");
    expect(overallStatus([...both], { instagram: { status: "pending" }, facebook: { status: "published" } })).toBe("publishing");
  });
});

describe("readPostFields", () => {
  it("only takes known, valid keys and orders platforms", () => {
    const f = readPostFields({
      brand: "NI",
      platforms: ["facebook", "tiktok", "instagram"],
      post_type: "story",
      scheduled_at: "2026-10-09T15:00:00-04:00",
      status: "published",
    });
    expect(f).toEqual({ brand: "NI", platforms: ["instagram", "facebook"], scheduled_at: "2026-10-09T19:00:00.000Z" });
  });
});

describe("meta graph client", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", fetchMock);
    process.env.META_ACCESS_TOKEN = "sys-token";
    process.env.META_PAGE_ID_SASSY = "111";
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it("resolves the Page token + linked IG account, then posts an album with attached_media", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: "111", name: "Sassy", access_token: "page-token", instagram_business_account: { id: "999", username: "sassy" } }))
      .mockResolvedValueOnce(ok({ id: "p1" }))
      .mockResolvedValueOnce(ok({ id: "p2" }))
      .mockResolvedValueOnce(ok({ id: "111_555" }))
      .mockResolvedValueOnce(ok({ permalink_url: "https://www.facebook.com/111/posts/555" }));

    const meta = await import("@/lib/social/meta");
    const acct = await meta.brandAccount("Sassy");
    expect(acct).toMatchObject({ pageToken: "page-token", igUserId: "999", igUsername: "sassy" });

    const out = await meta.fbPublishAlbum(acct, ["https://x.test/a.jpg", "https://x.test/b.jpg"], "hello");
    expect(out).toEqual({ id: "111_555", permalink: "https://www.facebook.com/111/posts/555" });

    const feedCall = fetchMock.mock.calls[3];
    expect(feedCall[0]).toMatch(/\/111\/feed$/);
    const body = new URLSearchParams(feedCall[1].body as string);
    expect(body.get("message")).toBe("hello");
    expect(body.get("attached_media[0]")).toBe('{"media_fbid":"p1"}');
    expect(body.get("attached_media[1]")).toBe('{"media_fbid":"p2"}');
    expect(body.get("access_token")).toBe("page-token");
  });

  it("marks rate-limit errors transient and surfaces the user message", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "raw", error_user_msg: "Slow down", code: 4 } }), { status: 400 }),
    );
    const meta = await import("@/lib/social/meta");
    const err = await meta.listVisiblePages().catch((e) => e);
    expect(err).toBeInstanceOf(meta.MetaError);
    expect(err.message).toBe("Slow down");
    expect(err.transient).toBe(true);
  });
});
