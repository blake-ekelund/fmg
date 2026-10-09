/**
 * Draws a free-canvas slide at full size (1080×1350). The SAME component
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
import { CANVAS_H, CANVAS_W, fillTokens, type CanvasSlide, type Layer, type TextLayer } from "./canvas";
import { resolveVariant } from "./fonts";

type Props = {
  slide: CanvasSlide;
  index: number;
  total: number;
  /** URL (browser) or data URI (server) for a texture. */
  textureSrc: (id: string, tone: "dark" | "light") => string;
  /** Browser only: draws one text layer as an editable box (see canvas/EditableText.tsx). */
  editing?: { id: string; render: (layer: TextLayer, style: CSSProperties) => ReactNode } | null;
};

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
    wordBreak: "break-word",
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

export default function CanvasView({ slide, index, total, textureSrc, editing }: Props) {
  const bg = slide.bg;
  return (
    <div
      style={clean({
        width: CANVAS_W,
        height: CANVAS_H,
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
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ position: "absolute", left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, objectFit: "cover", opacity: bg.imageOpacity }}
        />
      ) : null}
      {bg.texture && !bg.textureOnTop ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={textureSrc(bg.texture, bg.textureTone)}
          alt=""
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ position: "absolute", left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, opacity: bg.textureOpacity }}
        />
      ) : null}

      {slide.layers.map((l) => {
        if (l.hidden) return null;

        if (l.type === "text") {
          const style = box(l, {
            display: "flex",
            justifyContent: l.align === "center" ? "center" : l.align === "right" ? "flex-end" : "flex-start",
            backgroundColor: l.bg ?? undefined,
            borderRadius: l.bg ? l.bgRadius : undefined,
            padding: l.padding || undefined,
            ...textStyle(l),
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
          return (
            <div
              key={l.id}
              data-layer-id={l.id}
              style={box(l, {
                height: l.h,
                display: "flex",
                overflow: "hidden",
                borderRadius: l.radius,
                border: l.borderWidth ? `${l.borderWidth}px solid ${l.borderColor}` : undefined,
              })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={l.src}
                alt=""
                width={l.w - l.borderWidth * 2}
                height={l.h - l.borderWidth * 2}
                style={{ width: l.w - l.borderWidth * 2, height: l.h - l.borderWidth * 2, objectFit: l.fit }}
              />
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
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ position: "absolute", left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, opacity: bg.textureOpacity }}
        />
      ) : null}
    </div>
  );
}
