import { createHash } from "crypto";
import sharp from "sharp";

/**
 * Web-ready version of an uploaded image. SERVER ONLY (sharp).
 *
 * Phone and camera originals arrive at 1–5 MB / 4000+ px; every place we use
 * them (storefront galleries, emails, Sage, social, rep downloads) wants ≤ 2400
 * px and a few hundred KB. So on the way in we:
 *   - auto-rotate from EXIF, then strip EXIF/GPS (privacy + bytes),
 *   - cap the long edge at MAX_EDGE (never upscale),
 *   - JPEG (mozjpeg) for opaque images, PNG only when there's real transparency.
 * WebP is deliberately NOT used: Outlook desktop can't show it, and the same
 * file goes into emails. Storefronts re-encode per device via next/image anyway.
 *
 * GIF (may be animated) and SVG are stored as-is.
 */

export const MAX_EDGE = 2400;
const JPEG_QUALITY = 82;

export type Optimized = {
  data: Buffer;
  contentType: string;
  ext: string;
  width: number | null;
  height: number | null;
  /** True when we kept the original bytes (already small / not re-encodable). */
  untouched: boolean;
};

export function sha256(buf: Buffer | Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function optimizeImage(input: Buffer, contentType: string): Promise<Optimized> {
  const type = contentType.toLowerCase();
  if (type.includes("svg") || type.includes("gif")) {
    return {
      data: input,
      contentType: type.includes("svg") ? "image/svg+xml" : "image/gif",
      ext: type.includes("svg") ? "svg" : "gif",
      width: null,
      height: null,
      untouched: true,
    };
  }

  const img = sharp(input, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  // After .rotate(), EXIF orientations 5–8 swap the axes.
  const swap = (meta.orientation ?? 1) >= 5;
  const w0 = (swap ? meta.height : meta.width) ?? 0;
  const h0 = (swap ? meta.width : meta.height) ?? 0;

  let hasAlpha = false;
  if (meta.hasAlpha) {
    // An alpha channel that's fully opaque everywhere isn't transparency.
    const { channels } = await sharp(input, { failOn: "none" }).stats();
    hasAlpha = (channels[3]?.min ?? 255) < 255;
  }

  const resized = img.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });
  const out = hasAlpha
    ? await resized.png({ compressionLevel: 9, palette: false }).toBuffer({ resolveWithObject: true })
    : await resized
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, progressive: true })
        .toBuffer({ resolveWithObject: true });

  // Already-lean files: keep the original if re-encoding didn't help and it's
  // in a format we'd produce anyway (no point re-compressing a 120 KB JPEG).
  const sameFormat = hasAlpha ? type.includes("png") : /jpe?g/.test(type);
  if (sameFormat && out.data.length >= input.length && Math.max(w0, h0) <= MAX_EDGE && !meta.exif) {
    return {
      data: input,
      contentType: hasAlpha ? "image/png" : "image/jpeg",
      ext: hasAlpha ? "png" : "jpg",
      width: w0 || null,
      height: h0 || null,
      untouched: true,
    };
  }

  return {
    data: out.data,
    contentType: hasAlpha ? "image/png" : "image/jpeg",
    ext: hasAlpha ? "png" : "jpg",
    width: out.info.width,
    height: out.info.height,
    untouched: false,
  };
}

/** A small JPEG for sending to a vision model (≈1–1.5k tokens instead of 5k+). */
export async function previewForVision(input: Buffer): Promise<string> {
  const buf = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80 })
    .toBuffer();
  return buf.toString("base64");
}

/** "Sassy Eucalyptus Hand + Face Wash" → "sassy-eucalyptus-hand-face-wash". */
export function seoSlug(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/&|\+/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80)
    .replace(/-+$/, "");
}
