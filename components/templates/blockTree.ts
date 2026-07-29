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
