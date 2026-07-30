import { describe, it, expect } from "vitest";
import { mergeGroupsFor, properCase, splitContactName, stateCase } from "../mergeFields";

function customerLabels(channel: "wholesale" | "d2c" | "both"): string[] {
  const customer = mergeGroupsFor(channel).find((g) => g.group === "Customer");
  return customer ? customer.fields.map((f) => f.label) : [];
}

describe("splitContactName", () => {
  it("splits a D2C person into first + last", () => {
    expect(splitContactName("Jordan Rivera", "d2c")).toEqual({ firstName: "Jordan", lastName: "Rivera" });
  });

  it("keeps middle/compound surnames in lastName", () => {
    expect(splitContactName("Ana Maria De La Cruz", "d2c")).toEqual({
      firstName: "Ana",
      lastName: "Maria De La Cruz",
    });
  });

  it("gives a single-word D2C name an empty lastName", () => {
    expect(splitContactName("Cher", "d2c")).toEqual({ firstName: "Cher", lastName: "" });
  });

  it("never splits a wholesale company name", () => {
    expect(splitContactName("Sprout Health Foods", "wholesale")).toEqual({ firstName: "", lastName: "" });
  });

  it("is empty for a missing name", () => {
    expect(splitContactName(null, "d2c")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("mergeGroupsFor", () => {
  it("wholesale hides first/last name and labels the company", () => {
    const labels = customerLabels("wholesale");
    expect(labels).toContain("Company name");
    expect(labels).not.toContain("First name");
    expect(labels).not.toContain("Last name");
  });

  it("D2C shows first + last name and labels the full name", () => {
    const labels = customerLabels("d2c");
    expect(labels).toContain("First name");
    expect(labels).toContain("Last name");
    expect(labels).toContain("Full name");
  });

  it("both shows the union with the neutral customer-name label", () => {
    const labels = customerLabels("both");
    expect(labels).toEqual(expect.arrayContaining(["First name", "Last name", "Customer name"]));
  });

  it("always includes Sender and Date groups regardless of audience", () => {
    for (const ch of ["wholesale", "d2c", "both"] as const) {
      const groups = mergeGroupsFor(ch).map((g) => g.group);
      expect(groups).toContain("Sender");
      expect(groups).toContain("Date");
    }
  });
});

describe("properCase", () => {
  it("title-cases an ALL CAPS person name", () => {
    expect(properCase("JULIE EKELUND")).toBe("Julie Ekelund");
  });

  it("title-cases an all-lowercase name", () => {
    expect(properCase("julie ekelund")).toBe("Julie Ekelund");
  });

  it("leaves already-mixed-case data untouched", () => {
    expect(properCase("McDonald's Spa & Gift")).toBe("McDonald's Spa & Gift");
    expect(properCase("Julie Ekelund")).toBe("Julie Ekelund");
  });

  it("title-cases a company name and keeps business tokens uppercase", () => {
    expect(properCase("ACME GOODS CO.")).toBe("Acme Goods Co.");
    expect(properCase("SPROUT HEALTH LLC")).toBe("Sprout Health LLC");
  });

  it("keeps small words lowered mid-name but not at the start", () => {
    expect(properCase("HOUSE OF FRAGRANCE")).toBe("House of Fragrance");
    expect(properCase("THE SPA SHOP")).toBe("The Spa Shop");
  });

  it("capitalizes after hyphens, apostrophes, and initials", () => {
    expect(properCase("O'BRIEN-SMITH")).toBe("O'Brien-Smith");
    expect(properCase("J.B. HUNT")).toBe("J.B. Hunt");
  });

  it("handles Mc names", () => {
    expect(properCase("MCDONALD")).toBe("McDonald");
  });

  it("collapses whitespace and is empty-safe", () => {
    expect(properCase("  ACME   GOODS  ")).toBe("Acme Goods");
    expect(properCase(null)).toBe("");
    expect(properCase(undefined)).toBe("");
  });
});

describe("stateCase", () => {
  it("keeps two-letter codes uppercase", () => {
    expect(stateCase("ca")).toBe("CA");
    expect(stateCase("CA")).toBe("CA");
  });

  it("title-cases spelled-out state names", () => {
    expect(stateCase("CALIFORNIA")).toBe("California");
    expect(stateCase("NEW YORK")).toBe("New York");
  });

  it("is empty-safe", () => {
    expect(stateCase(null)).toBe("");
  });
});
