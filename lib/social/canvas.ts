/**
 * Free-canvas slides — the design editor's document model.
 *
 * A canvas slide is a background (color or gradient, optional photo, optional
 * texture) plus an ordered stack of layers (text, image, shape), each placed
 * in slide pixels (1080×1350) with size, rotation and opacity. The editor
 * (components/marketing/social/canvas) and the server renderer both draw it
 * with lib/social/CanvasView.tsx.
 *
 * The older layout slides (lib/social/design.ts `Slide`) are what the AI
 * writes; the editor converts them to canvas slides the first time a post
 * is opened (components/marketing/social/canvas/convertLayout.ts).
 *
 * Client-safe.
 */

import { FONT_FAMILIES } from "./fonts";
import { SLIDE_H, SLIDE_THEMES, SLIDE_W } from "./theme";
import type { SocialBrand } from "./types";

export type TextureId = "grain" | "paper" | "linen" | "dots" | "stripes" | "speckle";

export const TEXTURES: { id: TextureId; label: string }[] = [
  { id: "grain", label: "Grain" },
  { id: "paper", label: "Paper" },
  { id: "linen", label: "Linen" },
  { id: "dots", label: "Dots" },
  { id: "stripes", label: "Stripes" },
  { id: "speckle", label: "Speckle" },
];

export type Gradient = { to: string; angle: number };

export type CanvasBackground = {
  color: string;
  gradient: Gradient | null;
  image: string;
  imageOpacity: number;
  texture: TextureId | null;
  textureTone: "dark" | "light";
  textureOpacity: number;
  /** Lay the texture over everything (photos included), not just the background. */
  textureOnTop: boolean;
};

type LayerBase = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  /** Text: measured height (the box grows with its text). Others: the box height. */
  h: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
};

export type TextLayer = LayerBase & {
  type: "text";
  /** "{n}" and "{total}" are replaced with the slide number and count. */
  text: string;
  font: string;
  weight: number;
  italic: boolean;
  size: number;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
  uppercase: boolean;
  /** Highlight box behind the text. */
  bg: string | null;
  bgRadius: number;
  padding: number;
};

export type ImageLayer = LayerBase & {
  type: "image";
  src: string;
  fit: "cover" | "contain";
  radius: number;
  borderWidth: number;
  borderColor: string;
};

export type ShapeKind = "rect" | "ellipse" | "line" | "arch";

export type ShapeLayer = LayerBase & {
  type: "shape";
  shape: ShapeKind;
  fill: string;
  /** Optional CSS linear-gradient(...) instead of a flat fill (from templates). */
  gradient: string | null;
  strokeWidth: number;
  stroke: string;
  radius: number;
};

export type Layer = TextLayer | ImageLayer | ShapeLayer;

export type CanvasSlide = {
  id: string;
  kind: "canvas";
  bg: CanvasBackground;
  layers: Layer[];
  /**
   * Canvas size in pixels. Unset = one post (1080×1350). The grid picture
   * editor uses a bigger canvas spanning several posts (lib/social/mosaicDesign.ts).
   */
  w?: number;
  h?: number;
};

export const CANVAS_W = SLIDE_W;
export const CANVAS_H = SLIDE_H;

/** A slide's canvas size (one post unless it says otherwise). */
export const slideW = (s: Pick<CanvasSlide, "w">) => s.w ?? CANVAS_W;
export const slideH = (s: Pick<CanvasSlide, "h">) => s.h ?? CANVAS_H;

/* ─── Colors ──────────────────────────────────────────────────────── */

export type Palette = { brand: string[]; more: string[] };

/** Color picker swatches: the brand's own colors, then neutrals and accents. */
export function paletteFor(brand: SocialBrand): Palette {
  const t = SLIDE_THEMES[brand].tones;
  const brandColors = [...new Set(Object.values(t).flatMap((x) => [x.bg, x.ink, x.accent, x.muted, x.onAccent]).map((c) => c.toUpperCase()))];
  const extra = ["#FFFFFF", "#F7F3EE", "#EDE4D8", "#D9CFBF", "#C9A86A", "#8A9A8B", "#E8C4C4", "#B3295C", "#1F3D35", "#2B2B2B", "#000000"];
  return { brand: brandColors, more: extra.filter((c) => !brandColors.includes(c)) };
}

/* ─── Constructors ─────────────────────────────────────────────────── */

export function newLayerId(): string {
  return `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const base = (name: string, x: number, y: number, w: number, h: number): LayerBase => ({
  id: newLayerId(),
  name,
  x,
  y,
  w,
  h,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
});

export function blankBackground(brand: SocialBrand): CanvasBackground {
  return {
    color: SLIDE_THEMES[brand].tones.light.bg,
    gradient: null,
    image: "",
    imageOpacity: 1,
    texture: null,
    textureTone: "dark",
    textureOpacity: 0.25,
    textureOnTop: false,
  };
}

export function blankCanvas(brand: SocialBrand): CanvasSlide {
  return { id: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, kind: "canvas", bg: blankBackground(brand), layers: [] };
}

export type TextPreset = "heading" | "subheading" | "body" | "label";

export function newTextLayer(brand: SocialBrand, preset: TextPreset): TextLayer {
  const t = SLIDE_THEMES[brand];
  const headFont = brand === "NI" ? "eb-garamond" : "geist";
  const bodyFont = brand === "NI" ? "figtree" : "geist";
  const ink = t.tones.light.ink;
  const p = {
    heading: { text: "Add a heading", font: headFont, weight: t.headWeight, size: 88, upper: t.headUpper, w: 880, ls: t.headTracking },
    subheading: { text: "Add a subheading", font: headFont, weight: t.headWeight, size: 52, upper: false, w: 800, ls: 0 },
    body: { text: "Add a little body text — two or three lines reads best.", font: bodyFont, weight: 400, size: 36, upper: false, w: 760, ls: 0 },
    label: { text: "LABEL", font: bodyFont, weight: 600, size: 24, upper: true, w: 400, ls: 5 },
  }[preset];
  return {
    ...base(preset[0].toUpperCase() + preset.slice(1), Math.round((CANVAS_W - p.w) / 2), 560, p.w, Math.round(p.size * 1.3)),
    type: "text",
    text: p.text,
    font: p.font,
    weight: p.weight,
    italic: false,
    size: p.size,
    color: ink,
    align: "center",
    lineHeight: preset === "body" ? 1.4 : 1.1,
    letterSpacing: p.ls,
    uppercase: p.upper,
    bg: null,
    bgRadius: 0,
    padding: 0,
  };
}

export function newImageLayer(src: string, natural?: { w: number; h: number }): ImageLayer {
  const ratio = natural && natural.w > 0 ? natural.h / natural.w : 1;
  const w = 720;
  const h = Math.round(Math.min(1100, w * ratio));
  return {
    ...base("Photo", Math.round((CANVAS_W - w) / 2), Math.round((CANVAS_H - h) / 2), w, h),
    type: "image",
    src,
    fit: "cover",
    radius: 0,
    borderWidth: 0,
    borderColor: "#FFFFFF",
  };
}

export function newShapeLayer(brand: SocialBrand, shape: ShapeKind): ShapeLayer {
  const accent = SLIDE_THEMES[brand].tones.light.accent;
  const dims = { rect: [520, 520], ellipse: [480, 480], line: [400, 6], arch: [560, 760] }[shape];
  return {
    ...base({ rect: "Rectangle", ellipse: "Circle", line: "Line", arch: "Arch" }[shape], Math.round((CANVAS_W - dims[0]) / 2), Math.round((CANVAS_H - dims[1]) / 2), dims[0], dims[1]),
    type: "shape",
    shape,
    fill: shape === "line" ? accent : SLIDE_THEMES[brand].tones.tint.bg,
    gradient: null,
    strokeWidth: 0,
    stroke: accent,
    radius: shape === "rect" ? 0 : 0,
  };
}

/* ─── Normalizing (API input) ──────────────────────────────────────── */

const FONT_IDS = new Set(FONT_FAMILIES.map((f) => f.id));
const TEXTURE_IDS = new Set<TextureId>(TEXTURES.map((t) => t.id));

const num = (v: unknown, d: number, min: number, max: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : d;
  return Math.min(max, Math.max(min, n));
};
const str = (v: unknown, max: number, d = "") => (typeof v === "string" ? v.slice(0, max) : d);
const color = (v: unknown, d: string) =>
  typeof v === "string" && /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|transparent)$/i.test(v.trim()) ? v.trim() : d;
const url = (v: unknown) => (typeof v === "string" && /^https:\/\//i.test(v.trim()) ? v.trim().slice(0, 2000) : "");
const bool = (v: unknown) => v === true;
const gradientCss = (v: unknown) =>
  typeof v === "string" && /^linear-gradient\([#\w\s.,%()-]+\)$/i.test(v) && v.length < 400 ? v : null;

function normLayer(raw: unknown, seen: Set<string>): Layer | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let id = str(r.id, 60) || newLayerId();
  if (seen.has(id)) id = newLayerId();
  seen.add(id);
  const b: LayerBase = {
    id,
    name: str(r.name, 60, "Layer"),
    // Wide limits: grid pieces carry the whole picture's layers, offset by up to a few posts.
    x: num(r.x, 0, -20000, 20000),
    y: num(r.y, 0, -20000, 20000),
    w: num(r.w, 100, 1, 20000),
    h: num(r.h, 100, 1, 20000),
    rotation: num(r.rotation, 0, -360, 360),
    opacity: num(r.opacity, 1, 0, 1),
    locked: bool(r.locked),
    hidden: bool(r.hidden),
  };
  if (r.type === "text") {
    return {
      ...b,
      type: "text",
      text: str(r.text, 2000),
      font: FONT_IDS.has(r.font as string) ? (r.font as string) : "figtree",
      weight: num(r.weight, 400, 100, 900),
      italic: bool(r.italic),
      size: num(r.size, 36, 6, 600),
      color: color(r.color, "#1A1A1A"),
      align: r.align === "left" || r.align === "right" ? r.align : "center",
      lineHeight: num(r.lineHeight, 1.2, 0.6, 3),
      letterSpacing: num(r.letterSpacing, 0, -20, 60),
      uppercase: bool(r.uppercase),
      bg: r.bg == null ? null : color(r.bg, "transparent"),
      bgRadius: num(r.bgRadius, 0, 0, 999),
      padding: num(r.padding, 0, 0, 200),
    };
  }
  if (r.type === "image") {
    const src = url(r.src);
    if (!src) return null;
    return {
      ...b,
      type: "image",
      src,
      fit: r.fit === "contain" ? "contain" : "cover",
      radius: num(r.radius, 0, 0, 2000),
      borderWidth: num(r.borderWidth, 0, 0, 100),
      borderColor: color(r.borderColor, "#FFFFFF"),
    };
  }
  if (r.type === "shape") {
    const shape = (["rect", "ellipse", "line", "arch"] as const).includes(r.shape as ShapeKind) ? (r.shape as ShapeKind) : "rect";
    return {
      ...b,
      type: "shape",
      shape,
      fill: color(r.fill, "#DDDDDD"),
      gradient: gradientCss(r.gradient),
      strokeWidth: num(r.strokeWidth, 0, 0, 100),
      stroke: color(r.stroke, "#000000"),
      radius: num(r.radius, 0, 0, 2000),
    };
  }
  return null;
}

export function normalizeCanvasSlide(raw: Record<string, unknown>): CanvasSlide {
  const bgRaw = (raw.bg && typeof raw.bg === "object" ? raw.bg : {}) as Record<string, unknown>;
  const g = bgRaw.gradient as Record<string, unknown> | null | undefined;
  const seen = new Set<string>();
  const size = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 200 && v <= 20000 ? Math.round(v) : undefined);
  const w = size(raw.w);
  const h = size(raw.h);
  return {
    id: str(raw.id, 60) || `s-${Date.now().toString(36)}`,
    kind: "canvas",
    ...(w && h ? { w, h } : {}),
    bg: {
      color: color(bgRaw.color, "#FFFFFF"),
      gradient: g && typeof g === "object" ? { to: color(g.to, "#FFFFFF"), angle: num(g.angle, 180, 0, 360) } : null,
      image: url(bgRaw.image),
      imageOpacity: num(bgRaw.imageOpacity, 1, 0, 1),
      texture: TEXTURE_IDS.has(bgRaw.texture as TextureId) ? (bgRaw.texture as TextureId) : null,
      textureTone: bgRaw.textureTone === "light" ? "light" : "dark",
      textureOpacity: num(bgRaw.textureOpacity, 0.25, 0, 1),
      textureOnTop: bool(bgRaw.textureOnTop),
    },
    layers: (Array.isArray(raw.layers) ? raw.layers : [])
      .slice(0, 80)
      .map((l) => normLayer(l, seen))
      .filter((l): l is Layer => l !== null),
  };
}

/** Text with {n} / {total} filled in. */
export function fillTokens(text: string, index: number, total: number): string {
  return text.replace(/\{n\}/g, String(index)).replace(/\{total\}/g, String(total));
}

/** Font family ids a slide uses (the server loads only these). */
export function fontsUsed(s: CanvasSlide): string[] {
  return [...new Set(s.layers.filter((l): l is TextLayer => l.type === "text").map((l) => l.font))];
}
