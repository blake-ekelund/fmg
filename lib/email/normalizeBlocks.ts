/**
 * Turn arbitrary (AI- or import-produced) JSON into a valid `EmailBlock[]` the
 * editor and `renderBlocks` can render without choking.
 *
 * The contract the rest of the app relies on: whatever goes in, what comes out
 * is ALWAYS a well-formed block array — every block a known type, every field
 * present and the right primitive, sections carrying real columns, ids unique.
 * This is what lets an AI (which will occasionally hallucinate a field or drop
 * one) drive the block builder safely.
 *
 * Strategy: for each block we start from `createDefaultBlock(type)` — a fully
 * valid default — and overlay ONLY the keys that default already defines,
 * coerced to the default's primitive type. Unknown keys are dropped; missing
 * keys keep their default. Sections recurse into columns. Nothing here trusts
 * the input's shape.
 */

import {
  createDefaultBlock,
  createSectionPreset,
  newBlockId,
  type BlockType,
  type EmailBlock,
  type SectionBlock,
  type SectionColumn,
  type VAlign,
} from "@/components/templates/types";

const KNOWN_TYPES: BlockType[] = [
  "header", "text", "image", "button", "divider", "spacer",
  "columns", "product", "social", "hero", "caption", "promotion", "section",
];

type Raw = Record<string, unknown>;

const asObj = (v: unknown): Raw | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null);

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}
function enumOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
const VALIGNS = ["top", "middle", "bottom"] as const;

/** Coerce a raw value to match the shape/type of a default value. */
function coerceLike(def: unknown, raw: unknown, key: string): unknown {
  // image.width is a union of preset keywords or a 1–100 number.
  if (key === "width") {
    if (typeof raw === "number" && Number.isFinite(raw)) return Math.min(100, Math.max(5, Math.round(raw)));
    return enumOf(raw, ["full", "half", "third"] as const, "full");
  }
  if (typeof def === "number") return num(raw, def);
  if (typeof def === "boolean") return bool(raw, def);
  if (typeof def === "string") return str(raw, def);
  if (Array.isArray(def)) {
    // Only the columns block carries an array (its `items`).
    if (!Array.isArray(raw)) return def;
    return raw.slice(0, 4).map((it) => {
      const o = asObj(it) ?? {};
      return { heading: str(o.heading), text: str(o.text), imageUrl: str(o.imageUrl) };
    });
  }
  return def;
}

/** Copy an optional numeric field (e.g. marginTop) only if it's a real number. */
function copyOptionalNumber(out: Raw, raw: Raw, key: string): void {
  if (typeof raw[key] === "number" && Number.isFinite(raw[key] as number)) out[key] = raw[key];
  else if (typeof raw[key] === "string" && raw[key] !== "" && Number.isFinite(Number(raw[key]))) out[key] = Number(raw[key]);
}

function normalizeColumn(raw: unknown): SectionColumn {
  const c = asObj(raw) ?? {};
  return {
    id: str(c.id) || newBlockId(),
    weight: Math.max(1, num(c.weight, 1)),
    bgColor: str(c.bgColor, ""),
    verticalAlign: enumOf<VAlign>(c.verticalAlign, VALIGNS, "middle"),
    padding: Math.max(0, num(c.padding, 12)),
    // Columns hold content blocks only — never nested sections.
    blocks: normalizeBlocks(c.blocks).filter((b) => b.type !== "section"),
  };
}

function normalizeSection(raw: Raw): SectionBlock {
  const base = createSectionPreset("twoCol");
  const out: SectionBlock = {
    ...base,
    id: str(raw.id) || base.id,
    bgColor: str(raw.bgColor, ""),
    bgImage: str(raw.bgImage, ""),
    padding: Math.max(0, num(raw.padding, 24)),
    gap: Math.max(0, num(raw.gap, 20)),
    stackOnMobile: bool(raw.stackOnMobile, true),
    verticalAlign: enumOf<VAlign>(raw.verticalAlign, VALIGNS, "middle"),
    columns: [],
  };
  const rawCols = Array.isArray(raw.columns) ? raw.columns : [];
  out.columns = rawCols.slice(0, 3).map(normalizeColumn);
  if (out.columns.length === 0) out.columns = [normalizeColumn({})];
  copyOptionalNumber(out as unknown as Raw, raw, "marginTop");
  copyOptionalNumber(out as unknown as Raw, raw, "marginBottom");
  return out;
}

function normalizeOne(raw: unknown): EmailBlock | null {
  const o = asObj(raw);
  if (!o) return null;
  const type = o.type;
  if (typeof type !== "string" || !KNOWN_TYPES.includes(type as BlockType)) return null;
  if (type === "section") return normalizeSection(o);

  const base = createDefaultBlock(type as BlockType) as unknown as Raw;
  const out: Raw = { ...base };
  out.id = typeof o.id === "string" && o.id.trim() ? o.id : (base.id as string);
  for (const key of Object.keys(base)) {
    if (key === "id" || key === "type") continue;
    if (!(key in o)) continue;
    out[key] = coerceLike(base[key], o[key], key);
  }
  // Optional fields that aren't part of every default.
  copyOptionalNumber(out, o, "marginTop");
  copyOptionalNumber(out, o, "marginBottom");
  if (!("fontSize" in base)) copyOptionalNumber(out, o, "fontSize");
  if (!("fontFamily" in base) && typeof o.fontFamily === "string" && ["sans", "serif", "mono"].includes(o.fontFamily)) {
    out.fontFamily = o.fontFamily;
  }
  return out as unknown as EmailBlock;
}

/** Normalize a raw array (anything) into valid blocks with unique ids. */
export function normalizeBlocks(raw: unknown): EmailBlock[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: EmailBlock[] = [];
  for (const item of raw) {
    const b = normalizeOne(item);
    if (!b) continue;
    if (seen.has(b.id)) b.id = newBlockId();
    seen.add(b.id);
    out.push(b);
  }
  return out;
}
