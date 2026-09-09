import { describe, it, expect } from "vitest";
import { containsAsToken, safePoNeedle } from "../fishbowlReconcile";

/**
 * Every customerPO string below is a real value from this Fishbowl instance,
 * collected 2026-09-08 while chasing the Summer House double-ship.
 *
 * containsAsToken took over the job the MarketTime exact-total gate used to do:
 * stopping a plain numeric record id from matching a longer number that merely
 * contains it. If it is ever loosened, that collision comes back.
 */
describe("containsAsToken", () => {
  it.each([
    ["32617406-MKTTIME", "32617406"], // our own push
    ["32771822-MKTTIME-BO", "32771822"], // ops' backorder split
    ["32710843-BO", "32710843"],
    ["MYZCUWAEYR-FAIRE", "MYZCUWAEYR"], // our own Faire push
    ["MYZCUWAEYR", "MYZCUWAEYR"], // hand-keyed, bare
    ["#ZJUHGM7VPR", "ZJUHGM7VPR"], // ops' hash prefix
    ["XZQYTWKZNE-2", "XZQYTWKZNE"], // re-entry
    ["PGBS46D3NM-MISSHIP", "PGBS46D3NM"],
    ["CF4CFH49XR", "CF4CFH49XR"], // the MarketTime PO itself
  ])("matches %j against %j", (po, needle) => {
    expect(containsAsToken(po, needle)).toBe(true);
  });

  it("refuses a record id buried inside a longer number", () => {
    expect(containsAsToken("132617406", "32617406")).toBe(false);
    expect(containsAsToken("326174060", "32617406")).toBe(false);
    expect(containsAsToken("1326174060-MKTTIME", "32617406")).toBe(false);
  });

  it("refuses a ref buried inside a longer word", () => {
    expect(containsAsToken("XMYZCUWAEYR", "MYZCUWAEYR")).toBe(false);
    expect(containsAsToken("MYZCUWAEYRZ", "MYZCUWAEYR")).toBe(false);
  });

  it("finds a later occurrence when the first one is buried", () => {
    expect(containsAsToken("X32617406 / 32617406-BO", "32617406")).toBe(true);
  });

  it("is case-insensitive and safe on empty input", () => {
    expect(containsAsToken("myzcuwaeyr-faire", "MYZCUWAEYR")).toBe(true);
    expect(containsAsToken(null, "32617406")).toBe(false);
    expect(containsAsToken("32617406", "")).toBe(false);
  });
});

/**
 * The needle is interpolated into a server-built data-query, so it must carry
 * no quotes; it is also used in a LIKE, so it must carry no `%` or `_`.
 */
describe("safePoNeedle", () => {
  it.each(["CF4CFH49XR", "209-6646732X", "790668X", "MW8366088"])(
    "accepts the real PO %j",
    (po) => {
      expect(safePoNeedle(po)).toBe(po.toUpperCase());
    },
  );

  it("uppercases and trims", () => {
    expect(safePoNeedle("  cf4cfh49xr ")).toBe("CF4CFH49XR");
  });

  // One tuple type, not a union of them — `it.each` types the callback off the
  // array, and a mixed [string,…] | [null,…] makes the one-arg form unassignable.
  const REJECTED: Array<[string | null, string]> = [
    ["", "empty"],
    [null, "null"],
    ["1234", "too short to be distinctive"],
    ["229-4046147U'--", "quote/comment characters"],
    ["ABC%DEF", "LIKE wildcard %"],
    ["ABC_DEF", "LIKE wildcard _"],
    ["PO 12345", "a space"],
    ["-12345", "leading dash"],
  ];
  it.each(REJECTED)("rejects %j (%s)", (po) => {
    expect(safePoNeedle(po)).toBeNull();
  });
});
