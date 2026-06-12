import type { Competitor, GridPoint, StandardStore } from "./types";
import type { Logger } from "./logger";
import { extractStoresArray, mapStore } from "./mapper";

const MAX_RETRIES = 3;
const MAX_CONSECUTIVE_ERRORS = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ScrapeOptions = {
  dryRun?: boolean;
  logger: Logger;
  /** Fires after each request (successful or not). Used for live progress. */
  onProgress?: (completedPoints: number, totalPoints: number) => void;
};

export type ScrapeResult = {
  stores: StandardStore[];
  totalRequests: number;
  errorCount: number;
  aborted: boolean;
};

export async function scrapeCompetitor(
  competitor: Competitor,
  grid: GridPoint[],
  options: ScrapeOptions,
): Promise<ScrapeResult> {
  const { logger, dryRun, onProgress } = options;
  const req = competitor.request_config;
  const stores: StandardStore[] = [];

  let totalRequests = 0;
  let errorCount = 0;
  let consecutiveErrors = 0;

  for (let i = 0; i < grid.length; i++) {
    const point = grid[i];
    const url = buildUrl(competitor, point);

    if (dryRun) {
      logger.info(`[dry-run] would GET ${url}`, { point: i + 1, of: grid.length });
      totalRequests++;
      continue;
    }

    let attempt = 0;
    let success = false;
    while (attempt <= MAX_RETRIES) {
      totalRequests++;
      try {
        const res = await fetch(url, {
          method: req.method ?? "GET",
          headers: {
            "User-Agent": competitor.user_agent,
            Accept: "application/json",
            ...(req.headers ?? {}),
          },
        });

        if (res.status === 429 || res.status === 503) {
          const backoffMs = 2000 * Math.pow(2, attempt);
          logger.warn(`rate-limited ${res.status}; backing off`, { backoffMs, attempt });
          await sleep(backoffMs);
          attempt++;
          continue;
        }

        if (!res.ok) {
          logger.warn(`non-2xx response`, { status: res.status, url });
          errorCount++;
          consecutiveErrors++;
          break;
        }

        const bodyText = await res.text();
        const parsed =
          competitor.response_config.responseFormat === "jsonp"
            ? parseJsonp(bodyText)
            : JSON.parse(bodyText);
        const rawStores = extractStoresArray(parsed, competitor.response_config);
        for (const raw of rawStores) {
          stores.push(mapStore(raw, competitor.response_config));
        }

        logger.debug(`ok`, { point: `${i + 1}/${grid.length}`, found: rawStores.length });
        success = true;
        consecutiveErrors = 0;
        break;
      } catch (err) {
        logger.warn(`fetch error`, { err: String(err), attempt });
        attempt++;
        if (attempt > MAX_RETRIES) {
          errorCount++;
          consecutiveErrors++;
          break;
        }
        await sleep(2000 * Math.pow(2, attempt - 1));
      }
    }

    if (!success && consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      logger.error(`aborting: ${consecutiveErrors} consecutive errors`, { competitor: competitor.name });
      onProgress?.(i + 1, grid.length);
      return { stores, totalRequests, errorCount, aborted: true };
    }

    onProgress?.(i + 1, grid.length);

    if (i < grid.length - 1) await sleep(competitor.rate_limit_ms);
  }

  return { stores, totalRequests, errorCount, aborted: false };
}

/** Strip a JSONP `callback(...)` wrapper and return the inner JSON value. */
export function parseJsonp(text: string): unknown {
  const open = text.indexOf("(");
  const close = text.lastIndexOf(")");
  if (open === -1 || close === -1 || close <= open) {
    throw new Error("Response is not valid JSONP");
  }
  return JSON.parse(text.slice(open + 1, close));
}

export function buildUrl(competitor: Competitor, point: GridPoint): string {
  const req = competitor.request_config;
  const base = competitor.base_url.replace(/\/$/, "");
  const path = competitor.endpoint_path.startsWith("/")
    ? competitor.endpoint_path
    : `/${competitor.endpoint_path}`;

  const params = new URLSearchParams();
  if (!req.singleCall) {
    params.set(req.latParam, String(point.lat));
    params.set(req.lngParam, String(point.lng));
    params.set(req.radiusParam, String(req.radiusValue));
  }
  for (const [k, v] of Object.entries(req.extraParams ?? {})) {
    params.set(k, String(v));
  }

  const qs = params.toString();
  return qs ? `${base}${path}?${qs}` : `${base}${path}`;
}
