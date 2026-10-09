"use client";

import { useRef, useState } from "react";
import { ImagePlus, ZoomIn } from "lucide-react";
import { MOSAIC_BLEED, MOSAIC_VISIBLE_W, mosaicSize, mosaicSlice, type GridRows } from "@/lib/social/gridPlan";

/**
 * Split one picture across the grid: pick a photo, zoom and drag it into the
 * frame (the shape the 2/3/4 rows make on the profile), then slice it into
 * one 1080×1350 post per square — see mosaicSlice in lib/social/gridPlan.ts.
 * Everything happens in the browser on the original file (full resolution).
 */

export type Crop = { zoom: number; cx: number; cy: number };

type Loaded = { img: HTMLImageElement; w: number; h: number; name: string };

/** The part of the picture in the frame, in image pixels. */
export function cropRect(l: { w: number; h: number }, rows: GridRows, c: Crop) {
  const { w: fw, h: fh } = mosaicSize(rows);
  const aspect = fw / fh;
  const baseW = l.w / l.h > aspect ? l.h * aspect : l.w;
  const width = baseW / c.zoom;
  const height = width / aspect;
  const left = Math.min(Math.max(c.cx - width / 2, 0), l.w - width);
  const top = Math.min(Math.max(c.cy - height / 2, 0), l.h - height);
  return { left, top, width, height, scale: width / fw };
}

/** Slice the framed picture into `rows * 3` JPEG posts, in posting order. */
export async function slicePicture(l: Loaded, rows: GridRows, c: Crop): Promise<Blob[]> {
  const total = rows * 3;
  const r = cropRect(l, rows, c);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  const out: Blob[] = [];
  for (let n = 1; n <= total; n++) {
    const { x, y } = mosaicSlice(n, total);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.drawImage(l.img, r.left + x * r.scale, r.top + y * r.scale, 1080 * r.scale, 1350 * r.scale, 0, 0, 1080, 1350);
    out.push(await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't cut the picture."))), "image/jpeg", 0.92)));
  }
  return out;
}

/** The whole framed picture, small, as base64 JPEG — what Claude looks at to write captions. */
export function overviewJpeg(l: Loaded, rows: GridRows, c: Crop, maxW = 1400): string {
  const r = cropRect(l, rows, c);
  const w = Math.min(maxW, Math.round(r.width));
  const h = Math.round(w * (r.height / r.width));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(l.img, r.left, r.top, r.width, r.height, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

export async function loadPicture(file: File): Promise<Loaded> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { img, w: img.naturalWidth, h: img.naturalHeight, name: file.name };
}

export type { Loaded as LoadedPicture };

export default function MosaicCropper({
  rows,
  picture,
  crop,
  onPicture,
  onCrop,
}: {
  rows: GridRows;
  picture: Loaded | null;
  crop: Crop;
  onPicture: (p: Loaded) => void;
  onCrop: (c: Crop) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const FRAME_W = 420;
  const { w: fw, h: fh } = mosaicSize(rows);
  const frameH = Math.round((FRAME_W * fh) / fw);
  const px = FRAME_W / fw; // frame px per post px

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const p = await loadPicture(file);
      onPicture(p);
      onCrop({ zoom: 1, cx: p.w / 2, cy: p.h / 2 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open that picture.");
    }
  }

  if (!picture) {
    return (
      <div>
        <button
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void pick(e.dataTransfer.files[0]);
          }}
          className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-6 py-10 text-sm text-gray-500 hover:border-gray-400 hover:bg-gray-50"
        >
          <ImagePlus size={26} className="text-gray-400" />
          <span className="font-medium text-gray-800">Choose a picture, or drop it here</span>
          <span className="text-xs">A big, sharp photo works best — at least 3000 px wide.</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  const r = cropRect(picture, rows, crop);
  const s = FRAME_W / r.width; // frame px per image px
  const soft = r.scale < 0.6; // each post would be upscaled noticeably

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div
        className="relative shrink-0 cursor-grab touch-none overflow-hidden rounded-lg bg-gray-100 active:cursor-grabbing"
        style={{
          width: FRAME_W,
          height: frameH,
          backgroundImage: `url(${picture.img.src})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${picture.w * s}px ${picture.h * s}px`,
          backgroundPosition: `${-r.left * s}px ${-r.top * s}px`,
        }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          onCrop({ ...crop, cx: d.cx - (e.clientX - d.x) / s, cy: d.cy - (e.clientY - d.y) / s });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        {/* Bleed strips: in the feed only, not on the grid. */}
        <span className="pointer-events-none absolute inset-y-0 left-0 bg-white/50" style={{ width: MOSAIC_BLEED * px }} />
        <span className="pointer-events-none absolute inset-y-0 right-0 bg-white/50" style={{ width: MOSAIC_BLEED * px }} />
        {[1, 2].map((k) => (
          <span key={k} className="pointer-events-none absolute inset-y-0 w-px bg-white/80" style={{ left: (MOSAIC_BLEED + k * MOSAIC_VISIBLE_W) * px }} />
        ))}
        {Array.from({ length: rows - 1 }, (_, k) => (
          <span key={k} className="pointer-events-none absolute inset-x-0 h-px bg-white/80" style={{ top: (k + 1) * 1350 * px }} />
        ))}
      </div>

      <div className="min-w-0 flex-1 space-y-3 text-sm">
        <p className="text-xs text-gray-500">
          Drag the picture to place it. Lines show where it&apos;s cut into {rows * 3} posts; the faded edges only show in the feed, not on
          the grid.
        </p>
        <label className="block text-xs text-gray-500">
          <span className="mb-1 inline-flex items-center gap-1">
            <ZoomIn size={12} /> Zoom
          </span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={crop.zoom}
            onChange={(e) => onCrop({ ...crop, zoom: Number(e.target.value) })}
            className="block w-full"
          />
        </label>
        {soft && (
          <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
            This picture is small for {rows * 3} posts — each one will look a little soft. A larger photo (or less zoom) is sharper.
          </p>
        )}
        <button onClick={() => fileRef.current?.click()} className="text-xs font-medium text-gray-600 underline-offset-2 hover:underline">
          Use a different picture
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
