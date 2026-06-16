import { describe, expect, it } from "vitest";

import {
  composeDisplayName,
  diffCopyImport,
  groupChangesByPart,
  normalizeHexColor,
  type CopyRow,
  type EditableKey,
} from "../copySheet";

function row(overrides: Partial<CopyRow> & { part: string }): CopyRow {
  return {
    brand: "Sassy",
    is_tester: false,
    display_name: null,
    product_name: null,
    product_form: null,
    subtitle: null,
    infused_with: null,
    category_path: null,
    note_top: null,
    note_mid: null,
    note_dry: null,
    short_description: null,
    long_description: null,
    benefits: null,
    ingredients_text: null,
    how_to_use: null,
    retailer_notes: null,
    page_bg_color: null,
    page_text_color: null,
    page_heading_color: null,
    page_accent_color: null,
    ...overrides,
  };
}

describe("normalizeHexColor", () => {
  it("normalizes bare and shorthand hex to lowercase #rrggbb", () => {
    expect(normalizeHexColor("FCEB80")).toBe("#fceb80");
    expect(normalizeHexColor(" #E7488F ")).toBe("#e7488f");
    expect(normalizeHexColor("#abc")).toBe("#aabbcc");
    expect(normalizeHexColor("abc")).toBe("#aabbcc");
  });

  it("rejects invalid values", () => {
    expect(normalizeHexColor("")).toBeNull();
    expect(normalizeHexColor("hot pink")).toBeNull();
    expect(normalizeHexColor("#12345")).toBeNull();
    expect(normalizeHexColor("#12345g")).toBeNull();
  });
});

describe("composeDisplayName", () => {
  it("composes Sassy as name – form with an en dash", () => {
    expect(
      composeDisplayName({ brand: "Sassy", product_name: "Glow Up", product_form: "Mini Hand Crème" })
    ).toBe("Glow Up – Mini Hand Crème");
  });

  it("returns empty for Sassy when either part is missing", () => {
    expect(composeDisplayName({ brand: "Sassy", product_name: "Glow Up" })).toBe("");
    expect(composeDisplayName({ brand: "Sassy", product_form: "Mini Hand Crème" })).toBe("");
  });

  it("composes NI from the form with a TESTER prefix when flagged", () => {
    expect(composeDisplayName({ brand: "NI", product_form: "Body Butter" })).toBe("Body Butter");
    expect(
      composeDisplayName({ brand: "NI", product_form: "Body Butter", is_tester: true })
    ).toBe("TESTER Body Butter");
  });
});

describe("diffCopyImport", () => {
  const presentKeys: EditableKey[] = [
    "subtitle",
    "short_description",
    "page_bg_color",
  ];

  it("reports only real changes", () => {
    const current = [
      row({ part: "A", subtitle: "Same", short_description: "Old hook", page_bg_color: "#fceb80" }),
    ];
    const plan = diffCopyImport(current, {
      presentKeys,
      rows: [
        {
          part: "A",
          values: { subtitle: "Same", short_description: "New hook", page_bg_color: "#FCEB80" },
        },
      ],
    });

    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({
      part: "A",
      key: "short_description",
      from: "Old hook",
      to: "New hook",
    });
    expect(plan.issues).toHaveLength(0);
    expect(plan.touchedParts).toEqual(["A"]);
  });

  it("treats a blank cell in a present column as a clear", () => {
    const current = [row({ part: "A", subtitle: "Bye" })];
    const plan = diffCopyImport(current, {
      presentKeys,
      rows: [{ part: "A", values: { subtitle: "  " } }],
    });
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({ key: "subtitle", from: "Bye", to: null });
  });

  it("leaves fields alone when their column is absent from the file", () => {
    const current = [row({ part: "A", subtitle: "Keep me" })];
    const plan = diffCopyImport(current, {
      presentKeys: ["short_description"],
      rows: [{ part: "A", values: { short_description: "New" } }],
    });
    expect(plan.changes.map((c) => c.key)).toEqual(["short_description"]);
  });

  it("flags unknown SKUs and duplicate rows as issues", () => {
    const current = [row({ part: "A" })];
    const plan = diffCopyImport(current, {
      presentKeys,
      rows: [
        { part: "A", values: { subtitle: "x" } },
        { part: "A", values: { subtitle: "y" } },
        { part: "GHOST", values: { subtitle: "z" } },
      ],
    });
    expect(plan.changes).toHaveLength(1); // first A row wins
    expect(plan.changes[0]).toMatchObject({ part: "A", to: "x" });
    expect(plan.issues).toHaveLength(2);
  });

  it("skips invalid colors with an issue but keeps the row's other edits", () => {
    const current = [row({ part: "A" })];
    const plan = diffCopyImport(current, {
      presentKeys,
      rows: [{ part: "A", values: { subtitle: "ok", page_bg_color: "bright yellow" } }],
    });
    expect(plan.changes.map((c) => c.key)).toEqual(["subtitle"]);
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0].message).toContain("hex color");
  });

  it("normalizes line endings and preserves interior newlines", () => {
    const current = [row({ part: "A" })];
    const plan = diffCopyImport(current, {
      presentKeys: ["benefits"],
      rows: [{ part: "A", values: { benefits: "Hydrating\r\nFast-absorbing\r\n" } }],
    });
    expect(plan.changes[0].to).toBe("Hydrating\nFast-absorbing");
  });

  it("recomposes display_name when name parts change (Sassy)", () => {
    const current = [
      row({
        part: "A",
        brand: "Sassy",
        product_name: "Glow Up",
        product_form: "Mini Hand Crème",
        display_name: "Glow Up – Mini Hand Crème",
      }),
    ];
    const plan = diffCopyImport(current, {
      presentKeys: ["product_name"],
      rows: [{ part: "A", values: { product_name: "Boss Babe" } }],
    });
    expect(plan.changes.map((c) => c.key)).toEqual(["product_name", "display_name"]);
    expect(plan.changes[1].to).toBe("Boss Babe – Mini Hand Crème");
  });

  it("keeps the legacy display_name when composition comes up empty", () => {
    const current = [
      row({ part: "A", brand: "Sassy", display_name: "Legacy Name", product_form: "Crème" }),
    ];
    const plan = diffCopyImport(current, {
      presentKeys: ["product_form"],
      rows: [{ part: "A", values: { product_form: "" } }],
    });
    // form cleared, but no name → composed "" → display_name untouched
    expect(plan.changes.map((c) => c.key)).toEqual(["product_form"]);
  });
});

describe("groupChangesByPart", () => {
  it("routes changes to inventory, notes, and media buckets", () => {
    const current = [row({ part: "A", brand: "NI" })];
    const plan = diffCopyImport(current, {
      presentKeys: ["subtitle", "note_top", "benefits", "page_accent_color"],
      rows: [
        {
          part: "A",
          values: {
            subtitle: "Sub",
            note_top: "citrus",
            benefits: "Soft skin",
            page_accent_color: "#2D6E73",
          },
        },
      ],
    });

    const grouped = groupChangesByPart(plan.changes);
    const a = grouped.get("A")!;
    expect(a.inventory).toEqual({ subtitle: "Sub", page_accent_color: "#2d6e73" });
    expect(a.notes).toEqual({ top: "citrus" });
    expect(a.media).toEqual({ benefits: "Soft skin" });
  });
});
