import type { StandardStore } from "./types";

/**
 * Dedup stores using `external_id` when present. Falls back to a composite key
 * of rounded lat/lng + normalized name, since overlapping grid searches often
 * return the same store with identical coordinates.
 */
export function dedupStores(stores: StandardStore[]): StandardStore[] {
  const seen = new Set<string>();
  const out: StandardStore[] = [];
  for (const s of stores) {
    const key = s.external_id
      ? `id:${s.external_id}`
      : fallbackKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function fallbackKey(s: StandardStore): string {
  const lat = s.latitude != null ? s.latitude.toFixed(5) : "";
  const lng = s.longitude != null ? s.longitude.toFixed(5) : "";
  const name = (s.store_name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return `fb:${lat}|${lng}|${name}`;
}
