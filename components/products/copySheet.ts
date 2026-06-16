/* ════════════════════════════════════════════════════════════
   Product copy sheet — shared spec + pure logic

   One row per FG product, one column per storefront copy field
   (plus the three page colors). Used by the Excel export to lay
   out the workbook and by the import to map headers back to
   fields and diff against the database.

   Pure module on purpose: no React, no Supabase, no ExcelJS —
   everything here is unit-testable in node.
   ════════════════════════════════════════════════════════════ */

export type CopyColumnKind =
  | "key" // SKU — matches rows to products, never written
  | "context" // exported for orientation, ignored on import
  | "text" // editable copy
  | "color"; // editable #rrggbb

export type CopyColumn = {
  key: string;
  header: string;
  kind: CopyColumnKind;
  width: number;
  wrap?: boolean;
};

export const COPY_COLUMNS: CopyColumn[] = [
  { key: "part", header: "SKU", kind: "key", width: 14 },
  { key: "brand", header: "Brand", kind: "context", width: 8 },
  { key: "display_name", header: "Display Name (auto)", kind: "context", width: 34 },
  { key: "product_name", header: "Product Name", kind: "text", width: 20 },
  { key: "product_form", header: "Form / Format", kind: "text", width: 22 },
  { key: "subtitle", header: "Subtitle", kind: "text", width: 28 },
  { key: "infused_with", header: "Infused With", kind: "text", width: 24 },
  { key: "category_path", header: "Category Path", kind: "text", width: 28 },
  { key: "note_top", header: "Notes - Top", kind: "text", width: 20 },
  { key: "note_mid", header: "Notes - Mid", kind: "text", width: 20 },
  { key: "note_dry", header: "Notes - Dry", kind: "text", width: 20 },
  { key: "short_description", header: "Short Description", kind: "text", width: 48, wrap: true },
  { key: "long_description", header: "Long Description", kind: "text", width: 60, wrap: true },
  { key: "benefits", header: "Benefits (one per line)", kind: "text", width: 40, wrap: true },
  { key: "ingredients_text", header: "Ingredients", kind: "text", width: 60, wrap: true },
  { key: "how_to_use", header: "How To Use", kind: "text", width: 40, wrap: true },
  { key: "retailer_notes", header: "Retailer Notes (internal)", kind: "text", width: 40, wrap: true },
  { key: "page_bg_color", header: "Background Color", kind: "color", width: 17 },
  { key: "page_text_color", header: "Body Color", kind: "color", width: 17 },
  { key: "page_heading_color", header: "Headline Color", kind: "color", width: 17 },
  { key: "page_accent_color", header: "Accent Color", kind: "color", width: 17 },
];

/** Keys the import is allowed to write. */
export type EditableKey =
  | "product_name"
  | "product_form"
  | "subtitle"
  | "infused_with"
  | "category_path"
  | "note_top"
  | "note_mid"
  | "note_dry"
  | "short_description"
  | "long_description"
  | "benefits"
  | "ingredients_text"
  | "how_to_use"
  | "retailer_notes"
  | "page_bg_color"
  | "page_text_color"
  | "page_heading_color"
  | "page_accent_color";

/** media_kit_products columns (vs inventory_products / metafields.notes). */
export const MEDIA_KEYS: EditableKey[] = [
  "short_description",
  "long_description",
  "benefits",
  "ingredients_text",
  "how_to_use",
  "retailer_notes",
];

export const NOTE_KEYS: EditableKey[] = ["note_top", "note_mid", "note_dry"];

const COLOR_KEYS: EditableKey[] = [
  "page_bg_color",
  "page_text_color",
  "page_heading_color",
  "page_accent_color",
];

/** One product, flattened to sheet shape. Null = field empty. */
export type CopyRow = {
  part: string;
  brand: string;
  is_tester: boolean;
  display_name: string | null;
} & Record<EditableKey, string | null>;

/** A parsed sheet row: raw cell text per column key that was present. */
export type ParsedRow = { part: string; values: Partial<Record<EditableKey, string>> };

export type FieldChange = {
  part: string;
  key: EditableKey | "display_name";
  header: string;
  from: string | null;
  to: string | null;
};

export type ImportIssue = { part: string | null; message: string };

export type ImportPlan = {
  changes: FieldChange[];
  issues: ImportIssue[];
  /** Parts with at least one change, in sheet order. */
  touchedParts: string[];
};

/* ── Hex colors ─────────────────────────────────────────────── */

/** Normalize a hand-typed hex ("FCEB80", "#abc") to lowercase #rrggbb, or null. */
export function normalizeHexColor(raw: string): string | null {
  let v = raw.trim().toLowerCase();
  if (!v) return null;
  if (!v.startsWith("#")) v = `#${v}`;
  if (/^#[0-9a-f]{3}$/.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

/* ── Display name composition (brand conventions) ───────────── */

/**
 * Storefronts parse display_name with brand conventions, so it is always
 * composed, never hand-edited:
 *   Sassy — "{product_name} – {product_form}" (en dash)
 *   NI    — "{product_form}", "TESTER {product_form}" when is_tester
 * Returns "" when the needed parts are missing (legacy rows keep their
 * existing display_name).
 */
export function composeDisplayName(p: {
  brand: string;
  product_name?: string | null;
  product_form?: string | null;
  is_tester?: boolean;
}): string {
  const name = p.product_name?.trim();
  const form = p.product_form?.trim();
  if (p.brand === "Sassy") {
    return name && form ? `${name} – ${form}` : "";
  }
  return form ? `${p.is_tester ? "TESTER " : ""}${form}` : "";
}

/* ── Import diff ────────────────────────────────────────────── */

function cleanText(raw: string): string | null {
  const v = raw.replace(/\r\n/g, "\n").trim();
  return v === "" ? null : v;
}

function headerToKey(header: string): string | null {
  const norm = header.trim().toLowerCase();
  const col = COPY_COLUMNS.find(
    (c) => c.header.toLowerCase() === norm || c.key === norm
  );
  return col ? col.key : null;
}

/** Map a sheet header row to column keys (null for unrecognized headers). */
export function mapHeaders(headers: string[]): (string | null)[] {
  return headers.map(headerToKey);
}

/**
 * Diff parsed sheet rows against current DB rows.
 *
 * Semantics:
 * - A column missing from the file is left untouched on every product.
 * - A blank cell in a present column clears that field (shown in the
 *   preview, nothing applies silently).
 * - Color cells are normalized; invalid values become issues and skip.
 * - product_name / product_form changes recompose display_name.
 */
export function diffCopyImport(
  current: CopyRow[],
  parsed: { rows: ParsedRow[]; presentKeys: EditableKey[] }
): ImportPlan {
  const changes: FieldChange[] = [];
  const issues: ImportIssue[] = [];
  const touched: string[] = [];

  const byPart = new Map(current.map((r) => [r.part, r]));
  const seen = new Set<string>();
  const headerFor = (key: string) =>
    COPY_COLUMNS.find((c) => c.key === key)?.header ?? key;

  for (const row of parsed.rows) {
    const part = row.part.trim();
    if (!part) continue;

    if (seen.has(part)) {
      issues.push({ part, message: "Duplicate row in file — only the first was used." });
      continue;
    }
    seen.add(part);

    const cur = byPart.get(part);
    if (!cur) {
      issues.push({ part, message: "SKU not found — row skipped. (The sheet can't create products.)" });
      continue;
    }

    const rowChanges: FieldChange[] = [];
    const next: Partial<Record<EditableKey, string | null>> = {};

    for (const key of parsed.presentKeys) {
      const raw = row.values[key];
      if (raw === undefined) continue;

      let to: string | null;
      if (COLOR_KEYS.includes(key)) {
        if (raw.trim() === "") {
          to = null;
        } else {
          const normalized = normalizeHexColor(raw);
          if (!normalized) {
            issues.push({
              part,
              message: `${headerFor(key)}: "${raw.trim()}" is not a hex color — cell skipped.`,
            });
            continue;
          }
          to = normalized;
        }
      } else {
        to = cleanText(raw);
      }

      const from = cur[key] ?? null;
      if (from === to) continue;

      next[key] = to;
      rowChanges.push({ part, key, header: headerFor(key), from, to });
    }

    // Name parts changed → recompose display_name with the brand convention.
    if (next.product_name !== undefined || next.product_form !== undefined) {
      const composed = composeDisplayName({
        brand: cur.brand,
        is_tester: cur.is_tester,
        product_name: next.product_name !== undefined ? next.product_name : cur.product_name,
        product_form: next.product_form !== undefined ? next.product_form : cur.product_form,
      });
      if (composed && composed !== (cur.display_name ?? "")) {
        rowChanges.push({
          part,
          key: "display_name",
          header: "Display Name (auto)",
          from: cur.display_name ?? null,
          to: composed,
        });
      }
    }

    if (rowChanges.length > 0) {
      changes.push(...rowChanges);
      touched.push(part);
    }
  }

  return { changes, issues, touchedParts: touched };
}

/* ── Apply grouping ─────────────────────────────────────────── */

export type PartUpdates = {
  /** Direct inventory_products column updates (includes colors + display_name). */
  inventory: Record<string, string | null>;
  /** metafields.notes patch — undefined keys untouched, null deletes. */
  notes: Partial<Record<"top" | "mid" | "dry", string | null>>;
  /** media_kit_products column updates. */
  media: Record<string, string | null>;
};

const NOTE_KEY_MAP: Record<string, "top" | "mid" | "dry"> = {
  note_top: "top",
  note_mid: "mid",
  note_dry: "dry",
};

/** Group a flat change list into per-part update payloads by target table. */
export function groupChangesByPart(changes: FieldChange[]): Map<string, PartUpdates> {
  const grouped = new Map<string, PartUpdates>();
  for (const c of changes) {
    let entry = grouped.get(c.part);
    if (!entry) {
      entry = { inventory: {}, notes: {}, media: {} };
      grouped.set(c.part, entry);
    }
    if (c.key in NOTE_KEY_MAP) {
      entry.notes[NOTE_KEY_MAP[c.key]] = c.to;
    } else if (MEDIA_KEYS.includes(c.key as EditableKey)) {
      entry.media[c.key] = c.to;
    } else {
      entry.inventory[c.key] = c.to;
    }
  }
  return grouped;
}
