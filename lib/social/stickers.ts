/**
 * Stickers: simple filled shapes (heart, star, sparkle, leaf…) drawn as one
 * SVG path in a 100×100 box, in any colour. The same path renders in the
 * editor and on the server (Satori draws inline SVG). Client-safe.
 */

export type StickerId =
  | "heart"
  | "star"
  | "sparkle"
  | "sparkles"
  | "burst"
  | "sun"
  | "moon"
  | "flower"
  | "leaf"
  | "drop"
  | "crown"
  | "bubble"
  | "arrow"
  | "check"
  | "plus";

const f = (n: number) => Math.round(n * 100) / 100;

/** A closed polygon alternating between two radii (stars, bursts). */
function starPath(points: number, outer: number, inner: number, cx = 50, cy = 50, rot = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    pts.push(`${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`);
  }
  return `M${pts.join(" L")} Z`;
}

/** A four-point sparkle with curved sides. */
function sparklePath(cx: number, cy: number, r: number): string {
  const k = r * 0.12;
  return `M${f(cx)} ${f(cy - r)} Q${f(cx + k)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + r)} Q${f(cx - k)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - r)} Z`;
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)} ${f(cy)} A${r} ${r} 0 1 0 ${f(cx + r)} ${f(cy)} A${r} ${r} 0 1 0 ${f(cx - r)} ${f(cy)} Z`;
}

function sunPath(): string {
  const rays: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    const w = (7 * Math.PI) / 180;
    const p = (r: number, d: number) => `${f(50 + r * Math.cos(a + d))} ${f(50 + r * Math.sin(a + d))}`;
    rays.push(`M${p(30, -w)} L${p(48, 0)} L${p(30, w)} Z`);
  }
  return `${circlePath(50, 50, 24)} ${rays.join(" ")}`;
}

function flowerPath(): string {
  const petals: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * 60 * Math.PI) / 180;
    petals.push(circlePath(50 + 25 * Math.cos(a), 50 + 25 * Math.sin(a), 20));
  }
  return `${petals.join(" ")} ${circlePath(50, 50, 16)}`;
}

export const STICKERS: { id: StickerId; label: string; d: string }[] = [
  { id: "heart", label: "Heart", d: "M50 90 C22 68 4 50 4 31 C4 16 15 6 29 6 C39 6 46 12 50 20 C54 12 61 6 71 6 C85 6 96 16 96 31 C96 50 78 68 50 90 Z" },
  { id: "star", label: "Star", d: starPath(5, 48, 20) },
  { id: "sparkle", label: "Sparkle", d: sparklePath(50, 50, 48) },
  { id: "sparkles", label: "Sparkles", d: `${sparklePath(38, 58, 36)} ${sparklePath(78, 20, 16)} ${sparklePath(82, 70, 11)}` },
  { id: "burst", label: "Burst", d: starPath(16, 48, 39) },
  { id: "sun", label: "Sun", d: sunPath() },
  { id: "moon", label: "Moon", d: "M64 6 A46 46 0 1 0 94 72 A36 36 0 1 1 64 6 Z" },
  { id: "flower", label: "Flower", d: flowerPath() },
  { id: "leaf", label: "Leaf", d: "M8 92 C8 40 40 8 92 8 C92 60 60 92 8 92 Z" },
  { id: "drop", label: "Drop", d: "M50 4 C50 4 16 46 16 66 C16 85 31 96 50 96 C69 96 84 85 84 66 C84 46 50 4 50 4 Z" },
  { id: "crown", label: "Crown", d: "M8 82 L14 28 L33 50 L50 14 L67 50 L86 28 L92 82 Z" },
  { id: "bubble", label: "Speech", d: "M12 10 H88 Q96 10 96 18 V62 Q96 70 88 70 H44 L22 92 L26 70 H12 Q4 70 4 62 V18 Q4 10 12 10 Z" },
  { id: "arrow", label: "Arrow", d: "M6 38 H58 V16 L96 50 L58 84 V62 H6 Z" },
  { id: "check", label: "Check", d: "M6 54 L21 39 L40 58 L79 18 L94 33 L40 88 Z" },
  { id: "plus", label: "Plus", d: "M38 6 H62 V38 H94 V62 H62 V94 H38 V62 H6 V38 H38 Z" },
];

const BY_ID = new Map(STICKERS.map((s) => [s.id, s]));

export function isStickerId(v: unknown): v is StickerId {
  return typeof v === "string" && BY_ID.has(v as StickerId);
}

export function stickerPath(id: StickerId): string {
  return BY_ID.get(id)?.d ?? STICKERS[0].d;
}
