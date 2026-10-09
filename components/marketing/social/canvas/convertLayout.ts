"use client";

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import SlideView from "@/lib/social/SlideView";
import { SLIDE_FONTS, type Slide } from "@/lib/social/design";
import { blankBackground, newLayerId, type CanvasSlide, type Layer } from "@/lib/social/canvas";
import { fontByFamilyName } from "@/lib/social/fonts";
import type { SocialBrand } from "@/lib/social/types";

/**
 * Turns a template slide (what the AI writes) into an editable canvas slide.
 *
 * Rather than re-deriving every layout's maths, it renders the real
 * SlideView off-screen at full size, then reads each tagged element
 * (data-el) back as a layer: its box, and for text its computed font,
 * size, colour, spacing and alignment. So the converted slide looks exactly
 * like the template it came from. Browser only (needs layout + fonts).
 */

function toHex(rgb: string): string {
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m) return rgb;
  const [r, g, b, a = "1"] = m[1].split(",").map((x) => x.trim());
  if (Number(a) < 1) return `rgba(${r}, ${g}, ${b}, ${Number(a)})`;
  return "#" + [r, g, b].map((x) => Number(x).toString(16).padStart(2, "0")).join("").toUpperCase();
}

const px = (v: string, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

let fontsReady: Promise<unknown> | null = null;
function loadSlideFonts(): Promise<unknown> {
  fontsReady ??= Promise.all(
    SLIDE_FONTS.map((f) => document.fonts.load(`${f.style} ${f.weight} 40px "${f.family}"`).catch(() => null)),
  );
  return fontsReady;
}

export async function convertLayoutSlide(slide: Slide, brand: SocialBrand, index: number, total: number): Promise<CanvasSlide> {
  await loadSlideFonts();

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:1080px;height:1350px;pointer-events:none;visibility:hidden;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(createElement(SlideView, { slide, brand, index, total })));
    const frame = host.querySelector<HTMLElement>('[data-el="frame"]') ?? (host.firstElementChild as HTMLElement);
    const origin = frame.getBoundingClientRect();
    const bg = blankBackground(brand);
    bg.color = toHex(getComputedStyle(frame).backgroundColor);

    const layers: Layer[] = [];
    const base = (el: Element, name: string) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        id: newLayerId(),
        name,
        x: Math.round(r.left - origin.left),
        y: Math.round(r.top - origin.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        rotation: 0,
        opacity: px(cs.opacity, 1),
        locked: false,
        hidden: false,
      };
    };

    const textLayer = (el: HTMLElement, center = false): Layer | null => {
      const raw = (el.innerText || el.textContent || "").trim();
      if (!raw) return null;
      const cs = getComputedStyle(el);
      const fam = fontByFamilyName(cs.fontFamily);
      const size = px(cs.fontSize, 32);
      const lh = cs.lineHeight === "normal" ? 1.2 : px(cs.lineHeight, size * 1.2) / size;
      const text = /^\d+ \/ \d+$/.test(raw) ? "{n} / {total}" : raw;
      const b = base(el, raw.slice(0, 28));
      // A little slack so the browser and the renderer wrap the same way.
      const slack = 4;
      return {
        ...b,
        x: b.x - (center ? slack / 2 : 0),
        w: b.w + slack,
        type: "text",
        text,
        font: fam?.id ?? "figtree",
        weight: px(cs.fontWeight, 400),
        italic: cs.fontStyle === "italic",
        size,
        color: toHex(cs.color),
        align: center || cs.textAlign === "center" ? "center" : cs.textAlign === "right" || cs.textAlign === "end" ? "right" : "left",
        lineHeight: Math.round(lh * 100) / 100,
        letterSpacing: cs.letterSpacing === "normal" ? 0 : px(cs.letterSpacing),
        uppercase: cs.textTransform === "uppercase",
        bg: null,
        bgRadius: 0,
        padding: 0,
      };
    };

    const shapeLayer = (el: HTMLElement): Layer | null => {
      const cs = getComputedStyle(el);
      const gradient = cs.backgroundImage && cs.backgroundImage !== "none" ? cs.backgroundImage : null;
      const fill = toHex(cs.backgroundColor);
      if (!gradient && (fill === "rgba(0, 0, 0, 0)" || fill === "transparent")) return null;
      const b = base(el, "Shape");
      const radius = Math.min(px(cs.borderTopLeftRadius), Math.min(b.w, b.h) / 2);
      return {
        ...b,
        type: "shape",
        shape: b.h <= 8 ? "line" : radius >= Math.min(b.w, b.h) / 2 - 1 && Math.abs(b.w - b.h) < 2 ? "ellipse" : "rect",
        fill: gradient ? "#000000" : fill,
        gradient: gradient && /^linear-gradient\(/.test(gradient) ? gradient : null,
        strokeWidth: 0,
        stroke: "#000000",
        radius,
      };
    };

    for (const el of Array.from(host.querySelectorAll<HTMLElement>("[data-el]"))) {
      const kind = el.dataset.el;
      if (kind === "frame") continue;
      if (kind === "image") {
        const img = el as HTMLImageElement;
        const src = img.getAttribute("src") ?? "";
        if (!/^https:\/\//i.test(src)) continue;
        layers.push({
          ...base(el, "Photo"),
          type: "image",
          src,
          fit: getComputedStyle(el).objectFit === "contain" ? "contain" : "cover",
          radius: 0,
          borderWidth: 0,
          borderColor: "#FFFFFF",
        });
      } else if (kind === "box") {
        const s = shapeLayer(el);
        if (s) layers.push(s);
      } else if (kind === "boxtext") {
        const s = shapeLayer(el);
        if (s) layers.push(s);
        const t = textLayer(el, true);
        if (t && t.type === "text") {
          // Centre the text vertically inside its box.
          const line = t.size * t.lineHeight;
          layers.push({ ...t, x: s ? s.x : t.x, w: s ? s.w : t.w, y: Math.round(t.y + (t.h - line) / 2), h: Math.round(line) });
        }
      } else if (kind === "text") {
        const t = textLayer(el);
        if (t) layers.push(t);
      }
    }

    return { id: slide.id, kind: "canvas", bg, layers };
  } finally {
    root.unmount();
    host.remove();
  }
}
