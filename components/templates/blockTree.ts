import type { EmailBlock } from "./types";

/**
 * Blocks form a shallow tree: top-level blocks, plus content blocks nested one
 * level deep inside section columns. These helpers keep selection and editing
 * working across both levels without the editor caring where a block lives.
 */

export function findBlock(blocks: EmailBlock[], id: string): EmailBlock | undefined {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.type === "section") {
      for (const c of b.columns) {
        const hit = c.blocks.find((x) => x.id === id);
        if (hit) return hit;
      }
    }
  }
  return undefined;
}

export function updateBlockInTree(blocks: EmailBlock[], updated: EmailBlock): EmailBlock[] {
  return blocks.map((b) => {
    if (b.id === updated.id) return updated;
    if (b.type === "section") {
      return {
        ...b,
        columns: b.columns.map((c) => ({
          ...c,
          blocks: c.blocks.map((x) => (x.id === updated.id ? updated : x)),
        })),
      };
    }
    return b;
  });
}

export function removeBlockFromTree(blocks: EmailBlock[], id: string): EmailBlock[] {
  return blocks
    .filter((b) => b.id !== id)
    .map((b) =>
      b.type === "section"
        ? { ...b, columns: b.columns.map((c) => ({ ...c, blocks: c.blocks.filter((x) => x.id !== id) })) }
        : b,
    );
}

export function addBlockToColumn(
  blocks: EmailBlock[],
  sectionId: string,
  colIndex: number,
  newBlock: EmailBlock,
): EmailBlock[] {
  return blocks.map((b) => {
    if (b.id !== sectionId || b.type !== "section") return b;
    return {
      ...b,
      columns: b.columns.map((c, i) => (i === colIndex ? { ...c, blocks: [...c.blocks, newBlock] } : c)),
    };
  });
}

/**
 * Move a block up/down wherever it lives — reorders among top-level blocks, or
 * within its section column if it's nested. Used by the canvas selection toolbar
 * so one control works for any block regardless of depth.
 */
export function moveBlockAnywhere(blocks: EmailBlock[], id: string, dir: -1 | 1): EmailBlock[] {
  const topIdx = blocks.findIndex((b) => b.id === id);
  if (topIdx >= 0) {
    const ni = topIdx + dir;
    if (ni < 0 || ni >= blocks.length) return blocks;
    const arr = [...blocks];
    [arr[topIdx], arr[ni]] = [arr[ni], arr[topIdx]];
    return arr;
  }
  for (const b of blocks) {
    if (b.type !== "section") continue;
    for (let ci = 0; ci < b.columns.length; ci++) {
      if (b.columns[ci].blocks.some((x) => x.id === id)) {
        return moveBlockInColumn(blocks, b.id, ci, id, dir);
      }
    }
  }
  return blocks;
}

/**
 * Move `draggedId` to sit before/after `targetId`, wherever the target lives —
 * top level or inside a section column. Powers drag-and-drop reordering, so it
 * handles cross-container drops too (e.g. dragging a text block into a column).
 * Sections can't nest, so a section dropped inside a column is rejected.
 */
export function reorderBlocks(
  blocks: EmailBlock[],
  draggedId: string,
  targetId: string,
  pos: "before" | "after",
): EmailBlock[] {
  if (draggedId === targetId) return blocks;
  const dragged = findBlock(blocks, draggedId);
  if (!dragged) return blocks;

  const targetTopLevel = blocks.some((b) => b.id === targetId);
  // A section can only live at the top level — never inside another section.
  if (dragged.type === "section" && !targetTopLevel) return blocks;
  // Don't drop a section onto something it contains.
  if (
    dragged.type === "section" &&
    dragged.columns.some((c) => c.blocks.some((x) => x.id === targetId))
  ) {
    return blocks;
  }

  // Pull the dragged block out of wherever it currently is.
  const next = removeBlockFromTree(blocks, draggedId);

  if (targetTopLevel) {
    const idx = next.findIndex((b) => b.id === targetId);
    if (idx < 0) return blocks;
    const at = pos === "after" ? idx + 1 : idx;
    return [...next.slice(0, at), dragged, ...next.slice(at)];
  }

  // Target is inside a section column — insert there.
  return next.map((b) => {
    if (b.type !== "section") return b;
    return {
      ...b,
      columns: b.columns.map((c) => {
        const idx = c.blocks.findIndex((x) => x.id === targetId);
        if (idx < 0) return c;
        const at = pos === "after" ? idx + 1 : idx;
        return { ...c, blocks: [...c.blocks.slice(0, at), dragged, ...c.blocks.slice(at)] };
      }),
    };
  });
}

/**
 * Insert a brand-new block before/after `targetId`, wherever the target lives
 * (top level or a section column). Powers dragging a block from the palette
 * onto a precise spot. Sections can only be inserted at the top level.
 */
export function insertNewBlock(
  blocks: EmailBlock[],
  newBlock: EmailBlock,
  targetId: string,
  pos: "before" | "after",
): EmailBlock[] {
  const targetTopLevel = blocks.some((b) => b.id === targetId);
  if (newBlock.type === "section" && !targetTopLevel) return blocks;

  if (targetTopLevel) {
    const idx = blocks.findIndex((b) => b.id === targetId);
    const at = pos === "after" ? idx + 1 : idx;
    return [...blocks.slice(0, at), newBlock, ...blocks.slice(at)];
  }

  return blocks.map((b) => {
    if (b.type !== "section") return b;
    return {
      ...b,
      columns: b.columns.map((c) => {
        const idx = c.blocks.findIndex((x) => x.id === targetId);
        if (idx < 0) return c;
        const at = pos === "after" ? idx + 1 : idx;
        return { ...c, blocks: [...c.blocks.slice(0, at), newBlock, ...c.blocks.slice(at)] };
      }),
    };
  });
}

export function moveBlockInColumn(
  blocks: EmailBlock[],
  sectionId: string,
  colIndex: number,
  blockId: string,
  dir: -1 | 1,
): EmailBlock[] {
  return blocks.map((b) => {
    if (b.id !== sectionId || b.type !== "section") return b;
    return {
      ...b,
      columns: b.columns.map((c, i) => {
        if (i !== colIndex) return c;
        const idx = c.blocks.findIndex((x) => x.id === blockId);
        const ni = idx + dir;
        if (idx < 0 || ni < 0 || ni >= c.blocks.length) return c;
        const arr = [...c.blocks];
        [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
        return { ...c, blocks: arr };
      }),
    };
  });
}
