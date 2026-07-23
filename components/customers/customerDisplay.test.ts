import { describe, it, expect } from "vitest";
import {
  formatCompactCount,
  formatDate,
  formatMoney,
  formatShortDate,
} from "./customerDisplay";

describe("formatCompactCount", () => {
  it("uses 0.xk below one thousand", () => {
    expect(formatCompactCount(12)).toBe("0.0k");
    expect(formatCompactCount(362)).toBe("0.4k");
    expect(formatCompactCount(495)).toBe("0.5k");
  });

  it("collapses an empty result to a plain 0", () => {
    expect(formatCompactCount(0)).toBe("0");
  });

  it("rounds up to 1.0k just under the thousand mark", () => {
    // Consequence of one decimal place: 999 has nowhere else to go.
    expect(formatCompactCount(999)).toBe("1.0k");
  });

  it("abbreviates thousands with one decimal", () => {
    expect(formatCompactCount(1000)).toBe("1.0k");
    expect(formatCompactCount(1567)).toBe("1.6k");
    expect(formatCompactCount(2424)).toBe("2.4k");
    expect(formatCompactCount(3574)).toBe("3.6k");
  });

  it("rolls over to millions", () => {
    expect(formatCompactCount(1_000_000)).toBe("1.0M");
    expect(formatCompactCount(2_400_000)).toBe("2.4M");
  });
});

describe("formatMoney", () => {
  it("stays exact — revenue is deliberately not abbreviated", () => {
    expect(formatMoney(1840)).toBe("$1,840");
    expect(formatMoney(104300)).toBe("$104,300");
    expect(formatMoney(1_240_000)).toBe("$1,240,000");
  });

  it("renders an em dash for missing values, not $0", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
  });
});

describe("date formatting", () => {
  // Regression: new Date("2026-07-02") is UTC midnight, which renders as
  // Jul 1 in any timezone west of UTC. A date-only value must not shift.
  it("does not shift a date-only value by a day", () => {
    expect(formatShortDate("2026-07-02")).toBe("Jul 2, 26");
    expect(formatShortDate("2025-03-11")).toBe("Mar 11, 25");
    expect(formatShortDate("2023-09-30")).toBe("Sep 30, 23");
    expect(formatDate("2026-01-01")).toBe("1/1/2026");
  });

  it("still handles full timestamps", () => {
    expect(formatShortDate("2026-07-02T15:30:00Z")).toMatch(/Jul 2, 26|Jul 1, 26/);
  });

  it("renders an em dash when there is no date", () => {
    expect(formatShortDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});
