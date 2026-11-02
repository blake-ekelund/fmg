import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import opentype from "opentype.js";
import sharp from "sharp";

/*
 * The tab buttons across the top of every report Excel tab. Real, fixed-size
 * buttons (pictures with a link) rather than styled cells, so their size never
 * depends on how wide a tab's columns are. The label is drawn as outlines from
 * Figtree (the same font file the social renderer ships), so it looks the same
 * on any server — no installed fonts needed.
 */

const NAVY = "#1B3C53";
const GOLD = "#EBB700";
const LIGHT = "#E8EEF3";
const LINK = "#1B3C53";
/** Render at 2× and show at 1× so the buttons stay crisp on high-DPI screens. */
const SCALE = 2;

let fontPromise: Promise<opentype.Font> | null = null;
function font(): Promise<opentype.Font> {
  fontPromise ??= readFile(path.join(process.cwd(), "public", "fonts", "social", "Figtree-600.ttf")).then((b) =>
    opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer),
  );
  fontPromise.catch(() => (fontPromise = null));
  return fontPromise;
}

/** The label, shortened with an ellipsis to fit `max` px at `size`. */
function fitText(f: opentype.Font, text: string, size: number, max: number): string {
  if (f.getAdvanceWidth(text, size) <= max) return text;
  let t = text;
  while (t.length > 1 && f.getAdvanceWidth(`${t}…`, size) > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export type ButtonStyle = "link" | "current";

/** One button as a PNG: `width` × `height` px (drawn at 2×). */
export async function buttonPng(label: string, width: number, height: number, style: ButtonStyle): Promise<Buffer> {
  const f = await font();
  const W = width * SCALE;
  const H = height * SCALE;
  const size = 11.5 * SCALE;
  const text = fitText(f, label, size, W - 14 * SCALE);
  const tw = f.getAdvanceWidth(text, size);
  // Vertically centre on the cap height.
  const capH = ((f.tables.os2 as { sCapHeight?: number } | undefined)?.sCapHeight ?? f.ascender * 0.7) * (size / f.unitsPerEm);
  const d = f.getPath(text, (W - tw) / 2, H / 2 + capH / 2, size).toPathData(2);
  const fill = style === "current" ? GOLD : LIGHT;
  const ink = style === "current" ? NAVY : LINK;
  const border = style === "current" ? GOLD : "#C9D6E0";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect x="${SCALE}" y="${SCALE}" width="${W - 2 * SCALE}" height="${H - 2 * SCALE}" rx="${6 * SCALE}" fill="${fill}" stroke="${border}" stroke-width="${SCALE}"/>
<path d="${d}" fill="${ink}"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * exceljs writes every picture link as an EXTERNAL target, so a "#'Tab'!A1"
 * jump would open as a web address. Excel's own files mark same-workbook
 * links with no TargetMode — rewrite the drawing links to match.
 */
export async function fixInternalPictureLinks(xlsx: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(xlsx);
  const rels = Object.keys(zip.files).filter((n) => /^xl\/drawings\/_rels\/.+\.rels$/.test(n));
  for (const name of rels) {
    const xml = await zip.file(name)!.async("string");
    const fixed = xml.replace(/(Target="#[^"]*")\s+TargetMode="External"/g, "$1");
    if (fixed !== xml) zip.file(name, fixed);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
