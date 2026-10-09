/**
 * One picture across the grid, designed as ONE big canvas and then split into
 * posts.
 *
 * The big canvas is mosaicSize(rows) — the area the grid shows plus each
 * post's feed bleed (lib/social/gridPlan.ts). The team edits it with the
 * normal canvas editor (opacity, text, shapes, more photos…). Splitting gives
 * every post a normal 1080×1350 canvas slide holding the whole picture's
 * layers shifted by that post's place in the grid; the slide clips the rest.
 * So each post renders exactly its piece — in the browser and on the server —
 * and stays fully editable on its own afterwards.
 *
 * Client-safe.
 */

import { blankCanvas, newImageLayer, newLayerId, newShapeLayer, type CanvasSlide, type Layer } from "./canvas";
import { newSlideId } from "./design";
import { mosaicSize, mosaicSlice, type GridRows } from "./gridPlan";
import type { SocialBrand } from "./types";

/** Where a picture sits on the big canvas: its natural size and the framed part (image pixels). */
export type PicturePlacement = {
  url: string;
  width: number;
  height: number;
  crop: { left: number; top: number; width: number; height: number };
};

/** A fresh big canvas for `rows` rows, with the picture framed the way the crop tool showed it. */
export function pictureCanvas(brand: SocialBrand, rows: GridRows, pic: PicturePlacement): CanvasSlide {
  const { w, h } = mosaicSize(rows);
  const k = w / pic.crop.width; // canvas px per image px
  const photo: Layer = {
    ...newImageLayer(pic.url, { w: pic.width, h: pic.height }),
    name: "Picture",
    x: Math.round(-pic.crop.left * k),
    y: Math.round(-pic.crop.top * k),
    w: Math.round(pic.width * k),
    h: Math.round(pic.height * k),
  };
  return { ...blankCanvas(brand), w, h, layers: [photo] };
}

/** Does a layer's box (allowing for rotation) touch the rectangle? */
function touches(l: Layer, x: number, y: number, w: number, h: number): boolean {
  // A rotated box stays inside the circle around its centre.
  const pad = l.rotation ? Math.hypot(l.w, l.h) / 2 - Math.min(l.w, l.h) / 2 : 0;
  return l.x - pad < x + w && l.x + l.w + pad > x && l.y - pad < y + h && l.y + l.h + pad > y;
}

/** The big canvas cut into posts, in posting order (post 1 = bottom-right piece). */
export function splitPicture(big: CanvasSlide, rows: GridRows): CanvasSlide[] {
  const total = rows * 3;
  const W = big.w ?? mosaicSize(rows).w;
  const H = big.h ?? mosaicSize(rows).h;
  return Array.from({ length: total }, (_, i) => {
    const { x, y } = mosaicSlice(i + 1, total);
    const behind: Layer[] = [];
    // The background is per-slide, so anything that must run across posts
    // (a gradient, a background photo) becomes a layer spanning the picture.
    if (big.bg.gradient) {
      behind.push({
        ...newShapeLayer("NI", "rect"),
        name: "Background",
        x: -x,
        y: -y,
        w: W,
        h: H,
        fill: big.bg.color,
        gradient: `linear-gradient(${big.bg.gradient.angle}deg, ${big.bg.color}, ${big.bg.gradient.to})`,
        radius: 0,
        strokeWidth: 0,
      });
    }
    if (big.bg.image) {
      behind.push({
        ...newImageLayer(big.bg.image),
        name: "Background photo",
        x: -x,
        y: -y,
        w: W,
        h: H,
        opacity: big.bg.imageOpacity,
      });
    }
    const layers = big.layers
      .filter((l) => !l.hidden && touches(l, x, y, 1080, 1350))
      .map((l) => ({ ...l, id: newLayerId(), x: l.x - x, y: l.y - y }));
    return {
      id: newSlideId(),
      kind: "canvas" as const,
      bg: { ...big.bg, gradient: null, image: "" },
      layers: [...behind, ...layers],
    };
  });
}
