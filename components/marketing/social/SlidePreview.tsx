"use client";

import SlideView from "@/lib/social/SlideView";
import CanvasView from "@/lib/social/CanvasView";
import { isCanvas, SLIDE_H, SLIDE_W, type DesignSlide } from "@/lib/social/design";
import { fontFaceCss } from "@/lib/social/fonts";
import type { SocialBrand } from "@/lib/social/types";

/** @font-face for every slide font — the same files the server renders with. */
export function SlideFonts() {
  return <style dangerouslySetInnerHTML={{ __html: fontFaceCss() }} />;
}

export const textureUrl = (id: string, tone: "dark" | "light") => `/textures/social/${id}-${tone}.png`;

/** A slide drawn at `width` px wide (the real thing is 1080×1350, scaled). */
export default function SlidePreview({
  slide,
  brand,
  index,
  total,
  width,
}: {
  slide: DesignSlide;
  brand: SocialBrand;
  index: number;
  total: number;
  width: number;
}) {
  const scale = width / SLIDE_W;
  return (
    <div style={{ width, height: SLIDE_H * scale, overflow: "hidden", position: "relative", flexShrink: 0 }}>
      <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute" }}>
        {isCanvas(slide) ? (
          <CanvasView slide={slide} index={index} total={total} textureSrc={textureUrl} />
        ) : (
          <SlideView slide={slide} brand={brand} index={index} total={total} />
        )}
      </div>
    </div>
  );
}
