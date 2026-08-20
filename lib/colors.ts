/** Centralized color constants for charts and branded UI */
export const ACCENT_GOLD = "#ebb700";
export const CHART_NAVY = "#1B3C53";

/** Chart color palette for multi-series visualizations */
export const CHART_PALETTE = [
  "#1B3C53", // navy
  "#ebb700", // gold
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#84CC16", // lime
];

/**
 * De-emphasis gray for context series — a prior-year line behind current-year
 * bars, an "Other" bucket, an inactive sparkline. Deliberately NOT a
 * categorical hue: it marks a series as background, not as its own identity.
 * 3.59:1 on white, so it clears the 3:1 mark-contrast floor.
 */
export const CHART_MUTED = "#898781";

/* CHART_NAVY_PALETTE (15 navy shades) was removed with the sales treemap it
   served. It was a sequential ramp doing categorical work: adjacent pairs sat
   at ΔE 4.4 for normal vision and ~4.0 under protanopia, well under the ΔE 15
   / ΔE 8 floors, so the slices were not tellable apart by anyone. Rank the
   items and use bar length instead of spending color on identity. */
