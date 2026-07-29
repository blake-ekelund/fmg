/**
 * Shrink + normalise an image before it goes into an email.
 *
 * Photos exported for print or straight off a phone are often 3000–5000px wide
 * and several megabytes — an email only ever renders at ~600px, so uploading
 * the original bloats the message and loads slowly in the inbox. We cap the
 * width at a retina-friendly size and re-encode: JPEG for photos (much smaller),
 * PNG kept as PNG so logos with transparency survive.
 *
 * GIFs (possibly animated) and SVGs (vector) are passed through untouched —
 * a canvas round-trip would flatten the animation or rasterise the vector.
 *
 * Best-effort: any failure falls back to the original file rather than blocking
 * the upload.
 */

// Email content columns render at ~600px wide. 800px keeps the image crisp on
// high-DPI screens without shipping a print-sized file to every inbox — a
// 3000px product shot drops to a fraction of its original weight here.
const MAX_WIDTH = 800;
const JPEG_QUALITY = 0.78;

export type ResizedImage = {
  blob: Blob;
  name: string;
  type: string;
  width: number;
  height: number;
};

function passthrough(file: File, width = 0, height = 0): ResizedImage {
  return { blob: file, name: file.name, type: file.type, width, height };
}

export async function resizeImageForEmail(file: File): Promise<ResizedImage> {
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return passthrough(file);
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return passthrough(file, bitmap.width, bitmap.height);
    }

    // PNG keeps its alpha channel; JPEG has none, so flatten onto white first.
    const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
    if (outType === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outType, outType === "image/jpeg" ? JPEG_QUALITY : undefined),
    );
    if (!blob) return passthrough(file, w, h);

    // Guard against the pathological case where re-encoding made it bigger
    // (already-tiny, already-optimised images) — keep whichever is smaller.
    if (blob.size >= file.size && file.type === outType) {
      return passthrough(file, w, h);
    }

    const ext = outType === "image/png" ? "png" : "jpg";
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return { blob, name: `${base}.${ext}`, type: outType, width: w, height: h };
  } catch {
    return passthrough(file);
  }
}
