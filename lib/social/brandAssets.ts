/**
 * Brand logos and the Sassy character marks for the canvas editor's
 * "+ Add → Logos & stickers". PNGs (converted from the stores' SVGs) live in
 * the public email-assets bucket under brand-logos/, so they work as normal
 * photo layers in the editor and on the server. Client-safe.
 */

import type { SocialBrand } from "./types";

export type BrandAsset = {
  id: string;
  label: string;
  file: string;
  /** Pixel size of the PNG (keeps the layer's shape right). */
  w: number;
  h: number;
  /** Light artwork — preview it on a dark tile. */
  light?: boolean;
};

const LOGOS: Record<SocialBrand, BrandAsset[]> = {
  NI: [
    { id: "ni-green", label: "Green", file: "ni-logo-green.png", w: 2400, h: 116 },
    { id: "ni-cream", label: "Cream", file: "ni-logo-cream.png", w: 2400, h: 116, light: true },
    { id: "ni-black", label: "Black", file: "ni-logo-black.png", w: 2400, h: 116 },
  ],
  Sassy: [
    { id: "sassy-pink", label: "Pink", file: "sassy-logo-pink.png", w: 1600, h: 638 },
    { id: "sassy-black", label: "Black", file: "sassy-logo-black.png", w: 1600, h: 638 },
    { id: "sassy-white", label: "White", file: "sassy-logo-white.png", w: 1600, h: 638, light: true },
  ],
};

/** Sassy's character marks (from the Everyday / Love characters). */
const MARKS: Record<SocialBrand, BrandAsset[]> = {
  NI: [],
  Sassy: [
    { id: "mark-bestie", label: "Bestie", file: "sassy-mark-bestie.png", w: 800, h: 800 },
    { id: "mark-bougie-babe", label: "Bougie Babe", file: "sassy-mark-bougie-babe.png", w: 800, h: 800 },
    { id: "mark-fierce-vibes", label: "Fierce Vibes", file: "sassy-mark-fierce-vibes.png", w: 800, h: 735 },
    { id: "mark-glow-up", label: "Glow Up", file: "sassy-mark-glow-up.png", w: 800, h: 1450 },
    { id: "mark-hot-mess", label: "Hot Mess", file: "sassy-mark-hot-mess.png", w: 800, h: 497 },
    { id: "mark-queen", label: "Queen", file: "sassy-mark-queen.png", w: 800, h: 419 },
  ],
};

export function brandAssetUrl(a: BrandAsset): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/storage/v1/object/public/email-assets/brand-logos/${a.file}`;
}

export const brandLogos = (brand: SocialBrand) => LOGOS[brand];
export const brandMarks = (brand: SocialBrand) => MARKS[brand];
