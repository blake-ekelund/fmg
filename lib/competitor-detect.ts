/**
 * Platform detection for competitor store-locator pages.
 *
 * Given a locator page URL, probes known patterns (Stockist first) and returns
 * a ready-to-use config if a match is found. New platforms can be added by
 * pushing a detector onto the DETECTORS array.
 */

export type DetectedConfig = {
  platform: "stockist" | "storepoint" | "agile" | "storemapper";
  base_url: string;
  endpoint_path: string;
  /** Optional override for the competitor's `rate_limit_ms` column. */
  rate_limit_ms?: number;
  request_config: {
    method: "GET";
    latParam: string;
    lngParam: string;
    radiusParam: string;
    radiusValue: number;
    radiusUnit: "mi" | "km" | "m";
    extraParams: Record<string, string | number | boolean>;
    headers: Record<string, string>;
    originalLocatorUrl: string;
    /** When true, the API returns all locations in one call — skip the grid sweep. */
    singleCall?: boolean;
  };
  response_config: {
    storesJsonPath: string;
    externalIdField: string;
    fieldMappings: Record<string, string>;
    /**
     * Optional hint that the address field is a single concatenated string of
     * "street, city, state, zip, country" that the mapper should split.
     */
    addressFormat?: "street-city-state-zip-country";
    /** "jsonp" means the scraper strips a `callback(...)` wrapper before parsing. */
    responseFormat?: "json" | "jsonp";
  };
};

export type DetectionResult =
  | { ok: true; config: DetectedConfig }
  | { ok: false; reason: string };

const REALISTIC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const PROBE_LAT = 39.5;
const PROBE_LNG = -98.5;
const PROBE_RADIUS = 100;
const PROBE_TIMEOUT_MS = 10_000;

type DetectorContext = { pageUrl: string; html: string | null };

/** Ordered list of platform detectors. First match wins. */
const DETECTORS: Array<(ctx: DetectorContext) => Promise<DetectedConfig | null>> = [
  detectStorepoint,
  detectAgileStoreLocator,
  detectStoremapper,
  detectStockistDirect,
  detectStockist,
];

export async function detectCompetitor(pageUrl: string): Promise<DetectionResult> {
  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (!parsed.protocol.startsWith("http")) {
    return { ok: false, reason: "URL must use http or https" };
  }

  const html = await fetchPageHtml(pageUrl);
  const ctx: DetectorContext = { pageUrl, html };

  for (const detector of DETECTORS) {
    try {
      const config = await detector(ctx);
      if (config) return { ok: true, config };
    } catch {
      // detector exceptions are treated as non-matches; try the next one
    }
  }

  return {
    ok: false,
    reason:
      "Couldn't auto-detect a supported store locator. Stockist, Storepoint, Storemapper, and Agile Store Locator are supported today.",
  };
}

async function fetchPageHtml(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      method: "GET",
      headers: { "User-Agent": REALISTIC_UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ── Storemapper ──────────────────────────────────────────────────────────────
// Signature: HTML contains `storemapper-id='<numeric>-<hash>'`. The hash is
// effectively an access token — requests without it return 200/0 bytes. Data
// endpoint is JSONP-wrapped at `/api/users/<full_id>/stores.js?callback=...`
// and returns every store in a single call.

const STOREMAPPER_ID_REGEX = /storemapper-id=['"]?([0-9]+-[a-zA-Z0-9]+)['"]?/;

async function detectStoremapper({ pageUrl, html }: DetectorContext): Promise<DetectedConfig | null> {
  if (!html) return null;
  const match = html.match(STOREMAPPER_ID_REGEX);
  if (!match) return null;
  const fullId = match[1];

  const host = "https://storemapper-herokuapp-com.global.ssl.fastly.net";
  const path = `/api/users/${fullId}/stores.js`;
  const probeUrl = `${host}${path}?callback=SMcallback`;

  try {
    const res = await fetch(probeUrl, {
      headers: { "User-Agent": REALISTIC_UA, Referer: pageUrl },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const open = text.indexOf("(");
    const close = text.lastIndexOf(")");
    if (open === -1 || close === -1 || close <= open) return null;
    const parsed = JSON.parse(text.slice(open + 1, close)) as { stores?: unknown[] };
    if (!Array.isArray(parsed?.stores) || parsed.stores.length === 0) return null;
    const first = parsed.stores[0] as Record<string, unknown>;
    if (!first || !("latitude" in first) || !("name" in first || "address" in first)) return null;
  } catch {
    return null;
  }

  return {
    platform: "storemapper",
    base_url: host,
    endpoint_path: path,
    request_config: {
      method: "GET",
      latParam: "lat",
      lngParam: "lng",
      radiusParam: "radius",
      radiusValue: 0,
      radiusUnit: "mi",
      extraParams: { callback: "SMcallback" },
      headers: {},
      originalLocatorUrl: pageUrl,
      singleCall: true,
    },
    response_config: {
      storesJsonPath: "stores",
      externalIdField: "id",
      fieldMappings: {
        store_name: "name",
        address: "address",
        city: "",
        state: "",
        zip: "",
        country: "",
        phone: "phone",
        latitude: "latitude",
        longitude: "longitude",
      },
      addressFormat: "street-city-state-zip-country",
      responseFormat: "jsonp",
    },
  };
}

// ── Agile Store Locator (WordPress plugin) ───────────────────────────────────
// Signature: HTML references `agile-store-locator` stylesheet / script handles.
// The plugin exposes a `load_all=1` endpoint at `/wp-admin/admin-ajax.php`
// that returns every store in a single JSON array — a classic singleCall fit.

const ASL_HTML_REGEX = /agile-store-locator/i;

async function detectAgileStoreLocator({ pageUrl, html }: DetectorContext): Promise<DetectedConfig | null> {
  if (!html || !ASL_HTML_REGEX.test(html)) return null;

  const parsed = new URL(pageUrl);
  const base = `${parsed.protocol}//${parsed.host}`;
  const endpoint = "/wp-admin/admin-ajax.php";
  const probeUrl = `${base}${endpoint}?action=asl_load_stores&load_all=1`;

  try {
    const res = await fetch(probeUrl, {
      headers: { "User-Agent": REALISTIC_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!Array.isArray(json) || json.length === 0) return null;
    const first = json[0] as Record<string, unknown>;
    if (!first || !("lat" in first) || !("title" in first || "street" in first)) return null;
  } catch {
    return null;
  }

  return {
    platform: "agile",
    base_url: base,
    endpoint_path: endpoint,
    request_config: {
      method: "GET",
      latParam: "lat",
      lngParam: "lng",
      radiusParam: "radius",
      radiusValue: 0,
      radiusUnit: "mi",
      extraParams: { action: "asl_load_stores", load_all: 1 },
      headers: {},
      originalLocatorUrl: pageUrl,
      singleCall: true,
    },
    response_config: {
      storesJsonPath: "",
      externalIdField: "id",
      fieldMappings: {
        store_name: "title",
        address: "street",
        city: "city",
        state: "state",
        zip: "postal_code",
        country: "country",
        phone: "phone",
        latitude: "lat",
        longitude: "lng",
      },
    },
  };
}

// ── Stockist — direct API ────────────────────────────────────────────────────
// Many Shopify sites embed the Stockist widget but don't proxy the API through
// their own domain. The widget's account tag lives in `data-stockist-widget-tag`
// and the API is called directly at `stockist.co/api/v1/<tag>/locations/search`.
//
// NOTE: Stockist caps results at ~10 per query, so a scraper needs a tight grid
// (radiusValue = 30 mi) and therefore can't run inside a serverless timeout —
// `singleCall` is intentionally left false.

const STOCKIST_TAG_REGEX = /data-stockist-widget-tag=["']([a-z0-9_-]+)["']/i;

async function detectStockistDirect({ pageUrl, html }: DetectorContext): Promise<DetectedConfig | null> {
  if (!html) return null;
  const match = html.match(STOCKIST_TAG_REGEX);
  if (!match) return null;
  const tag = match[1];

  // Verify the direct API responds with a Stockist-shaped payload.
  const probeUrl = `https://stockist.co/api/v1/${tag}/locations/search?latitude=${PROBE_LAT}&longitude=${PROBE_LNG}&distance=${PROBE_RADIUS}`;
  try {
    const res = await fetch(probeUrl, {
      headers: { "User-Agent": REALISTIC_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { locations?: unknown[] };
    if (!Array.isArray(json?.locations)) return null;
    // Empty array is still a valid detection — the endpoint works, just no
    // stores in our probe region. If any are present, verify the shape.
    if (json.locations.length > 0) {
      const first = json.locations[0] as Record<string, unknown>;
      if (!first || !("latitude" in first) || !("address_line_1" in first || "name" in first)) {
        return null;
      }
    }
  } catch {
    return null;
  }

  return {
    platform: "stockist",
    base_url: "https://stockist.co",
    endpoint_path: `/api/v1/${tag}/locations/search`,
    // Stockist's direct API returns 429s above ~1 req/s in practice. 1500 ms
    // keeps us comfortably under the throttle while still being ~40% faster
    // than the 2500 ms merchant-site default.
    rate_limit_ms: 1500,
    request_config: {
      method: "GET",
      latParam: "latitude",
      lngParam: "longitude",
      radiusParam: "distance",
      radiusValue: 30,
      radiusUnit: "mi",
      extraParams: {},
      headers: {},
      originalLocatorUrl: pageUrl,
    },
    response_config: {
      storesJsonPath: "locations",
      externalIdField: "id",
      fieldMappings: {
        store_name: "name",
        address: "address_line_1",
        city: "city",
        state: "state",
        zip: "postal_code",
        country: "country",
        phone: "phone",
        latitude: "latitude",
        longitude: "longitude",
      },
    },
  };
}

// ── Stockist — merchant-proxied ─────────────────────────────────────────────
// Older/rarer pattern: merchant proxies a JSON endpoint at /locations (or
// similar) that returns either a raw array or { locations: [...] } of store
// objects with latitude/longitude plus address_line_1, city, state, etc.

const STOCKIST_PROBE_PATHS = ["/locations", "/store-locations", "/apps/stockist/locations"];

async function detectStockist({ pageUrl, html }: DetectorContext): Promise<DetectedConfig | null> {
  const parsed = new URL(pageUrl);
  const base = `${parsed.protocol}//${parsed.host}`;

  // Optional fast-path: skip if HTML is available and has zero Stockist hints.
  if (html && !/stockist/i.test(html)) return null;

  for (const path of STOCKIST_PROBE_PATHS) {
    const probeUrl = `${base}${path}?lat=${PROBE_LAT}&long=${PROBE_LNG}&r=${PROBE_RADIUS}`;
    const stores = await probeJsonArray(probeUrl);
    if (!stores) continue;

    const { arr, wrappedKey } = stores;
    if (arr.length === 0) continue;
    const first = arr[0] as Record<string, unknown>;
    if (!first || typeof first !== "object") continue;

    const hasCoords = "latitude" in first && "longitude" in first;
    const hasNameish = "address_line_1" in first || "name" in first;
    if (!hasCoords || !hasNameish) continue;

    return {
      platform: "stockist",
      base_url: base,
      endpoint_path: path,
      request_config: {
        method: "GET",
        latParam: "lat",
        lngParam: "long",
        radiusParam: "r",
        radiusValue: 100,
        radiusUnit: "mi",
        extraParams: {},
        headers: {},
        originalLocatorUrl: pageUrl,
      },
      response_config: {
        storesJsonPath: wrappedKey ?? "",
        externalIdField: "id",
        fieldMappings: {
          store_name: "name",
          address: "address_line_1",
          city: "city",
          state: "state",
          zip: "postal_code",
          country: "country",
          phone: "phone",
          latitude: "latitude",
          longitude: "longitude",
        },
      },
    };
  }

  return null;
}

// ── Storepoint ────────────────────────────────────────────────────────────────
// Signature: locator page embeds `storepoint.co/api/v1/js/<map_id>.js`. The
// public API at `https://api.storepoint.co/v1/<map_id>/locations` returns ALL
// locations in one call — no grid sweep needed.

const STOREPOINT_ID_REGEX = /storepoint\.co\/api\/v1\/js\/([a-f0-9]{8,})\.js/i;

async function detectStorepoint({ pageUrl, html }: DetectorContext): Promise<DetectedConfig | null> {
  if (!html) return null;
  const match = html.match(STOREPOINT_ID_REGEX);
  if (!match) return null;
  const mapId = match[1];

  // Verify the API is reachable and returns locations in the expected shape.
  const apiUrl = `https://api.storepoint.co/v1/${mapId}/locations`;
  try {
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": REALISTIC_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      results?: { locations?: unknown[] };
    };
    if (!json?.success || !Array.isArray(json?.results?.locations)) return null;
    const first = json.results.locations[0] as Record<string, unknown> | undefined;
    if (!first || !("loc_lat" in first) || !("name" in first)) return null;
  } catch {
    return null;
  }

  return {
    platform: "storepoint",
    base_url: "https://api.storepoint.co",
    endpoint_path: `/v1/${mapId}/locations`,
    request_config: {
      method: "GET",
      latParam: "lat",
      lngParam: "lng",
      radiusParam: "radius",
      radiusValue: 0,
      radiusUnit: "mi",
      extraParams: {},
      headers: {},
      originalLocatorUrl: pageUrl,
      singleCall: true,
    },
    response_config: {
      storesJsonPath: "results.locations",
      externalIdField: "id",
      fieldMappings: {
        store_name: "name",
        address: "streetaddress",
        city: "",
        state: "",
        zip: "",
        country: "",
        phone: "phone",
        latitude: "loc_lat",
        longitude: "loc_long",
      },
      addressFormat: "street-city-state-zip-country",
    },
  };
}

/**
 * Fetch a URL and return an array of store-like objects, handling both raw-array
 * and wrapped responses (e.g. `{ locations: [...] }`). Returns null if the
 * response isn't a recognizable array.
 */
async function probeJsonArray(
  url: string,
): Promise<{ arr: unknown[]; wrappedKey: string | null } | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": REALISTIC_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) {
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        return unwrap(parsed);
      } catch {
        return null;
      }
    }
    const json = await res.json();
    return unwrap(json);
  } catch {
    return null;
  }
}

function unwrap(json: unknown): { arr: unknown[]; wrappedKey: string | null } | null {
  if (Array.isArray(json)) return { arr: json, wrappedKey: null };
  if (json && typeof json === "object") {
    for (const key of ["locations", "stores", "results", "data"]) {
      const v = (json as Record<string, unknown>)[key];
      if (Array.isArray(v)) return { arr: v, wrappedKey: key };
    }
  }
  return null;
}
