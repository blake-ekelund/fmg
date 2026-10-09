/**
 * Photo frames: the shape a photo layer is cut to. Circle, arch and pill are
 * rounded corners; the rest clip the photo to an SVG path (CSS clip-path:
 * path(), which the server renderer supports too). Paths are drawn in a
 * 100×100 box and scaled to the layer. Client-safe.
 */

import type { CSSProperties } from "react";
import { STICKERS, type StickerId } from "./stickers";

export type FrameId = "circle" | "arch" | "pill" | "heart" | "star" | "burst" | "flower" | "drop" | "leaf" | "blob" | "hexagon";

const sticker = (id: StickerId) => STICKERS.find((s) => s.id === id)!.d;

/** `path` = clip shape; `preview` = what the picker shows for the corner-based ones. */
export const FRAMES: { id: FrameId; label: string; path?: string; preview: string }[] = [
  { id: "circle", label: "Circle", preview: "M4 50 A46 46 0 1 0 96 50 A46 46 0 1 0 4 50 Z" },
  { id: "arch", label: "Arch", preview: "M8 96 V46 A42 42 0 0 1 92 46 V96 Z" },
  { id: "pill", label: "Pill", preview: "M30 6 H70 A24 24 0 0 1 94 30 V70 A24 24 0 0 1 70 94 H30 A24 24 0 0 1 6 70 V30 A24 24 0 0 1 30 6 Z" },
  { id: "heart", label: "Heart", path: sticker("heart"), preview: sticker("heart") },
  { id: "star", label: "Star", path: sticker("star"), preview: sticker("star") },
  { id: "burst", label: "Burst", path: sticker("burst"), preview: sticker("burst") },
  { id: "flower", label: "Flower", path: sticker("flower"), preview: sticker("flower") },
  { id: "drop", label: "Drop", path: sticker("drop"), preview: sticker("drop") },
  { id: "leaf", label: "Leaf", path: sticker("leaf"), preview: sticker("leaf") },
  {
    id: "blob",
    label: "Blob",
    path: "M50 4 C74 2 97 20 95 46 C93 74 76 97 49 96 C23 95 4 77 5 51 C6 25 27 6 50 4 Z",
    preview: "M50 4 C74 2 97 20 95 46 C93 74 76 97 49 96 C23 95 4 77 5 51 C6 25 27 6 50 4 Z",
  },
  { id: "hexagon", label: "Hexagon", path: "M26 4 H74 L98 50 L74 96 H26 L2 50 Z", preview: "M26 4 H74 L98 50 L74 96 H26 L2 50 Z" },
];

const BY_ID = new Map(FRAMES.map((f) => [f.id, f]));

export function isFrameId(v: unknown): v is FrameId {
  return typeof v === "string" && BY_ID.has(v as FrameId);
}

/** True when the frame clips to a path (no border; soft shadows don't follow it). */
export function isPathFrame(id: FrameId | undefined): boolean {
  return !!id && !!BY_ID.get(id)?.path;
}

/** Corner rounding for the corner-based frames. */
export function frameRadius(id: FrameId | undefined, w: number, h: number): CSSProperties | null {
  if (id === "circle") return { borderRadius: "50%" };
  if (id === "arch") return { borderTopLeftRadius: w / 2, borderTopRightRadius: w / 2, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 };
  if (id === "pill") return { borderRadius: Math.min(w, h) / 2 };
  return null;
}

/** CSS clip-path for a path frame at the layer's size, or undefined. */
export function frameClip(id: FrameId | undefined, w: number, h: number): string | undefined {
  const d = id ? BY_ID.get(id)?.path : undefined;
  return d ? `path('${scalePath(d, w / 100, h / 100)}')` : undefined;
}

/* ─── Path scaling (absolute commands only: M L H V C S Q T A Z) ───── */

const ARGS: Record<string, string> = { M: "xy", L: "xy", T: "xy", H: "x", V: "y", C: "xyxyxy", S: "xyxy", Q: "xyxy", A: "xy---xy", Z: "" };

function tokens(d: string): string[] {
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur) out.push(cur);
    cur = "";
  };
  for (const ch of d) {
    const isLetter = (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z");
    if (isLetter && ch !== "e" && ch !== "E") {
      flush();
      out.push(ch);
    } else if (ch === " " || ch === ",") {
      flush();
    } else if (ch === "-" && cur && cur[cur.length - 1] !== "e" && cur[cur.length - 1] !== "E") {
      flush();
      cur = ch;
    } else {
      cur += ch;
    }
  }
  flush();
  return out;
}

const isCommand = (s: string) => s.length === 1 && ARGS[s.toUpperCase()] !== undefined;

/** Scale an absolute SVG path by sx, sy. Arc radii scale too; arc flags/rotation don't. */
export function scalePath(d: string, sx: number, sy: number): string {
  const t = tokens(d);
  const out: string[] = [];
  const r = (n: number) => String(Math.round(n * 100) / 100);
  let i = 0;
  while (i < t.length) {
    const cmd = t[i++];
    const pattern = ARGS[cmd.toUpperCase()];
    if (pattern === undefined) continue;
    out.push(cmd.toUpperCase());
    if (!pattern) continue;
    // A command can repeat its argument groups.
    while (i < t.length && !isCommand(t[i])) {
      for (let k = 0; k < pattern.length && i < t.length; k++) {
        const v = Number(t[i++]);
        const kind = pattern[k];
        // Arc: rx (x), ry (y), rotation, large-arc, sweep (unchanged), x, y.
        out.push(kind === "x" ? r(v * sx) : kind === "y" ? r(v * sy) : r(v));
      }
    }
  }
  return out.join(" ");
}
