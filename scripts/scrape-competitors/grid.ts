import type { GridPoint } from "./types";

export type GridOptions = {
  /** Coverage radius in miles. Default 100. */
  radiusMiles?: number;
  /** Fraction of each radius to overlap with neighbors. Default 0.2 (20%). */
  overlap?: number;
  /** Bounding box. Defaults to continental US. */
  bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
};

const MILES_PER_DEG_LAT = 69;
const DEFAULT_BBOX = { minLat: 25, maxLat: 49, minLng: -125, maxLng: -66 };

/**
 * Generate a uniform lat/lng grid covering the bounding box. Spacing is set so
 * that adjacent points' coverage circles overlap by `overlap × radius` on each
 * side, which gives no-gap coverage when the circles are overlaid on the plane.
 *
 * With radius = 100mi and overlap = 0.2, spacing ≈ 160mi, producing ~230 points
 * over CONUS.
 */
export function generateGrid(options: GridOptions = {}): GridPoint[] {
  const radius = options.radiusMiles ?? 100;
  const overlap = options.overlap ?? 0.2;
  const bbox = options.bbox ?? DEFAULT_BBOX;

  if (radius <= 0) throw new Error("radiusMiles must be > 0");
  if (overlap < 0 || overlap >= 1) throw new Error("overlap must be in [0, 1)");

  const spacingMiles = 2 * radius * (1 - overlap);
  const latStep = spacingMiles / MILES_PER_DEG_LAT;

  // Use mid-latitude of the bbox to compute lng spacing. For CONUS this is ~37°.
  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  const milesPerDegLng = MILES_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  const lngStep = spacingMiles / milesPerDegLng;

  const points: GridPoint[] = [];
  for (let lat = bbox.minLat; lat <= bbox.maxLat; lat += latStep) {
    for (let lng = bbox.minLng; lng <= bbox.maxLng; lng += lngStep) {
      points.push({
        lat: Math.round(lat * 1e6) / 1e6,
        lng: Math.round(lng * 1e6) / 1e6,
      });
    }
  }
  return points;
}
