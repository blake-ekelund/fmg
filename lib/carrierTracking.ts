/**
 * Delivery-status lookups against the carriers' FREE official tracking APIs —
 * the legitimate version of "go to the tracking page and read the status"
 * (the pages themselves are bot-walled; these APIs return the same data).
 *
 * Each carrier is enabled independently by its env keys, so USPS can go live
 * before the FedEx/UPS registrations clear:
 *
 *   USPS  — USPS_CLIENT_ID  / USPS_CLIENT_SECRET   (developer.usps.com)
 *   FedEx — FEDEX_CLIENT_ID / FEDEX_CLIENT_SECRET  (developer.fedex.com)
 *   UPS   — UPS_CLIENT_ID   / UPS_CLIENT_SECRET    (developer.ups.com)
 *
 * All three use OAuth2 client-credentials; tokens are cached per carrier until
 * shortly before expiry. Server-only. Parsers are deliberately defensive —
 * carriers reshuffle response fields, so "delivered" is detected from
 * status codes AND text, and a parse miss degrades to "not delivered yet"
 * (the cron just checks again next run) rather than an error.
 */

import type { CarrierId } from "./tracking";

export type DeliveryStatus = {
  delivered: boolean;
  /** Carrier's delivery timestamp when parseable, else null (caller stamps now). */
  deliveredAt: string | null;
  /** Human-readable latest status, for logs/UI. */
  summary: string | null;
};

type Creds = { id: string; secret: string };

function creds(prefix: "USPS" | "FEDEX" | "UPS"): Creds | null {
  const id = (process.env[`${prefix}_CLIENT_ID`] ?? "").trim();
  const secret = (process.env[`${prefix}_CLIENT_SECRET`] ?? "").trim();
  // Length gate keeps placeholder values ("x") from enabling a carrier.
  return id.length > 5 && secret.length > 5 ? { id, secret } : null;
}

/** EasyPost aggregator key — when set, it serves ALL carriers (their IP
 *  agreements cover packages regardless of who shipped them, which sidesteps
 *  USPS's MID access controls entirely). Direct carrier keys then act as
 *  fallback when it's absent. */
function easypostKey(): string | null {
  const k = (process.env.EASYPOST_API_KEY ?? "").trim();
  return k.length > 5 ? k : null;
}

/** Which carriers have a working provider right now. EasyPost covers USPS +
 *  UPS on its own agreements; FedEx tracking requires either direct FedEx
 *  keys or a FedEx carrier account linked inside EasyPost (verified live
 *  2026-07-31: without one, EasyPost returns CREDENTIALS_NOT_FOUND). */
export function configuredCarriers(): CarrierId[] {
  const out: CarrierId[] = [];
  if (easypostKey() || creds("USPS")) out.push("usps");
  if (creds("FEDEX")) out.push("fedex");
  if (easypostKey() || creds("UPS")) out.push("ups");
  return out;
}

/* ── OAuth token cache (per carrier, refreshed 60s before expiry) ────────── */

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function cachedToken(
  key: string,
  fetchToken: () => Promise<{ token: string; expiresIn: number }>,
): Promise<string> {
  const hit = tokenCache.get(key);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  const { token, expiresIn } = await fetchToken();
  tokenCache.set(key, { token, expiresAt: Date.now() + expiresIn * 1000 });
  return token;
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

/** "delivered" appears in every carrier's terminal status text. */
const textSaysDelivered = (s: unknown): boolean =>
  typeof s === "string" && /\bdelivered\b/i.test(s) && !/not\s+delivered/i.test(s);

/* ── USPS (apis.usps.com) ────────────────────────────────────────────────── */

async function uspsToken(c: Creds): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch("https://apis.usps.com/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: c.id,
      client_secret: c.secret,
    }),
    cache: "no-store",
  });
  const data = asRecord(await res.json().catch(() => ({})));
  if (!res.ok || !data.access_token) {
    throw new Error(`USPS token failed (${res.status}): ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { token: String(data.access_token), expiresIn: Number(data.expires_in ?? 3600) };
}

async function uspsStatus(trackingNum: string): Promise<DeliveryStatus | null> {
  const c = creds("USPS");
  if (!c) return null;
  const token = await cachedToken("usps", () => uspsToken(c));
  const res = await fetch(
    `https://apis.usps.com/tracking/v3/tracking/${encodeURIComponent(trackingNum)}?expand=SUMMARY`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (res.status === 404) return { delivered: false, deliveredAt: null, summary: "Not found yet" };
  if (!res.ok) {
    throw new Error(`USPS track failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = asRecord(await res.json().catch(() => ({})));
  const category = data.statusCategory ?? data.status;
  const summary =
    (typeof data.statusSummary === "string" && data.statusSummary) ||
    (typeof category === "string" && category) ||
    null;
  const delivered = textSaysDelivered(category) || textSaysDelivered(data.statusSummary);
  // eventSummaries are prose; the structured eventDate/eventTime may be absent
  // on the SUMMARY expand — callers stamp "now" when null.
  return { delivered, deliveredAt: null, summary };
}

/* ── FedEx (apis.fedex.com) ──────────────────────────────────────────────── */

async function fedexToken(c: Creds): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch("https://apis.fedex.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: c.id,
      client_secret: c.secret,
    }),
    cache: "no-store",
  });
  const data = asRecord(await res.json().catch(() => ({})));
  if (!res.ok || !data.access_token) {
    throw new Error(`FedEx token failed (${res.status}): ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { token: String(data.access_token), expiresIn: Number(data.expires_in ?? 3600) };
}

async function fedexStatus(trackingNum: string): Promise<DeliveryStatus | null> {
  const c = creds("FEDEX");
  if (!c) return null;
  const token = await cachedToken("fedex", () => fedexToken(c));
  const res = await fetch("https://apis.fedex.com/track/v1/trackingnumbers", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      includeDetailedScans: false,
      trackingInfo: [{ trackingNumberInfo: { trackingNumber: trackingNum } }],
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`FedEx track failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = asRecord(await res.json().catch(() => ({})));
  const output = asRecord(data.output);
  const complete = Array.isArray(output.completeTrackResults) ? output.completeTrackResults : [];
  const trackResults = asRecord(complete[0]).trackResults;
  const result = asRecord(Array.isArray(trackResults) ? trackResults[0] : undefined);
  const latest = asRecord(result.latestStatusDetail);
  const delivered =
    latest.code === "DL" ||
    textSaysDelivered(latest.derivedCode) ||
    textSaysDelivered(latest.statusByLocale) ||
    textSaysDelivered(latest.description);
  let deliveredAt: string | null = null;
  const dates = Array.isArray(result.dateAndTimes) ? result.dateAndTimes : [];
  for (const d of dates) {
    const rec = asRecord(d);
    if (rec.type === "ACTUAL_DELIVERY" && typeof rec.dateTime === "string") {
      const t = new Date(rec.dateTime);
      if (!Number.isNaN(t.getTime())) deliveredAt = t.toISOString();
    }
  }
  const summary =
    (typeof latest.statusByLocale === "string" && latest.statusByLocale) ||
    (typeof latest.description === "string" && latest.description) ||
    null;
  return { delivered, deliveredAt, summary };
}

/* ── UPS (onlinetools.ups.com) ───────────────────────────────────────────── */

async function upsToken(c: Creds): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch("https://onlinetools.ups.com/security/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });
  const data = asRecord(await res.json().catch(() => ({})));
  if (!res.ok || !data.access_token) {
    throw new Error(`UPS token failed (${res.status}): ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { token: String(data.access_token), expiresIn: Number(data.expires_in ?? 3600) };
}

async function upsStatus(trackingNum: string): Promise<DeliveryStatus | null> {
  const c = creds("UPS");
  if (!c) return null;
  const token = await cachedToken("ups", () => upsToken(c));
  const res = await fetch(
    `https://onlinetools.ups.com/api/track/v1/details/${encodeURIComponent(trackingNum)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        transId: `fmg-${Date.now()}`,
        transactionSrc: "fmg-storefront",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`UPS track failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = asRecord(await res.json().catch(() => ({})));
  const shipments = asRecord(data.trackResponse).shipment;
  const pkg0 = asRecord(asRecord(Array.isArray(shipments) ? shipments[0] : undefined).package);
  const pkgArr = Array.isArray(asRecord(Array.isArray(shipments) ? shipments[0] : undefined).package)
    ? (asRecord(Array.isArray(shipments) ? shipments[0] : undefined).package as unknown[])
    : [pkg0];
  const pkg = asRecord(pkgArr[0]);
  const current = asRecord(pkg.currentStatus);
  const activities = Array.isArray(pkg.activity) ? pkg.activity : [];
  const latestActivity = asRecord(activities[0]);
  const activityStatus = asRecord(latestActivity.status);
  const delivered =
    current.type === "D" ||
    activityStatus.type === "D" ||
    textSaysDelivered(current.description) ||
    textSaysDelivered(activityStatus.description);
  let deliveredAt: string | null = null;
  const deliveryDates = Array.isArray(pkg.deliveryDate) ? pkg.deliveryDate : [];
  for (const d of deliveryDates) {
    const rec = asRecord(d);
    if (rec.type === "DEL" && typeof rec.date === "string" && /^\d{8}$/.test(rec.date)) {
      deliveredAt = `${rec.date.slice(0, 4)}-${rec.date.slice(4, 6)}-${rec.date.slice(6, 8)}T12:00:00.000Z`;
    }
  }
  const summary =
    (typeof current.description === "string" && current.description) ||
    (typeof activityStatus.description === "string" && activityStatus.description) ||
    null;
  return { delivered, deliveredAt, summary };
}

/* ── EasyPost (api.easypost.com) ─────────────────────────────────────────── */

const EASYPOST_CARRIER: Record<CarrierId, string> = {
  usps: "USPS",
  fedex: "FedEx",
  ups: "UPS",
};

/**
 * One call does everything: POST /v2/trackers both registers the package for
 * background tracking AND returns its current status. Idempotent by design —
 * EasyPost returns the existing Tracker when the same (tracking_code, carrier)
 * is re-submitted within 3 months — so the hourly cron can just re-post.
 * A freshly created tracker may report "unknown" until EasyPost's first
 * carrier fetch completes; the next cron run picks up the real status.
 */
async function easypostStatus(
  carrier: CarrierId,
  trackingNum: string,
): Promise<DeliveryStatus> {
  const key = easypostKey()!;
  const res = await fetch("https://api.easypost.com/v2/trackers", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tracker: { tracking_code: trackingNum, carrier: EASYPOST_CARRIER[carrier] },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`EasyPost tracker failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const t = asRecord(await res.json().catch(() => ({})));
  const status = typeof t.status === "string" ? t.status : "unknown";
  const delivered = status === "delivered";

  // Delivery timestamp: the datetime of the "delivered" scan event.
  let deliveredAt: string | null = null;
  const details = Array.isArray(t.tracking_details) ? t.tracking_details : [];
  for (const d of details) {
    const rec = asRecord(d);
    if (rec.status === "delivered" && typeof rec.datetime === "string") {
      const parsed = new Date(rec.datetime);
      if (!Number.isNaN(parsed.getTime())) deliveredAt = parsed.toISOString();
    }
  }

  const detail = typeof t.status_detail === "string" ? t.status_detail : null;
  return {
    delivered,
    deliveredAt,
    summary: detail && detail !== "unknown" ? `${status} (${detail})` : status,
  };
}

/* ── Dispatcher ──────────────────────────────────────────────────────────── */

/**
 * Current delivery status for a tracking number, or null when no provider is
 * configured for that carrier. EasyPost (when its key is set) is preferred
 * for every carrier; the direct carrier clients are the fallback. Throws on
 * API errors (caller logs and retries next cron run).
 */
export async function getDeliveryStatus(
  carrier: CarrierId,
  trackingNum: string,
): Promise<DeliveryStatus | null> {
  switch (carrier) {
    case "usps":
      return easypostKey() ? easypostStatus(carrier, trackingNum) : uspsStatus(trackingNum);
    case "fedex":
      // Direct keys first — EasyPost can't track FedEx without a linked
      // FedEx carrier account.
      if (creds("FEDEX")) return fedexStatus(trackingNum);
      return easypostKey() ? easypostStatus(carrier, trackingNum) : null;
    case "ups":
      return easypostKey() ? easypostStatus(carrier, trackingNum) : upsStatus(trackingNum);
  }
}
