import { describe, it, expect } from "vitest";
import { draftProposedChart, parseAccountListing, qboImportRows, qboType, splitNumber } from "../coa";

const FB = "DO NOT MODIFY WITHOUT CHANGING FROM DEFAULT IN FISHBOWL INVENTORY.";

/* Shaped like QuickBooks Desktop's Account Listing export: blank spacer columns. */
const rows: unknown[][] = [
  ["", "", "Account", "", "Type", "", "Balance Total", "", "Description", "", "Accnt. #", "", "Tax Line"],
  ["", "", "12101 · Inventory Asset", "", "Other Current Asset", "", 409025.32, "", FB, "", "12101", "", ""],
  ["", "", "Accounts Receivable", "", "Accounts Receivable", "", 120799.49, "", FB, "", "", "", ""],
  ["", "", "20060 - BONVOY AMEX 71007", "", "Credit Card", "", 2984, "", "", "", "", "", ""],
  ["", "", "40000 · Gross Sales", "", "Income", "", "", "", "", "", "40000", "", ""],
  ["", "", "40000 · Gross Sales:40200 · Tester Sales", "", "Income", "", "", "", "", "", "40200", "", ""],
  ["", "", "41500 · Uncategorized Income", "", "Income", "", "", "", "", "", "41500", "", ""],
  ["", "", "49900 · *Uncategorized Income", "", "Income", "", "", "", "", "", "49900", "", ""],
  ["", "", "50000 · COGS", "", "Cost of Goods Sold", "", "", "", FB, "", "50000", "", ""],
  ["", "", "69300 · Ask Julie", "", "Expense", "", "", "", "", "", "69300", "", ""],
  ["", "", "FB Mapping Issue PL", "", "Income", "", "", "", "", "", "", "", ""],
];

describe("splitNumber", () => {
  it("splits QuickBooks' number · name and the odd hyphen form", () => {
    expect(splitNumber("40000 · Gross Sales")).toEqual({ number: "40000", name: "Gross Sales" });
    expect(splitNumber("20060 - BONVOY AMEX 71007")).toEqual({ number: "20060", name: "BONVOY AMEX 71007" });
    expect(splitNumber("Accounts Receivable")).toEqual({ number: null, name: "Accounts Receivable" });
  });
});

describe("parseAccountListing", () => {
  const cur = parseAccountListing(rows);
  it("reads every account with parent, type, balance and number", () => {
    expect(cur).toHaveLength(10);
    const tester = cur.find((c) => c.name === "Tester Sales")!;
    expect(tester).toMatchObject({ number: "40200", parent: "Gross Sales", fullName: "Gross Sales:Tester Sales", type: "Income", balance: null });
    expect(cur.find((c) => c.name === "Inventory Asset")?.balance).toBeCloseTo(409025.32);
  });
  it("flags Fishbowl default accounts and shortens their boilerplate", () => {
    const inv = cur.find((c) => c.name === "Inventory Asset")!;
    expect(inv.fishbowlDefault).toBe(true);
    expect(inv.description).toBe("Fishbowl default account");
  });
  it("refuses a file without the Account / Type header", () => {
    expect(() => parseAccountListing([["foo"], ["bar"]])).toThrow(/Account Listing/);
  });
});

describe("draftProposedChart", () => {
  const cur = parseAccountListing(rows);
  const p = draftProposedChart(cur);

  it("accounts for every current account exactly once as a source", () => {
    const covered = p.flatMap((x) => x.mapsFrom);
    for (const c of cur) expect(covered).toContain(c.fullName);
  });

  it("splits Sales and COGS by business unit, and nothing else", () => {
    const fresh = p.filter((x) => x.status === "new" && x.businessUnit);
    expect(fresh.map((x) => `${x.parent}:${x.name}`)).toEqual([
      "Gross Sales:Sales - FMG",
      "Gross Sales:Sales - Natural Inspirations",
      "Gross Sales:Sales - Sassy and Co",
      "COGS:COGS - FMG",
      "COGS:COGS - Natural Inspirations",
      "COGS:COGS - Sassy and Co",
    ]);
  });

  it("merges duplicate uncategorized accounts into QBO's own and retires suspense", () => {
    const unc = p.find((x) => x.name === "Uncategorized Income" && x.status === "new")!;
    expect(unc.mapsFrom.sort()).toEqual(["*Uncategorized Income", "Uncategorized Income"]);
    expect(p.find((x) => x.name === "Ask Julie")?.status).toBe("merge");
    expect(p.find((x) => x.name === "FB Mapping Issue PL")?.status).toBe("retire");
  });

  it("uses QBO type names and leaves merged/retired accounts out of the import", () => {
    expect(qboType("Other Current Asset")).toBe("Other Current Assets");
    const imp = qboImportRows(p);
    expect(imp[0]).toEqual(["Account Number", "Account Name", "Type", "Detail Type"]);
    expect(imp.some((r) => r[1] === "Ask Julie")).toBe(false);
    expect(imp.some((r) => r[1] === "Gross Sales:Sales - Sassy and Co")).toBe(true);
  });
});
