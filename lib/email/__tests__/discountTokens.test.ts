import { describe, it, expect, beforeAll, vi } from "vitest";

// discountTokens → storefrontDiscountCodes → supabaseServer builds a client at
// module load. The mint itself is mocked below; these env stubs only let the
// import succeed.
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://stub.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "stub";
});

const mint = vi.fn();
vi.mock("@/lib/storefrontDiscountCodes", () => ({
  mintUniqueCode: (b: string) => mint(b),
  isMintFailure: (r: object) => "error" in r,
}));

const load = () => import("@/lib/email/discountTokens");

describe("discount tokens", () => {
  it("finds distinct batches, case- and space-insensitively", async () => {
    const { discountBatchesIn } = await load();
    expect(
      discountBatchesIn("{{discountCode:COMEBACK15}} {{ discountCode : comeback15 }} {{discountCode:LASTCALL20}}"),
    ).toEqual(["COMEBACK15", "LASTCALL20"]);
    expect(discountBatchesIn("{{firstName}}")).toEqual([]);
  });

  it("samples without minting", async () => {
    const { applyDiscountSample } = await load();
    expect(applyDiscountSample("Code: {{discountCode:comeback15}}")).toBe("Code: COMEBACK15-SAMPLE");
  });

  it("mints one code per batch and reuses it for repeats", async () => {
    const { mintDiscountTokens } = await load();
    mint.mockReset().mockResolvedValue({ code: "COMEBACK15-ABC234" });
    const out = await mintDiscountTokens("{{discountCode:COMEBACK15}} / {{discountCode:COMEBACK15}}");
    expect(out).toBe("COMEBACK15-ABC234 / COMEBACK15-ABC234");
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("refuses to produce an email when a batch can't mint", async () => {
    const { mintDiscountTokens, DiscountMintError } = await load();
    mint.mockReset().mockResolvedValue({ error: "not active", status: 409 });
    await expect(mintDiscountTokens("{{discountCode:LASTCALL20}}")).rejects.toBeInstanceOf(DiscountMintError);
  });

  it("leaves token-free html alone without touching the DB", async () => {
    const { mintDiscountTokens } = await load();
    mint.mockReset();
    expect(await mintDiscountTokens("<p>hi</p>")).toBe("<p>hi</p>");
    expect(mint).not.toHaveBeenCalled();
  });
});
