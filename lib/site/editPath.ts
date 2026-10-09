import type { PageBlock } from "./pageBlocks";

/**
 * On-page editing (the store's edit bridge) reports a typed change as a
 * field path inside a block — "heading", "items.2.label", "tiles.0.image"
 * (store src/lib/fmg/editAttrs.ts). Returns a copy of `block` with that
 * string field replaced, or null when the path doesn't name an existing
 * string field (never creates fields or list items). The save normalizes the
 * value like any other edit.
 */
export function setBlockPath<T extends PageBlock>(block: T, path: string, value: string): T | null {
  const keys = path.split(".");
  if (!keys.length || keys.some((k) => !k || k === "id" || k === "type" || k === "__proto__")) return null;
  const set = (node: unknown, i: number): unknown => {
    const key = keys[i];
    const last = i === keys.length - 1;
    if (Array.isArray(node)) {
      if (!/^\d+$/.test(key)) return undefined;
      const n = Number(key);
      if (n >= node.length) return undefined;
      const child = last ? (typeof node[n] === "string" ? value : undefined) : set(node[n], i + 1);
      if (child === undefined) return undefined;
      const copy = [...node];
      copy[n] = child;
      return copy;
    }
    if (node && typeof node === "object" && Object.prototype.hasOwnProperty.call(node, key)) {
      const cur = (node as Record<string, unknown>)[key];
      const child = last ? (typeof cur === "string" ? value : undefined) : set(cur, i + 1);
      if (child === undefined) return undefined;
      return { ...(node as Record<string, unknown>), [key]: child };
    }
    return undefined;
  };
  const out = set(block, 0);
  return out === undefined ? null : (out as T);
}

/** The string at `path` (for image fields shown in the picker). */
export function getBlockPath(block: PageBlock, path: string): string | null {
  let node: unknown = block;
  for (const key of path.split(".")) {
    if (Array.isArray(node) && /^\d+$/.test(key)) node = node[Number(key)];
    else if (node && typeof node === "object" && Object.prototype.hasOwnProperty.call(node, key))
      node = (node as Record<string, unknown>)[key];
    else return null;
  }
  return typeof node === "string" ? node : null;
}
