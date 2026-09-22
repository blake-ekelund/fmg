import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { fishbowlConfigured, loadKitClosure, withFishbowl } from "@/lib/fishbowl";
import { flattenKit } from "@/lib/fishbowlKits";
import {
  compareOrderToSo,
  divergenceSummary,
  type FishbowlSoSnapshot,
} from "@/lib/fishbowlDivergence";
import {
  getSynapseInventoryRows,
  rollUpSynapseInventory,
  synapseConfigured,
} from "@/lib/pointb";
import { checkStock } from "@/lib/orderStockCheck";
import { isRealPart, orderRef, type StorefrontOrder } from "@/lib/storefrontOrder";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/storefront-orders/[id]/fishbowl-check
 *
 * Two questions about one order, answered live:
 *
 *  1. Does the Fishbowl SO still say what the marketplace said? Nothing
 *     re-checks that after the push, and the two records do drift — see
 *     lib/fishbowlDivergence.ts and docs/fishbowl-marketplace-field-map.md.
 *  2. Can Point B actually fill it? The same check the push gate runs, so a
 *     held order can be re-examined without attempting another push.
 *
 * Read-only on both systems. Everything Fishbowl-side runs in ONE session
 * (one license seat of the three).
 */

/** Match the SO the way reconciliation does: our ref inside the customer PO. */
const alnum = (s: string) => (s ?? "").replace(/[^A-Za-z0-9]/g, "");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = wholesalePortalAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase isn't connected." }, { status: 500 });

  const { id } = await params;
  const { data: order, error } = await admin
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle<StorefrontOrder>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  if (!fishbowlConfigured()) {
    return NextResponse.json(
      { error: "Fishbowl isn't configured (FISHBOWL_API_URL / _USER / _PASS)." },
      { status: 500 },
    );
  }

  // The keys an SO could carry: what we push, and what a human keys by hand.
  const keys = [
    alnum(String(order.external_ref ?? "")),
    alnum(String(order.external_po ?? "")),
    alnum(orderRef(order)),
    alnum(String(order.fishbowl_estimate_num ?? "")),
  ].filter((k) => k.length >= 4);

  const orderedParts = [...new Set(
    (order.items ?? []).map((it) => String(it.part ?? "").trim()).filter((p) => isRealPart(p)),
  )];

  let payload;
  try {
    payload = await withFishbowl(async (q) => {
      const sos = keys.length
        ? await q(
            `SELECT so.id, so.num, so.customerPO, so.salesman, so.customFields,
                    so.shipToCity, so.shipToZip,
                    c.name AS customerName,
                    cc.name AS customerClass, sc.name AS soClass,
                    pt.name AS paymentTerms, tr.name AS taxRate,
                    lg.name AS locationGroup, st.name AS status
               FROM so
               JOIN customer c ON c.id = so.customerId
               LEFT JOIN qbclass cc ON cc.id = c.qbClassId
               LEFT JOIN qbclass sc ON sc.id = so.qbClassId
               LEFT JOIN paymentterms pt ON pt.id = so.paymentTermsId
               LEFT JOIN taxrate tr ON tr.id = so.taxRateId
               LEFT JOIN locationgroup lg ON lg.id = so.locationGroupId
               LEFT JOIN sostatus st ON st.id = so.statusId
              WHERE ${keys.map((k) => `so.customerPO LIKE '%${k}%' OR so.num LIKE '%${k}%'`).join(" OR ")}
              ORDER BY so.id DESC
              LIMIT 1`,
          )
        : [];

      // The full kit closure, so a nested display resolves to the parts Point B
      // actually holds instead of to another kit number.
      const kits = orderedParts.length ? await loadKitClosure(q, orderedParts) : [];

      if (sos.length === 0) return { so: null, items: [] as Record<string, unknown>[], kits };

      const soRow = sos[0];
      const items = await q(
        `SELECT si.soLineItem, si.productNum, si.qtyOrdered, si.unitPrice,
                si.totalPrice, si.typeId, qc.name AS itemClass
           FROM soitem si
           LEFT JOIN qbclass qc ON qc.id = si.qbClassId
          WHERE si.soId = ${Number(soRow.id)}
          ORDER BY si.soLineItem`,
      );
      return { so: soRow, items, kits };
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  // Kit → its LEAF parts, one kit's worth. flattenKit walks the closure, so a
  // nested display resolves to real parts rather than to another kit number.
  const kitComponents = new Map<string, Array<{ part: string; qty: number }>>();
  for (const kit of new Set(payload.kits.map((e) => e.kit))) {
    kitComponents.set(
      kit.trim().toUpperCase(),
      flattenKit(kit, 1, payload.kits)
        .filter((l) => !l.isKit)
        .map((l) => ({ part: l.product, qty: l.qty })),
    );
  }

  let divergences: ReturnType<typeof compareOrderToSo> = [];
  let snapshot: FishbowlSoSnapshot | null = null;
  if (payload.so) {
    const r = payload.so as Record<string, unknown>;
    snapshot = {
      num: String(r.num ?? ""),
      customerPO: (r.customerPO as string) ?? null,
      customerName: (r.customerName as string) ?? null,
      soClass: (r.soClass as string) ?? null,
      customerClass: (r.customerClass as string) ?? null,
      paymentTerms: (r.paymentTerms as string) ?? null,
      taxRate: (r.taxRate as string) ?? null,
      locationGroup: (r.locationGroup as string) ?? null,
      status: (r.status as string) ?? null,
      salesman: (r.salesman as string) ?? null,
      shipToCity: (r.shipToCity as string) ?? null,
      shipToZip: (r.shipToZip as string) ?? null,
      customFields: (r.customFields as string) ?? null,
      items: payload.items.map((i) => {
        const it = i as Record<string, unknown>;
        return {
          lineItem: Number(it.soLineItem ?? 0) || null,
          typeId: Number(it.typeId ?? 0),
          productNum: (it.productNum as string) ?? null,
          qtyOrdered: Number(it.qtyOrdered ?? 0),
          unitPrice: Number(it.unitPrice ?? 0),
          totalPrice: Number(it.totalPrice ?? 0),
          itemClass: (it.itemClass as string) ?? null,
        };
      }),
    };
    divergences = compareOrderToSo(order, snapshot, kitComponents);
  }

  // Stock, over the same fully-expanded parts the push gate uses. This view
  // exists to show a person why an order was held (or would be); the gate that
  // actually decides is the push preflight, lib/fishbowl.ts `stockLines`.
  let stock = null;
  if (synapseConfigured()) {
    try {
      const rollup = rollUpSynapseInventory(await getSynapseInventoryRows());
      const totals = new Map<string, number>();
      for (const it of order.items ?? []) {
        const part = String(it.part ?? "").trim();
        const qty = Number(it.quantity ?? 0);
        if (!isRealPart(part) || qty <= 0) continue;
        const comps = kitComponents.get(part.toUpperCase());
        if (comps?.length) {
          for (const c of comps) totals.set(c.part, (totals.get(c.part) ?? 0) + c.qty * qty);
        } else {
          totals.set(part, (totals.get(part) ?? 0) + qty);
        }
      }
      stock = checkStock([...totals].map(([part, quantity]) => ({ part, quantity })), rollup);
    } catch (e) {
      stock = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({
    ref: orderRef(order),
    so: snapshot ? { num: snapshot.num, customerPO: snapshot.customerPO, status: snapshot.status } : null,
    divergences,
    summary: snapshot ? divergenceSummary(divergences) : "Not found in Fishbowl yet.",
    stock,
  });
}
