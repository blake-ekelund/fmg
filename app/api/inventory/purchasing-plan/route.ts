import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured } from "@/lib/fishbowl";
import { buildable, priceFor, leadDaysFor, vendorFor, isFill, FILLER_LOCATION, type Family } from "@/lib/bomPlan";
import { planFamily, rankFamilies, sendToKapra, vendorOrders, NO_VENDOR, type PlanStatus } from "@/lib/purchasingPlan";
import { loadServerPlan } from "@/lib/purchasingPlanServer";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/inventory/purchasing-plan — the Purchasing page's plan as compact
 * JSON, for Sage. Same maths as the page (lib/purchasingPlan.ts).
 *
 *   ?months=6               target months of stock (default 6)
 *   ?include=low|all        plan for At risk + Review (default) or every product
 *   (no family)             → ranked families with what each would cost
 *   ?family=<words|part>    → that family: what to make, orders per vendor,
 *                             check-first, send-to-Kapra
 *   ?lookup=<words|part>    → a product's recipe, or one ingredient's stock,
 *                             open POs, price, rules and where it's used
 * Read-only.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!fishbowlConfigured()) return NextResponse.json({ error: "Fishbowl not connected." }, { status: 500 });

  const url = new URL(request.url);
  const months = Math.max(1, Math.min(24, Number(url.searchParams.get("months")) || 6));
  const statuses: PlanStatus[] = url.searchParams.get("include") === "all" ? [] : ["at risk", "needs review"];
  const familyQ = (url.searchParams.get("family") ?? "").trim().toLowerCase();
  const lookupQ = (url.searchParams.get("lookup") ?? "").trim().toLowerCase();

  try {
    const sp = await loadServerPlan({ targetMonths: months, statuses });
    const { universe, ctx, families, rowOf } = { ...sp, rowOf: sp.ctx.rowOf };
    const nameOf = (p: string) => rowOf.get(p)?.name ?? universe.parts[p]?.description ?? p;
    const famName = (f: Family) => f.lines.slice(0, 3).join(" & ");
    const r1 = (n: number) => Math.round(n * 10) / 10;

    /* ─── Lookup: a product's recipe or one ingredient ─── */
    if (lookupQ) {
      const matches = Object.values(universe.parts).filter(
        (p) => p.part.toLowerCase() === lookupQ || `${p.part} ${p.description} ${rowOf.get(p.part)?.name ?? ""}`.toLowerCase().includes(lookupQ),
      );
      const products = matches.filter((p) => universe.boms[p.part]).slice(0, 5);
      const ingredients = matches.filter((p) => !universe.boms[p.part]).slice(0, 8);
      const usedIn = (c: string) =>
        Object.entries(universe.boms).filter(([, b]) => b.lines.some((l) => l.component === c)).map(([fg]) => fg);
      return NextResponse.json({
        products: products.map((p) => {
          const now = buildable(p.part, universe.boms, ctx.supply);
          return {
            part: p.part,
            name: nameOf(p.part),
            months_left: rowOf.get(p.part)?.cover != null ? r1(rowOf.get(p.part)!.cover!) : null,
            can_make_now: now.units,
            runs_out_first: now.bottleneck ? universe.parts[now.bottleneck]?.description ?? now.bottleneck : null,
            recipe: universe.boms[p.part].lines.map((l) => {
              const c = universe.parts[l.component];
              return {
                part: l.component,
                ingredient: c?.description ?? l.component,
                per_unit: `${l.bomQty} ${l.bomUom ?? ""}`.trim(),
                have: Math.round(sp.stockOf(l.component)),
                on_order: Math.round(c?.onOrder ?? 0),
                vendor: vendorFor(c),
                used_in_products: usedIn(l.component).length,
              };
            }),
            page: `/products/${encodeURIComponent(p.part)}`,
          };
        }),
        ingredients: ingredients.map((c) => {
          const ps = ctx.partSettings.get(c.part);
          const vs = ctx.vendorSettings.get(vendorFor(c) ?? "");
          const price = priceFor(c, ps);
          return {
            part: c.part,
            name: c.description,
            unit: c.uom,
            usable_now: Math.round(sp.stockOf(c.part)),
            stock_by_location: c.stockByLocation,
            on_order: Math.round(c.onOrder),
            open_pos: c.openPos.map((o) => ({ po: o.po, status: o.status, qty: Math.round(o.remaining), due: o.due?.slice(0, 10) ?? null })),
            vendor: vendorFor(c),
            made_by_kapra: isFill(c),
            price: price.price,
            price_from: price.source,
            price_date: price.date?.slice(0, 10) ?? null,
            lead_days: leadDaysFor(c, ps, vs),
            rules: {
              min_order: ps?.min_qty ?? vs?.item_min_qty ?? c.moq ?? null,
              multiple: ps?.multiple ?? null,
              vendor_run_minimum: vs?.min_run_qty ?? null,
            },
            used_in: usedIn(c.part).map((fg) => ({ part: fg, name: nameOf(fg) })).slice(0, 40),
          };
        }),
      });
    }

    const ranked = rankFamilies(families, ctx);

    /* ─── Overview ─── */
    if (!familyQ) {
      return NextResponse.json({
        target_months: months,
        planning_for: statuses.length ? "At risk + Review products" : "all products",
        point_b_live: sp.pointbLive,
        families: ranked.slice(0, 15).map((c) => ({
          family: famName(c.f),
          products: c.f.parts.length,
          at_risk: c.atRisk,
          review: c.review,
          products_to_make: c.toMake,
          order_cost: Math.round(c.cost),
          items_to_order_now: c.now,
        })),
        page: "/inventory/purchasing",
      });
    }

    /* ─── One family ─── */
    const fam =
      families.find((f) => f.lines.some((l) => l.toLowerCase().includes(familyQ))) ??
      families.find((f) => f.parts.some((p) => p.toLowerCase() === familyQ || nameOf(p).toLowerCase().includes(familyQ)));
    if (!fam) {
      return NextResponse.json({ error: `No family matches "${familyQ}".`, families: ranked.map((c) => famName(c.f)) }, { status: 404 });
    }
    const { plan, req, lines } = planFamily(fam, ctx);
    const orders = vendorOrders(lines, ctx.vendorSettings);
    const buys = new Map(orders.flatMap((o) => o.items.map((i) => [i.r.part, i.buy] as const)));
    const after = (p: string) => ctx.supply(p) + (buys.get(p) ?? 0);

    return NextResponse.json({
      family: famName(fam),
      target_months: months,
      products_to_make: [...plan.entries()]
        .map(([part, make]) => {
          const r = rowOf.get(part);
          return {
            part,
            name: nameOf(part),
            months_left: r?.cover != null ? r1(r.cover) : null,
            make,
            can_make_now: buildable(part, universe.boms, ctx.supply).units,
            can_make_after_order: buildable(part, universe.boms, after).units,
          };
        })
        .sort((a, b) => (a.months_left ?? 99) - (b.months_left ?? 99)),
      orders: orders.map((o) => ({
        vendor: o.vendor,
        urgency: o.worst,
        total: Math.round(o.total),
        lead_weeks: o.weeks,
        lead_time_guessed: o.guessed,
        below_run_minimum_by: o.runMin !== null && o.units < o.runMin ? Math.round(o.runMin - o.units) : 0,
        can_make_fishbowl_po: o.vendor !== NO_VENDOR,
        items: o.items.map((i) => ({
          part: i.r.part,
          name: i.part?.description ?? i.r.part,
          buy: i.buy,
          unit: i.part?.uom ?? null,
          urgency: i.urgency,
          unit_price: i.cost,
          price_from: i.priceSource,
          line_cost: i.lineCost !== null ? Math.round(i.lineCost) : null,
          for_products: i.r.usedBy.map(nameOf),
        })),
      })),
      check_in_fishbowl_first: lines
        .filter((l) => l.urgency === "check")
        .map((l) => ({ part: l.r.part, name: l.part?.description ?? l.r.part, needed: l.buy })),
      send_to_kapra: sendToKapra(req, universe.parts).map((t) => ({
        part: t.part,
        name: universe.parts[t.part]?.description ?? t.part,
        qty: Math.round(t.qty),
        from: t.from,
        to: FILLER_LOCATION,
      })),
      page: `/inventory/purchasing?part=${encodeURIComponent(fam.parts[0])}`,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
