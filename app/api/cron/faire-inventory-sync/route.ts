import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import {
  faireInventoryConfigured,
  faireSkuUniverse,
  levelsForSkus,
  pushInventoryByVariantIds,
  pushInventoryLevels,
  snapshotAgeHours,
  type VariantLevel,
} from "@/lib/faireInventory";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/faire-inventory-sync
 *
 * Publishes on-hand stock to Faire so listings go out of stock instead of
 * taking orders we can't fill. Reads the newest inventory snapshot (what
 * fishbowl-inventory-sync writes) and PATCHes Faire.
 *
 * Two push paths, because Faire rejects SKU-keyed calls for a SKU that sits on
 * more than one listing:
 *   - unambiguous SKUs  → /product-inventory/by-skus
 *   - duplicated SKUs   → /product-inventory/by-product-variant-ids, count on
 *                         the base product, refill listings left untracked.
 * See lib/faireInventory.ts for both, and for why absence never becomes a 0.
 *
 * Schedule: 1h after each fishbowl-inventory-sync run (which lands 4am/12pm/8pm
 * ET), so Faire is never more than ~8h behind our own numbers. Like that job,
 * the cron fires on both UTC hours that can be the target ET hour under EST and
 * EDT; unlike it, there is no local-hour gate, so it runs twice per window.
 * That is deliberate and harmless — a push of the same snapshot writes the same
 * numbers, and re-sending costs one request per 100 SKUs.
 *
 * HARD GATE: writes nothing unless env FAIRE_INVENTORY_SYNC="on". Stock levels
 * are customer-visible on a live marketplace, so this ships dark.
 *
 * Auth: Vercel cron Bearer CRON_SECRET, or a signed-in user (so ?dry is
 * testable from the browser).
 *   ?dry=1 — report exactly what would be sent, write nothing. Works even when
 *            the gate is off, which is the way to preview a change safely.
 */

/**
 * Refuse to publish a snapshot older than this. If fishbowl-inventory-sync has
 * been failing, its last snapshot is stale — and stale stock on a marketplace
 * either oversells or wrongly delists. Silence beats a confident wrong number.
 * 26h covers a full day of missed 3x-daily runs plus slack.
 */
const MAX_SNAPSHOT_AGE_HOURS = 26;

/**
 * Refuse a run that can only price a fraction of the catalogue. A partial
 * snapshot would push a handful of SKUs and leave the rest untouched — not
 * catastrophic on its own, but it means the source is broken, and we'd rather
 * see the alarm than half-apply it.
 */
const MIN_COVERAGE = 0.5;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authz === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const enabled = (process.env.FAIRE_INVENTORY_SYNC ?? "").trim().toLowerCase() === "on";

  if (!faireInventoryConfigured()) {
    return NextResponse.json({ note: "No Faire access token — inventory sync is dark.", dry });
  }
  if (!enabled && !dry) {
    return NextResponse.json({
      note: "FAIRE_INVENTORY_SYNC is not 'on' — nothing pushed. Add ?dry=1 to preview.",
      pushed: 0,
    });
  }
  const admin = wholesalePortalAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase isn't connected." }, { status: 500 });

  try {
    const ageHours = await snapshotAgeHours(admin);
    if (ageHours === null) {
      return NextResponse.json({ error: "No inventory snapshot on file." }, { status: 503 });
    }
    if (ageHours > MAX_SNAPSHOT_AGE_HOURS) {
      return NextResponse.json(
        {
          error: `Inventory snapshot is ${ageHours.toFixed(1)}h old (limit ${MAX_SNAPSHOT_AGE_HOURS}h) — refusing to publish stale stock to Faire. Check fishbowl-inventory-sync.`,
        },
        { status: 503 },
      );
    }

    const universe = await faireSkuUniverse();
    const resolved = universe.duplicates.filter((d) => d.targetVariantId);
    const unresolved = universe.duplicates.filter((d) => !d.targetVariantId);

    const { levels, missing } = await levelsForSkus(admin, universe.skus);

    // Duplicated SKUs: same snapshot lookup, addressed by the base listing's
    // variant id. Refill listings are simply never sent, so they stay untracked.
    const dupLevels = await levelsForSkus(
      admin,
      resolved.map((d) => d.sku),
    );
    const qtyBySku = new Map(dupLevels.levels.map((l) => [l.sku, l.on_hand_quantity]));
    const variantLevels: VariantLevel[] = resolved
      .filter((d) => qtyBySku.has(d.sku))
      .map((d) => ({
        product_variant_id: d.targetVariantId as string,
        on_hand_quantity: qtyBySku.get(d.sku) as number,
      }));

    const coverage = universe.skus.length ? levels.length / universe.skus.length : 0;
    if (coverage < MIN_COVERAGE) {
      return NextResponse.json(
        {
          error: `Only ${levels.length}/${universe.skus.length} published SKUs have a snapshot row (${Math.round(coverage * 100)}%) — refusing to run. The snapshot is probably partial.`,
        },
        { status: 503 },
      );
    }

    const bySku = await pushInventoryLevels(levels, { confirm: enabled, dry });
    const byVariant = await pushInventoryByVariantIds(variantLevels, { confirm: enabled, dry });

    return NextResponse.json({
      dry,
      enabled,
      snapshotAgeHours: Number(ageHours.toFixed(1)),
      pushed: bySku.sent + byVariant.sent,
      bySku: { count: levels.length, detail: bySku.detail },
      byVariantId: {
        count: variantLevels.length,
        detail: byVariant.detail,
        listings: resolved.map((d) => ({
          sku: d.sku,
          onHand: qtyBySku.get(d.sku) ?? null,
          product: d.targetProduct,
          leftUntracked: d.untracked,
        })),
      },
      // Kits/prepacks with no snapshot row. Never sent — a 0 here would delist
      // the acrylic displays, which are among the best sellers on Faire.
      skippedNoSnapshotRow: missing,
      needsAttention: unresolved.map((d) => ({ sku: d.sku, why: d.unresolved })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
