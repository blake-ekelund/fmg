/** Plain-language formatting shared by the Purchasing page's pieces. */

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "BOTTLE 24-410 white PET…" → "Bottle — 24-410 white PET…" */
export function friendlyName(desc: string | undefined, part: string): string {
  if (!desc) return part;
  const m = desc.match(/^((?:[A-Z][A-Z+/&-]*\s)+)(.*)$/);
  if (!m) return desc;
  const head = m[1].trim().toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return `${head} — ${m[2]}`;
}

/** Fishbowl unit code → a word for a sentence ("1,024 boxes"). Eaches say nothing. */
export function unitWord(uom: string | null | undefined, qty: number): string {
  switch ((uom ?? "").toLowerCase()) {
    case "":
    case "ea":
      return "";
    case "bx":
      return qty === 1 ? "box" : "boxes";
    default:
      return uom ?? "";
  }
}

export const URGENCY_STYLE = {
  now: { label: "Order now", dot: "bg-red-500", pill: "bg-red-100 text-red-800", rank: 0 },
  soon: { label: "Order soon", dot: "bg-amber-400", pill: "bg-amber-100 text-amber-800", rank: 1 },
  later: { label: "Can wait", dot: "bg-green-500", pill: "bg-green-100 text-green-800", rank: 2 },
  check: { label: "Check first", dot: "bg-gray-400", pill: "bg-gray-200 text-gray-700", rank: 3 },
} as const;
