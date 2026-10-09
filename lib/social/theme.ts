/**
 * Brand looks for social slides: canvas size, colors per tone and the
 * template fonts. Shared by the layout slides (design.ts), the free canvas
 * (canvas.ts) and both renderers. Client-safe.
 */

import type { SocialBrand } from "./types";

export type SlideTone = "light" | "tint" | "dark";

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
export type SlideTheme = {
  /** Page colors per tone. */
  tones: Record<SlideTone, { bg: string; ink: string; muted: string; accent: string; onAccent: string }>;
  headFont: string;
  headWeight: number;
  headItalicQuote: boolean;
  headUpper: boolean;
  headTracking: number;
  bodyFont: string;
  wordmark: string;
  site: string;
};

/** Brand looks. Fonts are files in public/fonts/social (see SLIDE_FONTS). */
export const SLIDE_THEMES: Record<SocialBrand, SlideTheme> = {
  NI: {
    tones: {
      light: { bg: "#FBF8F3", ink: "#1F3D35", muted: "#5F6B66", accent: "#1F3D35", onAccent: "#FBF8F3" },
      tint: { bg: "#E6ECE6", ink: "#1F3D35", muted: "#55625C", accent: "#1F3D35", onAccent: "#F4F1EA" },
      dark: { bg: "#1F3D35", ink: "#F4F1EA", muted: "#C9D3CC", accent: "#D9CFBF", onAccent: "#1F3D35" },
    },
    headFont: "EB Garamond",
    headWeight: 500,
    headItalicQuote: true,
    headUpper: false,
    headTracking: -0.5,
    bodyFont: "Figtree",
    wordmark: "NATURAL INSPIRATIONS",
    site: "naturalinspirations.com",
  },
  Sassy: {
    tones: {
      light: { bg: "#FFFFFF", ink: "#1A1A1A", muted: "#5B5B5B", accent: "#B3295C", onAccent: "#FFFFFF" },
      tint: { bg: "#F1E6E4", ink: "#1A1A1A", muted: "#5B5B5B", accent: "#B3295C", onAccent: "#FFFFFF" },
      dark: { bg: "#B3295C", ink: "#FFFFFF", muted: "#FBDDE7", accent: "#1A1A1A", onAccent: "#FFFFFF" },
    },
    headFont: "Geist",
    headWeight: 800,
    headItalicQuote: false,
    headUpper: true,
    headTracking: -1,
    bodyFont: "Geist",
    wordmark: "SASSY",
    site: "sassyandco.com",
  },
};

/** Font files the renderer loads and the editor declares with @font-face. */
export const SLIDE_FONTS: { family: string; weight: number; style: "normal" | "italic"; file: string }[] = [
  { family: "Figtree", weight: 400, style: "normal", file: "Figtree-400.ttf" },
  { family: "Figtree", weight: 600, style: "normal", file: "Figtree-600.ttf" },
  { family: "Figtree", weight: 700, style: "normal", file: "Figtree-700.ttf" },
  { family: "EB Garamond", weight: 500, style: "normal", file: "EBGaramond-500.ttf" },
  { family: "EB Garamond", weight: 500, style: "italic", file: "EBGaramond-500-italic.ttf" },
  { family: "Geist", weight: 400, style: "normal", file: "Geist-400.ttf" },
  { family: "Geist", weight: 600, style: "normal", file: "Geist-600.ttf" },
  { family: "Geist", weight: 800, style: "normal", file: "Geist-800.ttf" },
];
