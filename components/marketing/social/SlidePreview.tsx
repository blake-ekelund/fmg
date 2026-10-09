"use client";

import SlideView from "@/lib/social/SlideView";
import { SLIDE_FONTS, SLIDE_H, SLIDE_W, type Slide } from "@/lib/social/design";
import type { SocialBrand } from "@/lib/social/types";

/** @font-face for the slide fonts — the same files the server renders with. */
export function SlideFonts() {
  const css = SLIDE_FONTS.map(
    (f) =>
      `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:${f.style};font-display:block;src:url(/fonts/social/${f.file}) format("truetype");}`,
  ).join("");
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

/** A slide drawn at `width` px wide (the real thing is 1080×1350, scaled). */
export default function SlidePreview({
  slide,
  brand,
  index,
  total,
  width,
}: {
  slide: Slide;
  brand: SocialBrand;
  index: number;
  total: number;
  width: number;
}) {
  const scale = width / SLIDE_W;
  return (
    <div style={{ width, height: SLIDE_H * scale, overflow: "hidden", position: "relative", flexShrink: 0 }}>
      <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute" }}>
        <SlideView slide={slide} brand={brand} index={index} total={total} />
      </div>
    </div>
  );
}
