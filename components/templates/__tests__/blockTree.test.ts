import { describe, it, expect } from "vitest";
import { reorderBlocks, insertNewBlock } from "../blockTree";
import { createDefaultBlock, createSectionPreset } from "../types";
import type { EmailBlock, SectionBlock } from "../types";

const tb = (id: string): EmailBlock => ({ ...createDefaultBlock("text"), id }) as EmailBlock;
const ids = (bs: EmailBlock[]) => bs.map((b) => b.id);

describe("reorderBlocks", () => {
  it("moves a top-level block after another", () => {
    const out = reorderBlocks([tb("a"), tb("b"), tb("c")], "a", "c", "after");
    expect(ids(out)).toEqual(["b", "c", "a"]);
  });

  it("moves a top-level block before another", () => {
    const out = reorderBlocks([tb("a"), tb("b"), tb("c")], "c", "a", "before");
    expect(ids(out)).toEqual(["c", "a", "b"]);
  });

  it("is a no-op when dragged and target are the same", () => {
    const blocks = [tb("a"), tb("b")];
    expect(reorderBlocks(blocks, "a", "a", "before")).toBe(blocks);
  });

  it("drops a top-level block into a section column", () => {
    const sec = createSectionPreset("twoCol") as SectionBlock;
    const targetId = sec.columns[0].blocks[0].id;
    const out = reorderBlocks([tb("a"), sec], "a", targetId, "before");

    // "a" left the top level…
    expect(out.some((b) => b.id === "a")).toBe(false);
    // …and landed in the first column, before the target.
    const outSec = out.find((b) => b.type === "section") as SectionBlock;
    expect(outSec.columns[0].blocks[0].id).toBe("a");
    expect(outSec.columns[0].blocks[1].id).toBe(targetId);
  });

  it("refuses to nest a section inside a column", () => {
    const sec = createSectionPreset("twoCol") as SectionBlock;
    const targetId = sec.columns[0].blocks[0].id;
    const other = createSectionPreset("band") as SectionBlock;
    const blocks = [other, sec];
    // Dragging a whole section onto a nested block is rejected (no nesting).
    expect(reorderBlocks(blocks, other.id, targetId, "before")).toBe(blocks);
  });
});

describe("insertNewBlock (palette drag)", () => {
  it("inserts a new block before a top-level target", () => {
    const nb = { ...createDefaultBlock("button"), id: "new" } as EmailBlock;
    const out = insertNewBlock([tb("a"), tb("b")], nb, "b", "before");
    expect(ids(out)).toEqual(["a", "new", "b"]);
  });

  it("inserts a new block after a top-level target", () => {
    const nb = { ...createDefaultBlock("button"), id: "new" } as EmailBlock;
    const out = insertNewBlock([tb("a"), tb("b")], nb, "a", "after");
    expect(ids(out)).toEqual(["a", "new", "b"]);
  });

  it("inserts a new block into a section column at the target", () => {
    const sec = createSectionPreset("twoCol") as SectionBlock;
    const targetId = sec.columns[1].blocks[0].id;
    const nb = { ...createDefaultBlock("image"), id: "img" } as EmailBlock;
    const out = insertNewBlock([sec], nb, targetId, "after");
    const outSec = out.find((b) => b.type === "section") as SectionBlock;
    expect(outSec.columns[1].blocks.map((b) => b.id)).toEqual([targetId, "img"]);
  });
});
