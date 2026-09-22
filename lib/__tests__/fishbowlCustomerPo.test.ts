import { describe, it, expect } from "vitest";
import { fishbowlCustomerPo, orderRef } from "../storefrontOrder";

describe("fishbowlCustomerPo", () => {
  const mt = (over: Record<string, unknown> = {}) =>
    ({ id: "o1", source: "markettime", external_ref: "32850850", external_po: "22604073", ...over }) as never;

  it("uses the RETAILER's PO for MarketTime, not the recordID", () => {
    // What ops keys by hand; the recordID is our own internal key.
    expect(fishbowlCustomerPo(mt())).toBe("22604073-MKTTIME");
  });

  it("keeps the retailer PO exactly as the retailer wrote it", () => {
    expect(fishbowlCustomerPo(mt({ external_po: "219-6258218N" }))).toBe("219-6258218N-MKTTIME");
    expect(fishbowlCustomerPo(mt({ external_po: "Jd2701775" }))).toBe("Jd2701775-MKTTIME");
  });

  it("trims a padded PO", () => {
    expect(fishbowlCustomerPo(mt({ external_po: "  JD917 " }))).toBe("JD917-MKTTIME");
  });

  it("falls back to the recordID when there is no retailer PO", () => {
    expect(fishbowlCustomerPo(mt({ external_po: null }))).toBe("32850850-MKTTIME");
    expect(fishbowlCustomerPo(mt({ external_po: "  " }))).toBe("32850850-MKTTIME");
    expect(fishbowlCustomerPo(mt({ external_po: "—" }))).toBe("32850850-MKTTIME");
  });

  it("falls back rather than putting free text in the PO box", () => {
    // People type notes into the PO field; those must not become an identifier.
    for (const junk of ["See Special Instructions", "n/a!", "PO #123 (rush)", "ab"]) {
      expect(fishbowlCustomerPo(mt({ external_po: junk }))).toBe("32850850-MKTTIME");
    }
  });

  it("leaves Faire on its display id — that IS the retailer-facing id", () => {
    expect(
      fishbowlCustomerPo({ id: "o2", source: "faire", external_ref: "WV7RMBPNK4" } as never),
    ).toBe("WV7RMBPNK4-FAIRE");
  });

  it("leaves storefront orders on their own ref", () => {
    expect(fishbowlCustomerPo({ id: "o3", store: "sassy", number: 1042 } as never)).toBe("SASSY-1042");
  });

  it("matches orderRef for everything except MarketTime", () => {
    const faire = { id: "o4", source: "faire", external_ref: "ABC123XYZ0" } as never;
    expect(fishbowlCustomerPo(faire)).toBe(orderRef(faire));
    const store = { id: "o5", store: "ni", number: 7 } as never;
    expect(fishbowlCustomerPo(store)).toBe(orderRef(store));
  });
});
