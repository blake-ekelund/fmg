/**
 * Push on-hand inventory to Faire — the API version of editing stock in the
 * brand portal.
 *
 *   GET   /external-api/v2/product-inventory/by-skus?skus=A&skus=B
 *   PATCH /external-api/v2/product-inventory/by-skus
 *         { inventories: [{ sku, on_hand_quantity }] }
 *
 * Keyed by SKU, and our Fishbowl part numbers ARE the Faire SKUs, so there is
 * no product/variant id mapping to maintain. Our existing brand access token
 * (X-FAIRE-ACCESS-TOKEN) authorises it — verified live 2026-08-21.
 *
 * ── Endpoint history (do not "simplify" this back) ───────────────────────────
 * Two older paths look right and are not:
 *   PATCH /api/v1/products/options/inventory-levels           — v1, dead since
 *       2025-12-15 (returns 404; this is what a stale third-party example
 *       sends you to).
 *   PATCH /external-api/v2/products/variants/inventory-levels-by-skus
 *       — v2 but marked Deprecated in Faire's own docs, which redirect to the
 *       product-variant-inventory section this module uses.
 *
 * ── We send ON HAND, not "available" ─────────────────────────────────────────
 * Faire's model splits three ways, and it owns two of them:
 *   on_hand_quantity   what the brand physically has  ← the ONLY field we send
 *   committed_quantity units Faire has allocated to unfulfilled FAIRE orders
 *   available_quantity on_hand − committed, computed by Faire
 *
 * So pushing Fishbowl's `available` (on hand − allocated − not available) would
 * double-deduct: Faire subtracts its own committed units again. We send
 * `on_hand` and let Faire do its own arithmetic.
 *
 * Known imprecision, deliberately accepted: Fishbowl's `allocated` covers ALL
 * channels (storefront, wholesale, MarketTime), while Faire's committed only
 * covers Faire. Sending raw on_hand therefore slightly overstates what is truly
 * free for Faire to sell. The alternative — netting out non-Faire allocations —
 * needs per-channel allocation data the snapshot doesn't carry today. Erring
 * toward "listed" beats erring toward "delisted": see the kit trap below.
 *
 * ── The kit trap ─────────────────────────────────────────────────────────────
 * Every published variant on this account has allow_sales_when_out_of_stock =
 * false (218/218). Faire holds most of them UNTRACKED, which sells freely. The
 * moment we send a number, the out-of-stock gate goes live for that SKU.
 *
 * And 50 of 206 published SKUs have no availability row at all — the acrylic
 * box / prepack / gift-set KITS (507-*, 511-*, 512-*, 513-*, 517-*, 509, 411-*,
 * the -00-98 displays) plus the 191-* bar soaps. Fishbowl's Inventory
 * Availability report excludes them by design (no qohview tag in the Point B
 * location group) and they are among the best sellers on Faire — the $213
 * prepack displays. "Absent from the snapshot" and "zero on hand" must NEVER
 * collapse into the same signal.
 *
 * levelsForSkus() therefore only emits a level for a SKU it actually found a
 * row for. A SKU with no row comes back in `missing` and is never sent. No code
 * path in this module turns absence into a 0.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const BASE = "https://www.faire.com/external-api/v2";

/** Same token/header as lib/faire.ts — the long value, not the apa_ app id. */
function faireToken(): string | null {
  for (const name of ["FAIRE_ACCESS_TOKEN", "FAIRE_API_KEY"]) {
    const v = (process.env[name] ?? "").trim();
    if (v.length > 20 && !v.startsWith("apa_")) return v;
  }
  return null;
}

export function faireInventoryConfigured(): boolean {
  return faireToken() !== null;
}

export type InventoryLevel = {
  sku: string;
  /** Units physically on hand. Faire nets its own committed units off this. */
  on_hand_quantity: number;
};

/**
 * Age of the newest inventory snapshot, in hours — the freshness check the
 * cron gates on. Null when there is no snapshot at all.
 */
export async function snapshotAgeHours(admin: SupabaseClient): Promise<number | null> {
  const { data, error } = await admin
    .from("inventory_uploads")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Couldn't read inventory_uploads: ${error.message}`);
  const at = data?.[0]?.created_at as string | undefined;
  if (!at) return null;
  const ms = Date.now() - new Date(at).getTime();
  return Number.isFinite(ms) ? ms / 3_600_000 : null;
}

export type LevelsResult = {
  levels: InventoryLevel[];
  /** SKUs with no availability row — deliberately NOT pushed. See header. */
  missing: string[];
};

/**
 * On-hand quantities for the given SKUs.
 *
 * SOURCE, and its known limitation: this reads the snapshot that
 * fishbowl-inventory-sync writes — FISHBOWL's view of the Point B location
 * group. Point B / Synapse (Zethcon) is the real source of truth and the two
 * drift (docs/integrations.md says so outright). Fishbowl is a deliberate
 * interim choice (Blake, 2026-08-21) so the sync can ship now; the drift is
 * accepted, not overlooked.
 *
 * Moving to Synapse is the follow-up. Its inventory endpoint is not yet known —
 * /inventory/* and /items/* on the WMS API and /api/inventory* on the
 * Integration API all 404 (probed 2026-08-21) — so it has to come from Point B
 * (Keith Olsen). Only the body of this function should need to change; callers
 * pass SKUs and get levels back.
 */
export async function levelsForSkus(
  admin: SupabaseClient,
  skus: string[],
): Promise<LevelsResult> {
  const wanted = [...new Set(skus.map((s) => (s ?? "").trim()).filter(Boolean))];
  if (wanted.length === 0) return { levels: [], missing: [] };

  const { data: uploads, error: upErr } = await admin
    .from("inventory_uploads")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1);
  if (upErr) throw new Error(`Couldn't read inventory_uploads: ${upErr.message}`);
  const uploadId = uploads?.[0]?.id;
  // No snapshot means no quantities. Refusing beats pushing zeroes.
  if (!uploadId) throw new Error("No inventory snapshot on file — refusing to push.");

  const { data, error } = await admin
    .from("inventory_snapshot_items")
    .select("part, on_hand")
    .eq("upload_id", uploadId)
    .in("part", wanted);
  if (error) throw new Error(`Couldn't read inventory_snapshot_items: ${error.message}`);

  const found = new Map<string, number>();
  for (const row of data ?? []) {
    const part = String((row as { part?: unknown }).part ?? "");
    const qty = Number((row as { on_hand?: unknown }).on_hand);
    // Fishbowl can report a negative on hand; Faire accepts negatives, but
    // sending one would read as "oversold" — clamp at 0 and let it go OOS.
    if (part && Number.isFinite(qty)) found.set(part, Math.max(0, Math.trunc(qty)));
  }

  return {
    levels: wanted
      .filter((s) => found.has(s))
      .map((s) => ({ sku: s, on_hand_quantity: found.get(s) as number })),
    missing: wanted.filter((s) => !found.has(s)),
  };
}

/** What Faire holds for a SKU. `null` quantity means UNTRACKED (sells freely). */
export type FaireInventory = {
  onHand: number | null;
  committed: number | null;
  available: number | null;
};

const qty = (v: unknown): number | null => {
  const o = (v ?? {}) as { type?: string; quantity?: number };
  return o.type === "QUANTITY" && Number.isFinite(o.quantity) ? (o.quantity as number) : null;
};

/** Read current Faire inventory by variant id — the duplicate-SKU read path. */
export async function readFaireInventoryByVariantIds(
  variantIds: string[],
): Promise<Map<string, FaireInventory>> {
  const token = faireToken();
  if (!token) throw new Error("No Faire access token configured.");
  const out = new Map<string, FaireInventory>();
  const unique = [...new Set(variantIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    // The param is `ids`, NOT `product_variant_ids` (which the path and the
    // PATCH body both use). A wrong name returns 200 with an EMPTY inventories
    // map rather than a 400, so this silently reads as "everything untracked"
    // and makes a successful push look like a total failure. Verified 2026-08-21.
    const query = chunk.map((v) => `ids=${encodeURIComponent(v)}`).join("&");
    const res = await fetch(`${BASE}/product-inventory/by-product-variant-ids?${query}`, {
      headers: { "X-FAIRE-ACCESS-TOKEN": token, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Faire GET product-inventory by-variant-ids failed (${res.status}): ${text.slice(0, 200)}`,
      );
    }
    const data = (await res.json()) as { inventories?: Record<string, Record<string, unknown>> };
    for (const [id, inv] of Object.entries(data.inventories ?? {})) {
      out.set(id, {
        onHand: qty(inv.on_hand_quantity),
        committed: qty(inv.committed_quantity),
        available: qty(inv.available_quantity),
      });
    }
  }
  return out;
}

/** Read current Faire inventory for these SKUs. Chunked; `skus` repeats. */
export async function readFaireInventory(skus: string[]): Promise<Map<string, FaireInventory>> {
  const token = faireToken();
  if (!token) throw new Error("No Faire access token configured.");
  const out = new Map<string, FaireInventory>();
  const unique = [...new Set(skus.filter(Boolean))];

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const query = chunk.map((s) => `skus=${encodeURIComponent(s)}`).join("&");
    const res = await fetch(`${BASE}/product-inventory/by-skus?${query}`, {
      headers: { "X-FAIRE-ACCESS-TOKEN": token, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Faire GET product-inventory failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { inventories?: Record<string, Record<string, unknown>> };
    for (const [sku, inv] of Object.entries(data.inventories ?? {})) {
      out.set(sku, {
        onHand: qty(inv.on_hand_quantity),
        committed: qty(inv.committed_quantity),
        available: qty(inv.available_quantity),
      });
    }
  }
  return out;
}

export type SkuUniverse = {
  /** Published SKUs safe for SKU-keyed calls (unambiguous). */
  skus: string[];
  /**
   * SKUs attached to MORE THAN ONE variant. Faire rejects the WHOLE request
   * with 400 "Skus match multiple product variations" if any is included, so
   * these never go through the SKU-keyed path — they go by variant id.
   */
  duplicates: DuplicateResolution[];
};

/**
 * How one duplicated SKU gets split across its listings.
 *
 * The rule (Blake, 2026-08-21): the REFILL listing stays untracked — in stock,
 * no quantity — and the base product carries the count. The same physical units
 * back both listings, so tracking each one would double-book the same stock;
 * leaving refills untracked keeps them sellable and puts the gate on the one
 * listing that should have it.
 */
export type DuplicateResolution = {
  sku: string;
  /** The listing that carries the count. Null when the rule can't decide. */
  targetVariantId: string | null;
  targetProduct: string | null;
  /** Listings deliberately left UNTRACKED (the refills). */
  untracked: string[];
  /** Set when this needs a human — no count is pushed for the SKU at all. */
  unresolved?: string;
};

/** A listing whose stock is backed by another listing's units. */
const isRefill = (productName: string) => /\brefills?\b/i.test(productName);

/**
 * Every SKU on a PUBLISHED Faire product, split into usable and ambiguous.
 * Unpublished products are skipped — they aren't for sale, so gating them on
 * stock would be noise.
 *
 * Ambiguity is real here, not a glitch to clean up: the same physical part is
 * often listed twice on purpose (e.g. 180-00-04 is both "Grapefruit Bergamot
 * Foot Balm" and "Foot Balm Display - Grapefruit Refill"). Those need the
 * sibling /product-inventory/by-product-variant-ids endpoint, which addresses
 * each listing separately. One IS a mistake worth fixing in Faire: 411-00-01
 * sits on both the "Ho Ho Glow" and "Holly Dazed" gift sets.
 */
export async function faireSkuUniverse(): Promise<SkuUniverse> {
  const token = faireToken();
  if (!token) throw new Error("No Faire access token configured.");
  type Listing = { sku: string; variantId: string; product: string; published: boolean };
  const listings: Listing[] = [];
  let params = "limit=250";
  for (let hop = 0; hop < 20; hop++) {
    const res = await fetch(`${BASE}/products?${params}`, {
      headers: { "X-FAIRE-ACCESS-TOKEN": token, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Faire GET /products failed (${res.status}).`);
    const data = (await res.json()) as {
      products?: Array<{
        name?: string;
        lifecycle_state?: string;
        variants?: Array<{ sku?: string; id?: string }>;
      }>;
      cursor?: string;
    };
    for (const p of data.products ?? []) {
      for (const v of p.variants ?? []) {
        // Ambiguity is global — a SKU's variants count across ALL products,
        // published or not, because that is what Faire's lookup sees.
        if (v.sku && v.id) {
          listings.push({
            sku: v.sku,
            variantId: v.id,
            product: p.name ?? "",
            published: p.lifecycle_state === "PUBLISHED",
          });
        }
      }
    }
    if (!data.cursor || (data.products ?? []).length === 0) break;
    params = `limit=250&cursor=${encodeURIComponent(data.cursor)}`;
  }

  const bySku = new Map<string, Listing[]>();
  for (const l of listings) {
    const list = bySku.get(l.sku) ?? [];
    list.push(l);
    bySku.set(l.sku, list);
  }

  const skus: string[] = [];
  const duplicates: DuplicateResolution[] = [];
  for (const [sku, group] of bySku) {
    if (!group.some((l) => l.published)) continue; // nothing for sale under it
    if (group.length === 1) {
      skus.push(sku);
      continue;
    }
    const base = group.filter((l) => !isRefill(l.product));
    const refills = group.filter((l) => isRefill(l.product));
    if (base.length === 1) {
      duplicates.push({
        sku,
        targetVariantId: base[0].variantId,
        targetProduct: base[0].product,
        untracked: refills.map((l) => l.product),
      });
    } else {
      // Either every listing is a refill, or two non-refill products share a
      // SKU — which is a mistake in Faire, not something to guess at. Pushing
      // nothing keeps both listings selling until a human sorts it out.
      duplicates.push({
        sku,
        targetVariantId: null,
        targetProduct: null,
        untracked: [],
        unresolved: `${base.length} non-refill listings share this SKU: ${group.map((l) => l.product).join(" | ")}`,
      });
    }
  }
  return { skus: skus.sort(), duplicates: duplicates.sort((a, b) => a.sku.localeCompare(b.sku)) };
}

export type PushResult = { sent: number; chunks: number; dry: boolean; detail: string };

/** Faire documents no batch ceiling to us; 100 keeps requests small. */
const CHUNK = 100;

/**
 * PATCH the levels to Faire.
 *
 * `confirm` is required and has no default — this writes to live listings, so
 * the decision has to be made by the caller, in the open. The cron route
 * additionally gates on FAIRE_INVENTORY_SYNC='on' so a scheduled run can never
 * fire by accident; a targeted test can pass confirm without it.
 */
export async function pushInventoryLevels(
  levels: InventoryLevel[],
  opts: { confirm: boolean; dry?: boolean },
): Promise<PushResult> {
  const dry = !!opts.dry;
  if (levels.length === 0) return { sent: 0, chunks: 0, dry, detail: "Nothing to push." };
  if (!opts.confirm && !dry) {
    return { sent: 0, chunks: 0, dry, detail: "Refused: confirm was not set." };
  }
  const token = faireToken();
  if (!token) throw new Error("No Faire access token configured.");

  const chunks: InventoryLevel[][] = [];
  for (let i = 0; i < levels.length; i += CHUNK) chunks.push(levels.slice(i, i + CHUNK));

  if (dry) {
    return {
      sent: 0,
      chunks: chunks.length,
      dry,
      detail: `Would PATCH ${levels.length} SKU(s) in ${chunks.length} request(s).`,
    };
  }

  for (const chunk of chunks) {
    const res = await fetch(`${BASE}/product-inventory/by-skus`, {
      method: "PATCH",
      headers: {
        "X-FAIRE-ACCESS-TOKEN": token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ inventories: chunk }),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Faire PATCH product-inventory failed (${res.status}) on a ${chunk.length}-SKU chunk: ${text.slice(0, 300)}`,
      );
    }
  }
  return {
    sent: levels.length,
    chunks: chunks.length,
    dry,
    detail: `Pushed ${levels.length} SKU(s) to Faire in ${chunks.length} request(s).`,
  };
}

export type VariantLevel = { product_variant_id: string; on_hand_quantity: number };

/**
 * Same push, addressed by variant id — the only way to reach a SKU that sits on
 * more than one listing, since the SKU-keyed endpoint 400s on those.
 */
export async function pushInventoryByVariantIds(
  levels: VariantLevel[],
  opts: { confirm: boolean; dry?: boolean },
): Promise<PushResult> {
  const dry = !!opts.dry;
  if (levels.length === 0) return { sent: 0, chunks: 0, dry, detail: "Nothing to push." };
  if (!opts.confirm && !dry) {
    return { sent: 0, chunks: 0, dry, detail: "Refused: confirm was not set." };
  }
  const token = faireToken();
  if (!token) throw new Error("No Faire access token configured.");

  const chunks: VariantLevel[][] = [];
  for (let i = 0; i < levels.length; i += CHUNK) chunks.push(levels.slice(i, i + CHUNK));

  if (dry) {
    return {
      sent: 0,
      chunks: chunks.length,
      dry,
      detail: `Would PATCH ${levels.length} variant(s) in ${chunks.length} request(s).`,
    };
  }

  for (const chunk of chunks) {
    const res = await fetch(`${BASE}/product-inventory/by-product-variant-ids`, {
      method: "PATCH",
      headers: {
        "X-FAIRE-ACCESS-TOKEN": token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ inventories: chunk }),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Faire PATCH by-product-variant-ids failed (${res.status}) on a ${chunk.length}-variant chunk: ${text.slice(0, 300)}`,
      );
    }
  }
  return {
    sent: levels.length,
    chunks: chunks.length,
    dry,
    detail: `Pushed ${levels.length} variant(s) to Faire in ${chunks.length} request(s).`,
  };
}
