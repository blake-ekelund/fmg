/**
 * Ready-made text styles for the canvas editor's "+ Add" menu: small groups
 * of layers (text + the shapes behind it) in the brand's own fonts and
 * colours, dropped in the middle of the canvas and then edited like any
 * other layers. Built for one post (1080 wide). Client-safe.
 */

import { newLayerId, newShapeLayer, newTextLayer, type Layer, type ShapeLayer, type TextLayer } from "./canvas";
import { SLIDE_THEMES } from "./theme";
import type { SocialBrand } from "./types";

export type TextStyleId =
  | "kicker-headline"
  | "statement"
  | "quote"
  | "price"
  | "badge"
  | "banner"
  | "button"
  | "step"
  | "caption";

export type TextStyle = { id: TextStyleId; label: string; hint: string };

export const TEXT_STYLES: TextStyle[] = [
  { id: "kicker-headline", label: "Label + headline", hint: "A small label over a big headline" },
  { id: "statement", label: "Big statement", hint: "One bold line that fills the space" },
  { id: "quote", label: "Quote", hint: "A pull quote with who said it" },
  { id: "step", label: "Numbered step", hint: "01 + a step title + a line of detail" },
  { id: "caption", label: "Highlighted caption", hint: "Text on a soft highlight box" },
  { id: "banner", label: "Banner", hint: "A full-width band with a short line" },
  { id: "button", label: "Button", hint: "Shop now — with the site underneath" },
  { id: "price", label: "Price tag", hint: "A pill with a price" },
  { id: "badge", label: "Badge", hint: "A round 'New' sticker" },
];

const W = 1080;

/** The layers for a style, laid out around x = 0…1080 starting at y = 0. */
export function buildTextStyle(id: TextStyleId, brand: SocialBrand): Layer[] {
  const t = SLIDE_THEMES[brand];
  const light = t.tones.light;
  const dark = t.tones.dark;
  const text = (preset: Parameters<typeof newTextLayer>[1], patch: Partial<TextLayer>): TextLayer => {
    const l = { ...newTextLayer(brand, preset), ...patch };
    return { ...l, x: patch.x ?? Math.round((W - l.w) / 2), h: patch.h ?? Math.round(l.size * l.lineHeight) };
  };
  const shape = (kind: Parameters<typeof newShapeLayer>[1], patch: Partial<ShapeLayer>): ShapeLayer => ({
    ...newShapeLayer(brand, kind),
    strokeWidth: 0,
    ...patch,
  });

  switch (id) {
    case "kicker-headline":
      return [
        text("label", { name: "Label", text: brand === "NI" ? "THE RITUAL" : "NEW DROP", color: light.accent, y: 0 }),
        text("heading", { name: "Headline", text: brand === "NI" ? "Slow down, breathe in" : "Main character energy", size: 104, w: 900, y: 56 }),
      ];
    case "statement":
      return [
        text("heading", {
          name: "Statement",
          text: brand === "NI" ? "Indulge in the good." : "Go big or go home",
          size: 150,
          w: 960,
          lineHeight: 1.0,
          y: 0,
          h: 300,
        }),
      ];
    case "quote":
      return [
        text("heading", { name: "Quote mark", text: "“", size: 220, w: 200, color: light.accent, lineHeight: 1, y: 0, h: 160, uppercase: false }),
        text("subheading", {
          name: "Quote",
          text: brand === "NI" ? "My skin has never felt this soft." : "Obsessed doesn't even cover it.",
          size: 64,
          w: 860,
          italic: brand === "NI",
          y: 150,
          h: 170,
        }),
        text("label", { name: "Who said it", text: "— A HAPPY CUSTOMER", color: light.muted, y: 350 }),
      ];
    case "step":
      return [
        text("heading", { name: "Number", text: "01", size: 170, w: 400, color: light.accent, lineHeight: 1, y: 0, h: 170, uppercase: false }),
        text("subheading", { name: "Step title", text: brand === "NI" ? "Warm the water" : "Prep your skin", y: 190 }),
        text("body", { name: "Step detail", text: "One short line about this step.", y: 270, h: 60 }),
      ];
    case "caption":
      return [
        text("subheading", {
          name: "Caption",
          text: brand === "NI" ? "Fresh. Nourishing. Elevated." : "Smells like a vacation",
          size: 56,
          w: 820,
          y: 0,
          bg: t.tones.tint.bg,
          bgRadius: 14,
          padding: 24,
          h: 120,
        }),
      ];
    case "banner":
      return [
        shape("rect", { name: "Band", x: 0, y: 0, w: W, h: 150, fill: dark.bg, radius: 0 }),
        text("label", { name: "Banner text", text: brand === "NI" ? "LIMITED EDITION" : "LIMITED DROP", size: 40, w: 900, color: dark.ink, letterSpacing: 8, y: 49 }),
      ];
    case "button":
      return [
        shape("rect", { name: "Button", x: Math.round((W - 460) / 2), y: 0, w: 460, h: 120, fill: light.accent, radius: 60 }),
        text("label", { name: "Button text", text: "SHOP NOW", size: 36, w: 420, color: light.onAccent, letterSpacing: 4, y: 38 }),
        text("body", { name: "Site", text: t.site, size: 30, color: light.muted, y: 150, h: 42 }),
      ];
    case "price":
      return [
        shape("rect", { name: "Price pill", x: Math.round((W - 300) / 2), y: 0, w: 300, h: 120, fill: light.accent, radius: 60 }),
        text("heading", { name: "Price", text: "$24", size: 72, w: 280, color: light.onAccent, lineHeight: 1, y: 24, h: 72, uppercase: false }),
      ];
    case "badge":
      return [
        shape("ellipse", { name: "Badge", x: Math.round((W - 260) / 2), y: 0, w: 260, h: 260, fill: light.accent, rotation: -8 }),
        text("heading", { name: "Badge text", text: "NEW", size: 84, w: 240, color: light.onAccent, lineHeight: 1, y: 88, h: 84, rotation: -8, uppercase: true }),
      ];
  }
}

/** A style's layers with fresh ids, centred on a canvas of `cw` × `ch`. */
export function placeTextStyle(id: TextStyleId, brand: SocialBrand, cw: number, ch: number): Layer[] {
  const layers = buildTextStyle(id, brand);
  const minX = Math.min(...layers.map((l) => l.x));
  const maxX = Math.max(...layers.map((l) => l.x + l.w));
  const maxY = Math.max(...layers.map((l) => l.y + l.h));
  const dx = Math.round((cw - (maxX - minX)) / 2 - minX);
  const dy = Math.round((ch - maxY) / 2);
  return layers.map((l) => ({ ...l, id: newLayerId(), x: l.x + dx, y: l.y + dy }));
}
