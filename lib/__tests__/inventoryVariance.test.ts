import { describe, it, expect } from "vitest";
import {
  buildVarianceRows,
  sortByMagnitude,
  summarize,
  type FishbowlStock,
} from "../inventoryVariance";
import { rollUpSynapseInventory, type SynapseInventoryRow } from "../pointb";

const fb = (part: string, on_hand: number, over: Partial<FishbowlStock> = {}): FishbowlStock => ({
  part,
  description: "",
  uom: "ea",
  on_hand,
  ...over,
});

/** Shaped like the real rows: per item, per lot, per status. */
const syn = (
  item: string,
  qty: number,
  over: Partial<SynapseInventoryRow> = {},
): SynapseInventoryRow => ({
  item,
  lot: "(none)",
  uom: "EA",
  qty,
  inventoryStatus: "AV",
  inventoryStatusDesc: "Available",
  status: "A",
  statusDesc: "Available",
  ...over,
});

const rollup = (rows: SynapseInventoryRow[]) => rollUpSynapseInventory(rows);
const rowFor = (rows: ReturnType<typeof buildVarianceRows>, part: string) =>
  rows.find((r) => r.part === part)!;

describe("rollUpSynapseInventory", () => {
  // The real payload had 708 rows across 410 items — an item can hold several
  // lots and each is its own row.
  it("sums an item's lots into one line", () => {
    const s = rollup([
      syn("100-00-02", 58, { lot: "23034C" }),
      syn("100-00-02", 93, { lot: "25055D" }),
    ]);
    expect(s.get("100-00-02")!.physical).toBe(151);
    expect(s.get("100-00-02")!.lots).toBe(2);
  });

  // Committed rows carry a NEGATIVE qty. Letting them into `physical` would
  // under-report what's on the shelf and invent a variance against Fishbowl.
  it("keeps negative Committed rows out of physical stock", () => {
    const s = rollup([
      syn("A", 100),
      syn("A", -30, { status: "CM", statusDesc: "Committed" }),
    ]);
    const a = s.get("A")!;
    expect(a.physical).toBe(100);
    expect(a.committed).toBe(30);
    expect(a.net).toBe(70); // net still reflects the allocation
  });

  it("counts picked-not-shipped as still in the building", () => {
    const s = rollup([syn("A", 40), syn("A", 10, { status: "PN", statusDesc: "PickNotShipd" })]);
    expect(s.get("A")!.physical).toBe(50);
  });

  it("splits available from held (QC Hold / Suspense)", () => {
    const s = rollup([
      syn("A", 100),
      syn("A", 15, { inventoryStatus: "QC", inventoryStatusDesc: "QC Hold" }),
      syn("A", 5, { inventoryStatus: "SU", inventoryStatusDesc: "Suspense" }),
    ]);
    const a = s.get("A")!;
    expect(a.available).toBe(100);
    expect(a.held).toBe(20);
    expect(a.physical).toBe(120);
  });

  it("records every UOM it saw", () => {
    const s = rollup([syn("A", 10), syn("A", 2, { uom: "CS" })]);
    expect(s.get("A")!.uoms.sort()).toEqual(["CS", "EA"]);
  });
});

describe("buildVarianceRows", () => {
  it("reports a match as zero variance", () => {
    const rows = buildVarianceRows([fb("A", 100)], rollup([syn("A", 100)]));
    expect(rowFor(rows, "A").variance).toBe(0);
    expect(rowFor(rows, "A").flags).toEqual([]);
  });

  it("signs the variance from Point B's side", () => {
    // Point B holds more than Fishbowl believes → positive.
    expect(rowFor(buildVarianceRows([fb("A", 80)], rollup([syn("A", 100)])), "A").variance).toBe(20);
    // Fishbowl believes more than is on the shelf → negative.
    expect(rowFor(buildVarianceRows([fb("A", 120)], rollup([syn("A", 100)])), "A").variance).toBe(-20);
  });

  // "No row" and "a row that says zero" are different facts and only the second
  // is a counting discrepancy — so an absent part must never become a 0.
  it("never coerces a missing part to zero", () => {
    const onlyFb = rowFor(buildVarianceRows([fb("A", 10)], rollup([])), "A");
    expect(onlyFb.synapse).toBeNull();
    expect(onlyFb.variance).toBeNull();
    expect(onlyFb.flags).toContain("missing-in-synapse");

    const onlySyn = rowFor(buildVarianceRows([], rollup([syn("B", 10)])), "B");
    expect(onlySyn.fishbowl).toBeNull();
    expect(onlySyn.variance).toBeNull();
    expect(onlySyn.flags).toContain("missing-in-fishbowl");
  });

  it("distinguishes a genuine zero from a missing row", () => {
    const rows = buildVarianceRows([fb("A", 0)], rollup([syn("A", 0)]));
    expect(rowFor(rows, "A").variance).toBe(0);
    expect(rowFor(rows, "A").flags).toEqual([]);
  });

  // Adding Cases to Eaches produces a confident wrong number, so the line gets
  // flagged and no variance at all.
  it("refuses to compare a mixed-UOM part", () => {
    const rows = buildVarianceRows([fb("A", 10)], rollup([syn("A", 10), syn("A", 2, { uom: "CS" })]));
    expect(rowFor(rows, "A").flags).toContain("mixed-uom");
    expect(rowFor(rows, "A").variance).toBeNull();
  });

  it("flags held stock without suppressing the comparison", () => {
    const rows = buildVarianceRows(
      [fb("A", 100)],
      rollup([syn("A", 90), syn("A", 10, { inventoryStatus: "QC" })]),
    );
    const r = rowFor(rows, "A");
    expect(r.flags).toContain("held-stock");
    expect(r.variance).toBe(0); // 100 physical vs 100 on hand
    expect(r.synapseHeld).toBe(10);
  });

  it("matches parts case- and whitespace-insensitively", () => {
    const rows = buildVarianceRows([fb(" 100-00-01 ", 5)], rollup([syn("100-00-01", 5)]));
    expect(rows).toHaveLength(1);
    expect(rows[0].variance).toBe(0);
  });

  it("adds up a duplicated Fishbowl part rather than letting one win", () => {
    const rows = buildVarianceRows([fb("A", 10), fb("A", 15)], rollup([syn("A", 25)]));
    expect(rows).toHaveLength(1);
    expect(rowFor(rows, "A").fishbowl).toBe(25);
    expect(rowFor(rows, "A").variance).toBe(0);
  });

  it("computes the variance percentage off the Fishbowl figure", () => {
    expect(rowFor(buildVarianceRows([fb("A", 200)], rollup([syn("A", 250)])), "A").variancePct).toBe(25);
    // Dividing by a zero Fishbowl count would be Infinity, so it stays null.
    expect(rowFor(buildVarianceRows([fb("A", 0)], rollup([syn("A", 5)])), "A").variancePct).toBeNull();
  });
});

describe("sortByMagnitude", () => {
  it("puts the biggest disagreement first and agreements last", () => {
    const rows = buildVarianceRows(
      [fb("SMALL", 100), fb("BIG", 100), fb("AGREE", 50)],
      rollup([syn("SMALL", 105), syn("BIG", 400), syn("AGREE", 50)]),
    );
    expect(sortByMagnitude(rows).map((r) => r.part)).toEqual(["BIG", "SMALL", "AGREE"]);
  });

  it("keeps unmatched parts above the quiet agreements", () => {
    const rows = buildVarianceRows([fb("AGREE", 5), fb("ORPHAN", 9)], rollup([syn("AGREE", 5)]));
    expect(sortByMagnitude(rows)[0].part).toBe("ORPHAN");
  });
});

describe("summarize", () => {
  it("counts only comparable parts as compared", () => {
    const rows = buildVarianceRows(
      [fb("OK", 10), fb("DIFF", 10), fb("ORPHAN", 1)],
      rollup([syn("OK", 10), syn("DIFF", 14), syn("EXTRA", 3)]),
    );
    const s = summarize(rows);
    expect(s.compared).toBe(2);
    expect(s.inAgreement).toBe(1);
    expect(s.differing).toBe(1);
    expect(s.missingInSynapse).toBe(1); // ORPHAN
    expect(s.missingInFishbowl).toBe(1); // EXTRA
    expect(s.totalAbsVariance).toBe(4);
  });

  it("totals each side over everything it holds, matched or not", () => {
    const rows = buildVarianceRows([fb("A", 10), fb("B", 5)], rollup([syn("A", 12)]));
    const s = summarize(rows);
    expect(s.fishbowlTotal).toBe(15);
    expect(s.synapseTotal).toBe(12);
  });

  it("is all zeros for no data", () => {
    const s = summarize([]);
    expect(s.compared).toBe(0);
    expect(s.totalAbsVariance).toBe(0);
  });
});
