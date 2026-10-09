/**
 * Fonts the social slide editor offers. Every variant is a TTF in
 * public/fonts/social — the browser loads them with @font-face for the
 * editor and the server hands the same files to Satori, so text renders
 * identically in both. Client-safe.
 */

import type { SocialBrand } from "./types";

export type FontVariant = { weight: number; style: "normal" | "italic"; file: string };
export type FontFamily = {
  id: string;
  /** CSS font-family name (must match @font-face and Satori's font name). */
  family: string;
  label: string;
  kind: "serif" | "sans" | "display" | "script";
  variants: FontVariant[];
};

const v = (weight: number, file: string, style: "normal" | "italic" = "normal"): FontVariant => ({ weight, style, file });

export const FONT_FAMILIES: FontFamily[] = [
  { id: "figtree", family: "Figtree", label: "Figtree", kind: "sans", variants: [v(400, "Figtree-400.ttf"), v(600, "Figtree-600.ttf"), v(700, "Figtree-700.ttf")] },
  { id: "eb-garamond", family: "EB Garamond", label: "EB Garamond", kind: "serif", variants: [v(500, "EBGaramond-500.ttf"), v(500, "EBGaramond-500-italic.ttf", "italic")] },
  { id: "geist", family: "Geist", label: "Geist", kind: "sans", variants: [v(400, "Geist-400.ttf"), v(600, "Geist-600.ttf"), v(800, "Geist-800.ttf")] },
  { id: "playfair", family: "Playfair Display", label: "Playfair Display", kind: "serif", variants: [v(500, "PlayfairDisplay-500.ttf"), v(700, "PlayfairDisplay-700.ttf"), v(500, "PlayfairDisplay-500-italic.ttf", "italic")] },
  { id: "cormorant", family: "Cormorant Garamond", label: "Cormorant Garamond", kind: "serif", variants: [v(500, "CormorantGaramond-500.ttf"), v(600, "CormorantGaramond-600.ttf"), v(500, "CormorantGaramond-500-italic.ttf", "italic")] },
  { id: "dm-serif", family: "DM Serif Display", label: "DM Serif Display", kind: "serif", variants: [v(400, "DMSerifDisplay-400.ttf")] },
  { id: "montserrat", family: "Montserrat", label: "Montserrat", kind: "sans", variants: [v(400, "Montserrat-400.ttf"), v(600, "Montserrat-600.ttf"), v(800, "Montserrat-800.ttf")] },
  { id: "dm-sans", family: "DM Sans", label: "DM Sans", kind: "sans", variants: [v(400, "DMSans-400.ttf"), v(700, "DMSans-700.ttf")] },
  { id: "bebas", family: "Bebas Neue", label: "Bebas Neue", kind: "display", variants: [v(400, "BebasNeue-400.ttf")] },
  { id: "archivo-black", family: "Archivo Black", label: "Archivo Black", kind: "display", variants: [v(400, "ArchivoBlack-400.ttf")] },
  { id: "caveat", family: "Caveat", label: "Caveat", kind: "script", variants: [v(500, "Caveat-500.ttf")] },
  { id: "dancing", family: "Dancing Script", label: "Dancing Script", kind: "script", variants: [v(600, "DancingScript-600.ttf")] },
];

const BY_ID = new Map(FONT_FAMILIES.map((f) => [f.id, f]));
const BY_FAMILY = new Map(FONT_FAMILIES.map((f) => [f.family.toLowerCase(), f]));

/** Each brand's own fonts come first in the picker. */
export const BRAND_FONTS: Record<SocialBrand, string[]> = {
  NI: ["eb-garamond", "figtree"],
  Sassy: ["geist"],
};

export function fontById(id: string): FontFamily {
  return BY_ID.get(id) ?? BY_ID.get("figtree")!;
}

export function fontByFamilyName(name: string): FontFamily | null {
  const clean = name.split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
  return BY_FAMILY.get(clean) ?? null;
}

/** Fonts in picker order: the brand's, then the rest. */
export function fontsForBrand(brand: SocialBrand): FontFamily[] {
  const first = BRAND_FONTS[brand].map((id) => BY_ID.get(id)!).filter(Boolean);
  return [...first, ...FONT_FAMILIES.filter((f) => !first.includes(f))];
}

/** The closest variant the family actually has. */
export function resolveVariant(fontId: string, weight: number, italic: boolean): FontVariant & { family: string } {
  const f = fontById(fontId);
  const style = italic ? "italic" : "normal";
  const pool = f.variants.filter((x) => x.style === style).length ? f.variants.filter((x) => x.style === style) : f.variants;
  const best = pool.reduce((a, b) => (Math.abs(b.weight - weight) < Math.abs(a.weight - weight) ? b : a));
  return { ...best, family: f.family };
}

/** @font-face CSS for every variant (editor + previews). */
export function fontFaceCss(): string {
  return FONT_FAMILIES.flatMap((f) =>
    f.variants.map(
      (x) =>
        `@font-face{font-family:"${f.family}";font-weight:${x.weight};font-style:${x.style};font-display:block;src:url(/fonts/social/${x.file}) format("truetype");}`,
    ),
  ).join("");
}
