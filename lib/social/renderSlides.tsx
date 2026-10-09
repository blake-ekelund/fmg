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
import { fontsUsed, type CanvasSlide, type ImageLayer, type Layer } from "./canvas";
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

/**
 * A photo layer that spills past the slide or is drawn bigger than the 1600px
 * cap: crop the original to just the visible part (after cover/contain
 * fitting) at the size it's shown. Rotated or rounded/bordered photos keep the
 * simple path (their shape depends on the whole box). Null = nothing visible.
 */
async function croppedLayer(l: ImageLayer, cache: Map<string, string>): Promise<ImageLayer | null> {
  const spills = l.x < 0 || l.y < 0 || l.x + l.w > SLIDE_W || l.y + l.h > SLIDE_H;
  const big = l.w > 1600 || l.h > 1600;
  if ((!spills && !big) || l.rotation || l.radius || l.borderWidth) return { ...l, src: await inlineImage(l.src, cache) };
  const img = await original(l.src, cache);
  if (!img) return { ...l, src: "" };

  // Where the whole image is drawn (object-fit inside the layer box)…
  const s = l.fit === "contain" ? Math.min(l.w / img.width, l.h / img.height) : Math.max(l.w / img.width, l.h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  const ox = l.x + (l.w - dw) / 2;
  const oy = l.y + (l.h - dh) / 2;
  // …and the part of it inside both the layer box (cover crops to it) and the slide.
  const x0 = Math.max(0, l.x, ox);
  const y0 = Math.max(0, l.y, oy);
  const x1 = Math.min(SLIDE_W, l.x + l.w, ox + dw);
  const y1 = Math.min(SLIDE_H, l.y + l.h, oy + dh);
  const outW = Math.round(x1 - x0);
  const outH = Math.round(y1 - y0);
  if (outW < 1 || outH < 1) return null;

  const left = Math.max(0, Math.min(img.width - 1, Math.round((x0 - ox) / s)));
  const top = Math.max(0, Math.min(img.height - 1, Math.round((y0 - oy) / s)));
  const width = Math.max(1, Math.min(img.width - left, Math.round((x1 - x0) / s)));
  const height = Math.max(1, Math.min(img.height - top, Math.round((y1 - y0) / s)));
  const piece = sharp(img.data).extract({ left, top, width, height }).resize(outW, outH, { fit: "fill" });
  const src = img.alpha
    ? `data:image/png;base64,${(await piece.png({ compressionLevel: 6 }).toBuffer()).toString("base64")}`
    : `data:image/jpeg;base64,${(await piece.jpeg({ quality: 90 }).toBuffer()).toString("base64")}`;
  return { ...l, src, x: Math.round(x0), y: Math.round(y0), w: outW, h: outH, fit: "cover" };
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
