import type { ResponseConfig, StandardStore } from "./types";

/** Resolve a dotted path like "a.b.c" against an object. Returns null if missing. */
export function getPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return null;
  if (obj == null) return null;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur ?? null;
}

function toStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Extract the stores array from a raw API response using `storesJsonPath`. */
export function extractStoresArray(
  raw: unknown,
  config: ResponseConfig,
): unknown[] {
  const node = config.storesJsonPath ? getPath(raw, config.storesJsonPath) : raw;
  return Array.isArray(node) ? node : [];
}

/** Map a single raw store object into our standard schema. */
export function mapStore(
  rawStore: unknown,
  config: ResponseConfig,
): StandardStore {
  const m = config.fieldMappings ?? {};
  const mapped: StandardStore = {
    external_id: toStringOrNull(getPath(rawStore, config.externalIdField)),
    store_name: toStringOrNull(getPath(rawStore, m.store_name)),
    address: toStringOrNull(getPath(rawStore, m.address)),
    city: toStringOrNull(getPath(rawStore, m.city)),
    state: toStringOrNull(getPath(rawStore, m.state)),
    zip: toStringOrNull(getPath(rawStore, m.zip)),
    country: toStringOrNull(getPath(rawStore, m.country)),
    phone: toStringOrNull(getPath(rawStore, m.phone)),
    latitude: toNumberOrNull(getPath(rawStore, m.latitude)),
    longitude: toNumberOrNull(getPath(rawStore, m.longitude)),
    raw_json: rawStore,
  };

  if (config.addressFormat === "street-city-state-zip-country" && mapped.address) {
    applyAddressSplit(mapped);
  }

  return mapped;
}

/**
 * Split a comma-separated "street, city, state, zip, country" string into its
 * components. Leaves already-populated fields alone; only fills blanks. Safe
 * for well-formed inputs from platforms that serialize addresses consistently
 * (e.g. Storepoint's `streetaddress`).
 */
function applyAddressSplit(s: StandardStore): void {
  if (!s.address) return;
  const parts = s.address.split(/,\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return; // too short to be a full address
  // Pull from the END so we correctly handle street components that themselves
  // contain commas (e.g. "123 Main St, Suite 4, City, State, ZIP, Country").
  const country = parts.pop() ?? null;
  const zip = parts.pop() ?? null;
  const state = parts.pop() ?? null;
  const city = parts.pop() ?? null;
  const street = parts.join(", ");
  if (!s.country) s.country = country;
  if (!s.zip) s.zip = zip;
  if (!s.state) s.state = state;
  if (!s.city) s.city = city;
  s.address = street || s.address;
}
