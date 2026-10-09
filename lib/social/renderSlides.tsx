/**
 * Renders a designed post's slides to 1080×1350 JPEGs in the social-media
 * bucket. SERVER ONLY.
 *
 * SlideView (template layouts) or CanvasView (free canvas) → next/og ImageResponse (Satori + resvg) → PNG → sharp → JPEG
 * (Instagram only takes JPEG). Each file is named by a hash of the slide's
 * content + position, so an unchanged slide keeps its URL and isn't redrawn.
 * Photos are fetched and inlined as resized JPEG data URIs first — Satori
 * can't decode every format (WebP, HEIC) and big originals slow it down.
 * A canvas photo bigger than the slide (a grid picture piece, a zoomed-in
 * photo) is cut down to just the part the slide shows, at full resolution,
 * so it isn't blurred by the 1600px cap.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { supabaseServer } from "@/lib/supabaseServer";
import SlideView from "./SlideView";
import CanvasView from "./CanvasView";
import { isCanvas, SLIDE_FONTS, SLIDE_H, SLIDE_W, slideHash, type DesignSlide, type PostDesign, type Slide } from "./design";
import { fontsUsed, hasPhotoAdjust, type CanvasSlide, type ImageLayer, type Layer, type PhotoAdjust } from "./canvas";
import { fontById } from "./fonts";
import { SOCIAL_BUCKET, type SocialBrand, type SocialMedia } from "./types";

type FontOption = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700 | 800; style: "normal" | "italic" };

const fontFiles = new Map<string, Promise<ArrayBuffer>>();

function fontFile(file: string): Promise<ArrayBuffer> {
  let p = fontFiles.get(file);
  if (!p) {
    p = readFile(path.join(process.cwd(), "public", "fonts", "social", file)).then(
      (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    );
    p.catch(() => fontFiles.delete(file));
    fontFiles.set(file, p);
  }
  return p;
}

/** Every variant of the fonts a canvas slide uses (+ Figtree as a fallback). */
async function canvasFonts(slide: CanvasSlide): Promise<FontOption[]> {
  const ids = new Set(["figtree", ...fontsUsed(slide)]);
  const out: FontOption[] = [];
  for (const id of ids) {
    const fam = fontById(id);
    for (const v of fam.variants) {
      out.push({ name: fam.family, data: await fontFile(v.file), weight: v.weight as FontOption["weight"], style: v.style });
    }
  }
  return out;
}

const textureCache = new Map<string, Promise<string>>();
function textureDataUri(id: string, tone: string): Promise<string> {
  const key = `${id}-${tone}`;
  let p = textureCache.get(key);
  if (!p) {
    p = readFile(path.join(process.cwd(), "public", "textures", "social", `${key}.png`)).then(
      (b) => `data:image/png;base64,${b.toString("base64")}`,
    );
    p.catch(() => textureCache.delete(key));
    textureCache.set(key, p);
  }
  return p;
}

let fontsPromise: Promise<FontOption[]> | null = null;

function loadFonts(): Promise<FontOption[]> {
  fontsPromise ??= Promise.all(
    SLIDE_FONTS.map(async (f) => {
      const buf = await readFile(path.join(process.cwd(), "public", "fonts", "social", f.file));
      return {
        name: f.family,
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        weight: f.weight as FontOption["weight"],
        style: f.style,
      };
    }),
  ).catch((e) => {
    fontsPromise = null;
    throw e;
  });
  return fontsPromise;
}

async function inlineImage(url: string, cache: Map<string, string>): Promise<string> {
  if (!url) return "";
  const hit = cache.get(url);
  if (hit !== undefined) return hit;
  let out = "";
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const img = sharp(Buffer.from(await res.arrayBuffer()), { failOn: "none" })
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true });
      // Keep transparency (cut-out product shots sit on the canvas color).
      if ((await img.metadata()).hasAlpha) {
        out = `data:image/png;base64,${(await img.png({ compressionLevel: 6 }).toBuffer()).toString("base64")}`;
      } else {
        out = `data:image/jpeg;base64,${(await img.jpeg({ quality: 86 }).toBuffer()).toString("base64")}`;
      }
    }
  } catch {
    out = "";
  }
  cache.set(url, out);
  return out;
}

/** One slide → JPEG bytes. */
export async function renderSlideJpeg(
  slide: DesignSlide,
  brand: SocialBrand,
  index: number,
  total: number,
  imageCache = new Map<string, string>(),
): Promise<Buffer> {
  if (isCanvas(slide)) return renderCanvasJpeg(slide, index, total, imageCache);
  const fonts = await loadFonts();
  const resolved: Slide = { ...slide, image: await inlineImage(slide.image, imageCache) };
  const res = new ImageResponse(<SlideView slide={resolved} brand={brand} index={index} total={total} />, {
    width: SLIDE_W,
    height: SLIDE_H,
    fonts,
  });
  const png = Buffer.from(await res.arrayBuffer());
  return sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

function fileName(slide: DesignSlide, brand: SocialBrand, index: number, total: number): string {
  return `${slideHash(slide, brand)}-${index}-${total}.jpg`;
}

/**
 * Make sure every slide has a current render. Returns the post's media in
 * slide order; slides whose render is already in `current` are reused.
 */
export async function renderDesign(
  postId: string,
  brand: SocialBrand,
  design: PostDesign,
  current: SocialMedia[],
): Promise<SocialMedia[]> {
  const total = design.slides.length;
  const have = new Set(current.map((m) => m.url));
  const cache = new Map<string, string>();
  const out: SocialMedia[] = [];

  for (let i = 0; i < total; i++) {
    const slide = design.slides[i];
    const storagePath = `slides/${postId}/${fileName(slide, brand, i + 1, total)}`;
    const url = supabaseServer.storage.from(SOCIAL_BUCKET).getPublicUrl(storagePath).data.publicUrl;
    if (!have.has(url)) {
      const jpeg = await renderSlideJpeg(slide, brand, i + 1, total, cache);
      const { error } = await supabaseServer.storage
        .from(SOCIAL_BUCKET)
        .upload(storagePath, jpeg, { contentType: "image/jpeg", cacheControl: "31536000", upsert: true });
      if (error) throw new Error(`Couldn't save slide ${i + 1}: ${error.message}`);
    }
    out.push({ url, kind: "image" });
  }
  return out;
}

/** True when the post's media already matches its design (no render needed). */
export function designIsRendered(postId: string, brand: SocialBrand, design: PostDesign, media: SocialMedia[]): boolean {
  const total = design.slides.length;
  if (media.length !== total) return false;
  return design.slides.every((s, i) => media[i]?.url.endsWith(`/slides/${postId}/${fileName(s, brand, i + 1, total)}`));
}

/** Original image bytes (EXIF-rotated) per render batch, for cropping big photo layers. */
const originals = new WeakMap<Map<string, string>, Map<string, Promise<{ data: Buffer; width: number; height: number; alpha: boolean } | null>>>();

function original(url: string, cache: Map<string, string>) {
  let m = originals.get(cache);
  if (!m) originals.set(cache, (m = new Map()));
  let p = m.get(url);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return null;
        const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()), { failOn: "none" })
          .rotate()
          .toBuffer({ resolveWithObject: true });
        return { data, width: info.width, height: info.height, alpha: info.channels === 4 };
      } catch {
        return null;
      }
    })();
    m.set(url, p);
  }
  return p;
}

/** The layer without its adjustment fields (the server output has them baked in). */
function plainPhoto(l: ImageLayer): ImageLayer {
  const { brightness, contrast, saturation, grayscale, blur, flipX, flipY, focusX, focusY, ...rest } = l;
  void [brightness, contrast, saturation, grayscale, blur, flipX, flipY, focusX, focusY];
  return rest;
}

/** Apply brightness → contrast → saturation → black & white → blur, matching the CSS filter order. */
function adjustPixels(img: sharp.Sharp, a: PhotoAdjust, pxPerSlidePx: number): sharp.Sharp {
  const b = 1 + (a.brightness ?? 0) / 100;
  const k = 1 + (a.contrast ?? 0) / 100;
  // CSS brightness(b) then contrast(k):  out = (in·b − 128)·k + 128
  if (b !== 1 || k !== 1) img = img.linear(b * k, 128 * (1 - k));
  if (a.saturation) img = img.modulate({ saturation: Math.max(0, 1 + a.saturation / 100) });
  if (a.grayscale) img = img.grayscale();
  if (a.blur) img = img.blur(Math.max(0.3, a.blur * pxPerSlidePx));
  return img;
}

/**
 * Photo layers are drawn from the original when they need it: when they spill
 * past the slide or are bigger than the 1600px cap (cut to just the visible
 * part, at full resolution — grid pictures stay sharp), and when they have
 * adjustments, a flip or a moved focus (baked into the pixels, since the
 * server renderer can't do CSS filters). Rotated / rounded / bordered photos
 * keep their whole box so their shape is right. Null = nothing visible.
 */
async function croppedLayer(l: ImageLayer, cache: Map<string, string>): Promise<ImageLayer | null> {
  const spills = l.x < 0 || l.y < 0 || l.x + l.w > SLIDE_W || l.y + l.h > SLIDE_H;
  const big = l.w > 1600 || l.h > 1600;
  const adjusted = hasPhotoAdjust(l);
  if (!spills && !big && !adjusted) return { ...l, src: await inlineImage(l.src, cache) };
  const img = await original(l.src, cache);
  if (!img) return { ...plainPhoto(l), src: "" };

  const clip = !l.rotation && !l.radius && !l.borderWidth;
  const bw = l.borderWidth;
  const box = { x: l.x + bw, y: l.y + bw, w: Math.max(1, l.w - bw * 2), h: Math.max(1, l.h - bw * 2) };

  // Where the whole image is drawn in the box (object-fit + object-position),
  // then mirrored around the box centre for a flip.
  const s = l.fit === "contain" ? Math.min(box.w / img.width, box.h / img.height) : Math.max(box.w / img.width, box.h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  let ox = box.x + (box.w - dw) * (l.focusX ?? 0.5);
  let oy = box.y + (box.h - dh) * (l.focusY ?? 0.5);
  if (l.flipX) ox = 2 * box.x + box.w - ox - dw;
  if (l.flipY) oy = 2 * box.y + box.h - oy - dh;

  // The visible part: inside the box, the drawn image and (when clipping) the slide.
  const x0 = Math.max(box.x, ox, clip ? 0 : -Infinity);
  const y0 = Math.max(box.y, oy, clip ? 0 : -Infinity);
  const x1 = Math.min(box.x + box.w, ox + dw, clip ? SLIDE_W : Infinity);
  const y1 = Math.min(box.y + box.h, oy + dh, clip ? SLIDE_H : Infinity);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;

  // Unclipped boxes can be huge (a rotated grid photo) — cap the output size.
  const cap = Math.min(1, 2400 / Math.max(x1 - x0, y1 - y0));
  const outW = Math.max(1, Math.round((x1 - x0) * cap));
  const outH = Math.max(1, Math.round((y1 - y0) * cap));

  // Source rectangle in the (flipped) original.
  let base = sharp(img.data);
  if (l.flipX) base = base.flop();
  if (l.flipY) base = base.flip();
  const left = Math.max(0, Math.min(img.width - 1, Math.round((x0 - ox) / s)));
  const top = Math.max(0, Math.min(img.height - 1, Math.round((y0 - oy) / s)));
  const width = Math.max(1, Math.min(img.width - left, Math.round((x1 - x0) / s)));
  const height = Math.max(1, Math.min(img.height - top, Math.round((y1 - y0) / s)));
  const flat = await base.extract({ left, top, width, height }).toBuffer();
  let piece = adjustPixels(sharp(flat).resize(outW, outH, { fit: "fill" }), l, outW / (x1 - x0));

  let alpha = img.alpha;
  let at = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  if (!clip) {
    // Keep the whole box (rotation / rounding / border depend on it): place the
    // visible part on a transparent canvas the size of the box.
    const bwOut = Math.max(1, Math.round(box.w * cap));
    const bhOut = Math.max(1, Math.round(box.h * cap));
    const partBuf = await piece.png().toBuffer();
    piece = sharp({ create: { width: bwOut, height: bhOut, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
      { input: partBuf, left: Math.round((x0 - box.x) * cap), top: Math.round((y0 - box.y) * cap) },
    ]);
    alpha = true;
    at = { x: l.x, y: l.y, w: l.w, h: l.h };
  }
  const src = alpha
    ? `data:image/png;base64,${(await piece.png({ compressionLevel: 6 }).toBuffer()).toString("base64")}`
    : `data:image/jpeg;base64,${(await piece.jpeg({ quality: 90 }).toBuffer()).toString("base64")}`;
  return {
    ...plainPhoto(l),
    src,
    x: Math.round(at.x),
    y: Math.round(at.y),
    w: Math.round(at.w),
    h: Math.round(at.h),
    fit: "cover",
  };
}

async function renderCanvasJpeg(slide: CanvasSlide, index: number, total: number, cache: Map<string, string>): Promise<Buffer> {
  const layers = await Promise.all(slide.layers.map(async (l): Promise<Layer | null> => (l.type === "image" ? croppedLayer(l, cache) : l)));
  const resolved: CanvasSlide = {
    ...slide,
    bg: { ...slide.bg, image: await inlineImage(slide.bg.image, cache) },
    layers: layers.filter((l): l is Layer => l !== null),
  };
  const textures = new Map<string, string>();
  if (slide.bg.texture) textures.set(`${slide.bg.texture}-${slide.bg.textureTone}`, await textureDataUri(slide.bg.texture, slide.bg.textureTone));
  const res = new ImageResponse(
    <CanvasView slide={resolved} index={index} total={total} textureSrc={(id, tone) => textures.get(`${id}-${tone}`) ?? ""} />,
    { width: SLIDE_W, height: SLIDE_H, fonts: await canvasFonts(slide) },
  );
  const png = Buffer.from(await res.arrayBuffer());
  return sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}
