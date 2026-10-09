/**
 * Renders a designed post's slides to 1080×1350 JPEGs in the social-media
 * bucket. SERVER ONLY.
 *
 * SlideView → next/og ImageResponse (Satori + resvg) → PNG → sharp → JPEG
 * (Instagram only takes JPEG). Each file is named by a hash of the slide's
 * content + position, so an unchanged slide keeps its URL and isn't redrawn.
 * Photos are fetched and inlined as resized JPEG data URIs first — Satori
 * can't decode every format (WebP, HEIC) and big originals slow it down.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { supabaseServer } from "@/lib/supabaseServer";
import SlideView from "./SlideView";
import { SLIDE_FONTS, SLIDE_H, SLIDE_W, slideHash, type PostDesign, type Slide } from "./design";
import { SOCIAL_BUCKET, type SocialBrand, type SocialMedia } from "./types";

type FontOption = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700 | 800; style: "normal" | "italic" };

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
      const jpeg = await sharp(Buffer.from(await res.arrayBuffer()), { failOn: "none" })
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 86 })
        .toBuffer();
      out = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    }
  } catch {
    out = "";
  }
  cache.set(url, out);
  return out;
}

/** One slide → JPEG bytes. */
export async function renderSlideJpeg(
  slide: Slide,
  brand: SocialBrand,
  index: number,
  total: number,
  imageCache = new Map<string, string>(),
): Promise<Buffer> {
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

function fileName(slide: Slide, brand: SocialBrand, index: number, total: number): string {
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
