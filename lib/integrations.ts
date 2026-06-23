/**
 * Shared metadata for the Integrations page and the syncs that feed it.
 *
 * Client-safe: only plain constants and pure helpers live here (no secrets, no
 * server imports), so both the cron routes (which WRITE the audit rows) and the
 * browser UI (which READS them) can agree on the same labels without hardcoding
 * magic strings in two places.
 */

/* ---------------------------------------------------------------------------
 * Fishbowl sales sync
 * ------------------------------------------------------------------------- */

/**
 * Filenames the Fishbowl sales sync stamps on its `sales_uploads` audit rows.
 * These double as the marker that distinguishes an automated sync from a manual
 * Orders.xls + Items.csv upload (see `isFishbowlSync`). Keep the cron route and
 * any reader in lockstep by importing these instead of retyping the strings.
 */
export const FISHBOWL_SYNC_ORDERS_LABEL = "Fishbowl sync · sales orders";
export const FISHBOWL_SYNC_ITEMS_LABEL = "Fishbowl sync · line items";

/** A `sales_uploads` row came from the Fishbowl sync, not a manual upload. */
export function isFishbowlSync(originalFilenameOrders: string | null | undefined): boolean {
  return (originalFilenameOrders ?? "").startsWith("Fishbowl sync");
}

/**
 * Hours (Eastern, 24h) the sales sync runs. The cron fires more often to cover
 * DST; the route gates real work to exactly these local hours. Mirror of
 * SYNC_HOURS in app/api/cron/fishbowl-sales-sync/route.ts.
 */
export const FISHBOWL_SYNC_HOURS_ET = [3, 11, 19] as const;
export const FISHBOWL_SCHEDULE_LABEL = "3 AM, 11 AM, 7 PM ET";

/* ---------------------------------------------------------------------------
 * Fishbowl inventory sync (Point B Solutions availability)
 * ------------------------------------------------------------------------- */

/** Filename the inventory sync stamps on its `inventory_uploads` audit rows. */
export const FISHBOWL_SYNC_INVENTORY_LABEL = "Fishbowl sync · inventory";

/** An `inventory_uploads` row came from the Fishbowl sync, not a manual upload. */
export function isFishbowlInventorySync(originalFilename: string | null | undefined): boolean {
  return (originalFilename ?? "").startsWith("Fishbowl sync");
}

/**
 * Hours (Eastern) the inventory sync runs — offset ~1h after the sales sync so
 * the two never hold Fishbowl license seats at the same moment.
 */
export const FISHBOWL_INVENTORY_SYNC_HOURS_ET = [4, 12, 20] as const;
export const FISHBOWL_INVENTORY_SCHEDULE_LABEL = "4 AM, 12 PM, 8 PM ET";

/* ---------------------------------------------------------------------------
 * Shared
 * ------------------------------------------------------------------------- */

export const FISHBOWL_TZ = "America/New_York";

/** Pretty 24h hour → "7:00 PM". */
function hourLabel(hour: number): string {
  const isAm = hour < 12;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${isAm ? "AM" : "PM"}`;
}

/** Current hour (0–23) in a named timezone, DST-aware. */
function hourInTz(date: Date, tz: string): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).format(date);
  return Number(h) % 24;
}

/**
 * The next scheduled sync after `now` for a given set of Eastern hours, as a
 * friendly label. Hour-level precision (the cron fires on the hour), and rolls
 * to the first slot "tomorrow" once the day's last run has passed.
 */
export function nextSyncLabel(
  hoursEt: readonly number[],
  now: Date = new Date(),
): { label: string; tomorrow: boolean } {
  const etHour = hourInTz(now, FISHBOWL_TZ);
  const upcoming = hoursEt.find((h) => h > etHour);
  const hour = upcoming ?? hoursEt[0];
  const tomorrow = upcoming === undefined;
  return {
    label: `${hourLabel(hour)} ET${tomorrow ? " (tomorrow)" : ""}`,
    tomorrow,
  };
}
