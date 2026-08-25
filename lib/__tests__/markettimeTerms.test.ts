import { describe, it, expect } from "vitest";
import { classifyMarketTimeTerms } from "../markettime";
import { FB_TERMS } from "../fishbowlEstimate";

/** Every string below is a real `paymentTerm` value from this account's
 *  MarketTime orders, with the count from a 600-order sample. */
describe("classifyMarketTimeTerms", () => {
  it("trusts isCCAttached over anything the text says", () => {
    expect(classifyMarketTimeTerms({ isCCAttached: true })).toBe(FB_TERMS.creditCard);
    // Structured signal wins even when the text reads like terms.
    expect(classifyMarketTimeTerms({ isCCAttached: true, paymentTerm: "Net 30" })).toBe(
      FB_TERMS.creditCard,
    );
  });

  it("treats a stored card token as a card", () => {
    expect(
      classifyMarketTimeTerms({ paymentToken: "*1284 12/19 David F Woolsey" }),
    ).toBe(FB_TERMS.creditCard);
  });

  it.each([
    ["Credit Card", 113],
    ["Visa", 46],
    ["VISA", 45],
    ["Master Card", 23],
    ["MasterCard", 0],
    ["American Express", 0],
    ["Discover", 0],
  ])("reads %j as a card", (text) => {
    expect(classifyMarketTimeTerms({ paymentTerm: text })).toBe(FB_TERMS.creditCard);
  });

  it.each([
    ["NET 30 HOSPITAL ONLY", 155],
    ["Net 30 Days", 35],
    ["Net 30", 33],
    ["NET30", 0],
  ])("reads %j as NET 30", (text) => {
    expect(classifyMarketTimeTerms({ paymentTerm: text })).toBe(FB_TERMS.net30);
  });

  // Abbreviated net terms — 22 orders in the sample were written this way and
  // used to fall through to the NET 30 default by accident rather than by rule.
  it.each(["N30 HOSP ONLY", "N/30", "N30 - CASINO"])(
    "reads the abbreviated %j as NET 30",
    (text) => {
      expect(classifyMarketTimeTerms({ paymentTerm: text })).toBe(FB_TERMS.net30);
    },
  );

  // The bug this catches: 23 orders are Net 45 or Net 60. Booking them NET 30
  // starts the invoice chase 15-30 days early.
  it("keeps longer net terms instead of flattening them to NET 30", () => {
    expect(classifyMarketTimeTerms({ paymentTerm: "Net 45" })).toBe(FB_TERMS.net45);
    expect(classifyMarketTimeTerms({ paymentTerm: "NET60" })).toBe(FB_TERMS.net60);
    expect(classifyMarketTimeTerms({ paymentTerm: "N/60" })).toBe(FB_TERMS.net60);
  });

  // NET 10/15/90/180 exist in Fishbowl but are switched off, so naming one
  // would hand the import a term it rejects.
  it.each(["NET 90", "Net 10", "NET 180"])(
    "refuses %j — the term is inactive in Fishbowl",
    (text) => {
      expect(classifyMarketTimeTerms({ paymentTerm: text })).toBeNull();
    },
  );

  // The whole point of returning null: "SEE NOTES" means a human wrote the real
  // terms somewhere else, and inventing one from it would be a guess.
  it.each(["SEE NOTES", "", "   ", "Prepaid via wire", "50/50"])(
    "refuses to classify %j",
    (text) => {
      expect(classifyMarketTimeTerms({ paymentTerm: text })).toBeNull();
    },
  );

  it("refuses when the field is absent entirely", () => {
    expect(classifyMarketTimeTerms({})).toBeNull();
    expect(classifyMarketTimeTerms({ paymentTerm: null, isCCAttached: false })).toBeNull();
  });

  // isCCAttached is false on 514 of 600 orders — a false must never be read as
  // "definitely not a card", only as "no structured signal".
  it("lets the text decide when isCCAttached is false", () => {
    expect(classifyMarketTimeTerms({ isCCAttached: false, paymentTerm: "Visa" })).toBe(
      FB_TERMS.creditCard,
    );
  });
});
