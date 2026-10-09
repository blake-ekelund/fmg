/**
 * Draws a free-canvas slide at full size (1080×1350, or the slide's own w×h). The SAME component
 * renders in the editor (scaled with CSS) and on the server (next/og →
 * Satori → JPEG), so it sticks to what Satori supports: inline styles,
 * flexbox, absolute positioning, no classes.
 *
 * Every layer element carries data-layer-id so the editor can measure it
 * (text boxes grow with their text). `editing` swaps one text layer for an
 * in-place editable box — browser only, never passed by the server, and kept
 * out of this file so route handlers can import it (no hooks here).
 */

import type { CSSProperties, ReactNode } from "react";
import { fillTokens, photoFilter, slideH, slideW, type CanvasSlide, type Layer, type TextLayer } from "./canvas";
import { resolveVariant } from "./fonts";
import { stickerPath } from "./stickers";
import { frameClip, frameRadius, isPathFrame } from "./frames";

type Props = {
  slide: CanvasSlide;
  index: number;
  total: number;
  /** URL (browser) or data URI (server) for a texture. */
  textureSrc: (id: string, tone: "dark" | "light") => string;
  /** Browser only: draws one text layer as an editable box (see canvas/EditableText.tsx). */
  editing?: { id: string; render: (layer: TextLayer, style: CSSProperties) => ReactNode } | null;
  /**
   * Width of one character for curved text. The browser measures with a canvas
   * (the same font files); the server passes font-file metrics. Both give the
   * plain advance width, so letters land in the same places.
   */
  measure?: (ch: string, l: TextLayer) => number;
};

/** #rgb / #rrggbb → rgba() at alpha; anything else unchanged. */
function withAlpha(c: string, a: number): string {
  const h = c.startsWith("#") ? c.slice(1) : "";
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.length === 6 ? h : "";
  if (!full) return c;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Text shadow + outline as CSS (the server renderer supports both). */
export function textEffectStyle(l: TextLayer): CSSProperties {
  const out: CSSProperties = {};
  if (l.shadow) {
    const k = (l.size * l.shadow) / 100;
    out.textShadow = `0 ${Math.round(k * 0.08 * 10) / 10}px ${Math.round(k * 0.3 * 10) / 10}px ${withAlpha(l.shadowColor ?? "#000000", 0.55)}`;
  }
  if (l.outline) (out as Record<string, unknown>).WebkitTextStroke = `${l.outline}px ${l.outlineColor ?? "#FFFFFF"}`;
  return out;
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** Browser: measure with a canvas in the layer's font. Elsewhere: a rough average. */
function defaultMeasure(ch: string, l: TextLayer): number {
  if (typeof document === "undefined") return l.size * 0.55;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return l.size * 0.55;
  const v = resolveVariant(l.font, l.weight, l.italic);
  measureCtx.font = `${v.style} ${v.weight} ${l.size}px "${v.family}"`;
  return measureCtx.measureText(ch).width;
}

/**
 * Lay a curved line out letter by letter on an arc. Returns the block height
 * and each letter's box (left/top/width in the layer) and rotation.
 */
export function curveLayout(l: TextLayer, text: string, measure: (ch: string, l: TextLayer) => number) {
  const chars = Array.from((l.uppercase ? text.toUpperCase() : text).replace(/\s*\n\s*/g, " "));
  const widths = chars.map((c) => measure(c, l));
  const steps = widths.map((w) => w + l.letterSpacing);
  const total = Math.max(1, steps.reduce((a, b) => a + b, 0) - l.letterSpacing);
  const lh = l.size * l.lineHeight;
  const theta = (Math.abs(l.curve ?? 0) / 100) * Math.PI; // up to a half circle
  const R = total / Math.max(theta, 0.0001);
  const sag = R * (1 - Math.cos(theta / 2));
  const up = (l.curve ?? 0) > 0;
  let s = -total / 2;
  const letters = chars.map((c, i) => {
    const mid = s + widths[i] / 2;
    s += steps[i];
    const phi = mid / R;
    const dy = R * (1 - Math.cos(phi));
    const cx = l.w / 2 + R * Math.sin(phi);
    const cy = lh / 2 + (up ? dy : sag - dy);
    return { ch: c, left: cx - widths[i] / 2, top: cy - lh / 2, width: widths[i], rotate: ((up ? phi : -phi) * 180) / Math.PI };
  });
  return { height: lh + sag, letters };
}

export function textStyle(l: TextLayer): CSSProperties {
  const v = resolveVariant(l.font, l.weight, l.italic);
  return {
    fontFamily: `"${v.family}"`,
    fontWeight: v.weight,
    fontStyle: v.style,
    fontSize: l.size,
    lineHeight: l.lineHeight,
    letterSpacing: l.letterSpacing,
    color: l.color,
    textAlign: l.align,
    textTransform: l.uppercase ? "uppercase" : "none",
    whiteSpace: "pre-wrap",
    // The server renderer (Satori) loops forever breaking a word when one glyph is
    // wider than the box. Boxes about a letter wide don't break words (they overflow).
    wordBreak: l.w - 2 * (l.padding ?? 0) < l.size * 1.6 + Math.max(0, l.letterSpacing) ? "normal" : "break-word",
  };
}

/** Satori trips over keys whose value is undefined — drop them. */
function clean(style: CSSProperties): CSSProperties {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) if (v !== undefined && v !== null) out[k] = v;
  return out as CSSProperties;
}

function box(l: Layer, extra: CSSProperties = {}): CSSProperties {
  return clean({
    position: "absolute",
    left: l.x,
    top: l.y,
    width: l.w,
    opacity: l.opacity,
    transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
    ...extra,
  });
}

export default function CanvasView({ slide, index, total, textureSrc, editing, measure = defaultMeasure }: Props) {
  const bg = slide.bg;
  const W = slideW(slide);
  const H = slideH(slide);
  return (
    <div
      style={clean({
        width: W,
        height: H,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        backgroundColor: bg.color,
        backgroundImage: bg.gradient ? `linear-gradient(${bg.gradient.angle}deg, ${bg.color}, ${bg.gradient.to})` : undefined,
      })}
    >
      {bg.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bg.image}
          alt=""
          width={W}
          height={H}
          style={{ position: "absolute", left: 0, top: 0, width: W, height: H, objectFit: "cover", opacity: bg.imageOpacity }}
        />
      ) : null}
      {bg.texture && !bg.textureOnTop ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={textureSrc(bg.texture, bg.textureTone)}
          alt=""
          width={W}
          height={H}
          style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: bg.textureOpacity }}
        />
      ) : null}

      {slide.layers.map((l) => {
        if (l.hidden) return null;

        if (l.type === "text" && l.curve && !(editing && editing.id === l.id)) {
          const lay = curveLayout(l, fillTokens(l.text, index, total) || " ", measure);
          // One letter per box, exactly its advance width (the server doesn't centre
          // text in a wider box, and each box rotates about its own centre). No
          // word-breaking: the server renderer loops forever trying to break a
          // glyph that's a hair wider than its box.
          const glyph = { ...textStyle(l), ...textEffectStyle(l), textTransform: "none" as const, whiteSpace: "pre" as const, wordBreak: "normal" as const };
          const r2 = (n: number) => Math.round(n * 100) / 100;
          return (
            <div key={l.id} data-layer-id={l.id} style={box(l, { height: lay.height, display: "flex" })}>
              {lay.letters.map((g, i) => (
                <div
                  key={i}
                  style={clean({
                    ...glyph,
                    position: "absolute",
                    left: r2(g.left),
                    top: r2(g.top),
                    width: r2(g.width),
                    height: l.size * l.lineHeight,
                    display: "flex",
                    justifyContent: "center",
                    transform: `rotate(${Math.round(g.rotate * 100) / 100}deg)`,
                    transformOrigin: "50% 50%",
                  })}
                >
                  {g.ch}
                </div>
              ))}
            </div>
          );
        }

        if (l.type === "text") {
          const style = box(l, {
            display: "flex",
            justifyContent: l.align === "center" ? "center" : l.align === "right" ? "flex-end" : "flex-start",
            backgroundColor: l.bg ?? undefined,
            borderRadius: l.bg ? l.bgRadius : undefined,
            padding: l.padding || undefined,
            ...textStyle(l),
            ...textEffectStyle(l),
          });
          if (editing && editing.id === l.id) {
            return <span key={l.id} style={{ display: "contents" }}>{editing.render(l, style)}</span>;
          }
          return (
            <div key={l.id} data-layer-id={l.id} style={style}>
              {fillTokens(l.text, index, total) || " "}
            </div>
          );
        }

        if (l.type === "image") {
          const clipPath = frameClip(l.frame, l.w, l.h);
          const corners = frameRadius(l.frame, l.w, l.h) ?? { borderRadius: l.radius };
          const bw = clipPath ? 0 : l.borderWidth; // a border can't follow a cut-out shape
          const size = l.shadowSize ?? 40;
          const soft = l.shadow === "soft" && !isPathFrame(l.frame);
          const offset = l.shadow === "offset" || (l.shadow === "soft" && isPathFrame(l.frame));
          const off = Math.round((size / 100) * 48);
          const shape = clean({ ...corners, clipPath } as CSSProperties);
          const photo = (
            <div
              key={l.id}
              data-layer-id={l.id}
              style={box(l, {
                height: l.h,
                display: "flex",
                overflow: "hidden",
                ...shape,
                border: bw ? `${bw}px solid ${l.borderColor}` : undefined,
                boxShadow: soft
                  ? `0 ${Math.round(size * 0.3)}px ${Math.round(size * 0.9)}px ${withAlpha(l.shadowColor ?? "#000000", 0.18 + size / 400)}`
                  : undefined,
              })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={l.src}
                alt=""
                width={l.w - bw * 2}
                height={l.h - bw * 2}
                style={clean({
                  width: l.w - bw * 2,
                  height: l.h - bw * 2,
                  objectFit: l.fit,
                  // Adjustments: live CSS in the editor. The server bakes them into the
                  // pixels first and passes a plain layer, so none of these apply there.
                  objectPosition: l.focusX != null || l.focusY != null ? `${(l.focusX ?? 0.5) * 100}% ${(l.focusY ?? 0.5) * 100}%` : undefined,
                  filter: photoFilter(l),
                  transform: l.flipX || l.flipY ? `scale(${l.flipX ? -1 : 1}, ${l.flipY ? -1 : 1})` : undefined,
                })}
              />
            </div>
          );
          if (!offset) return photo;
          // Offset shadow: the same shape, solid, nudged down-right, behind the photo.
          return [
            // Built like the photo (clipped box + a child filling it): the server
            // renderer doesn't apply a clip-path to an empty box.
            <div
              key={`${l.id}-shadow`}
              style={box({ ...l, x: l.x + off, y: l.y + off }, { height: l.h, display: "flex", overflow: "hidden", ...shape })}
            >
              <div style={{ display: "flex", width: l.w, height: l.h, backgroundColor: l.shadowColor ?? "#000000" }} />
            </div>,
            photo,
          ];
        }

        if (l.type === "sticker") {
          return (
            <div key={l.id} data-layer-id={l.id} style={box(l, { height: l.h, display: "flex" })}>
              <svg width={l.w} height={l.h} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d={stickerPath(l.sticker)} fill={l.color} />
              </svg>
            </div>
          );
        }

        // shape
        const radius =
          l.shape === "ellipse"
            ? { borderRadius: "50%" }
            : l.shape === "arch"
              ? { borderTopLeftRadius: l.w / 2, borderTopRightRadius: l.w / 2 }
              : { borderRadius: l.radius };
        return (
          <div
            key={l.id}
            data-layer-id={l.id}
            style={box(l, {
              height: l.h,
              display: "flex",
              backgroundColor: l.gradient ? undefined : l.fill,
              backgroundImage: l.gradient ?? undefined,
              border: l.strokeWidth ? `${l.strokeWidth}px solid ${l.stroke}` : undefined,
              ...radius,
            })}
          />
        );
      })}

      {bg.texture && bg.textureOnTop ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={textureSrc(bg.texture, bg.textureTone)}
          alt=""
          width={W}
          height={H}
          style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: bg.textureOpacity }}
        />
      ) : null}
    </div>
  );
}
