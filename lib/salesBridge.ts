/**
 * Price / volume / mix / new / lost decomposition of a revenue change between
 * two windows, given per-product revenue + units for each.
 *
 * Extracted from the dashboard's sales-driver panel so the rep-group analysis
 * can reuse the exact same math. The parts sum to ΔRevenue by construction
 * (mix is the residual), so the bridge always reconciles.
 *
 *   Volume — more/fewer units on continuing products, at last year's avg price
 *   Mix    — shift of unit share between products (the residual)
 *   Price  — price-per-unit change on continuing products
 *   New    — revenue from products sold this window but not the prior one
 *   Lost   — revenue from products sold the prior window but not this one
 */

export type ProductAgg = { revenue: number; units: number };

export type BridgePart = { key: "volume" | "mix" | "price" | "new" | "lost"; label: string; amount: number };

export type SalesBridge = {
  cur: number;
  prior: number;
  delta: number;
  parts: BridgePart[];
  newCount: number;
  lostCount: number;
};

export function computeBridge(
  cur: Map<string, ProductAgg>,
  prior: Map<string, ProductAgg>,
): SalesBridge {
  const R1 = [...cur.values()].reduce((s, a) => s + a.revenue, 0);
  const R0 = [...prior.values()].reduce((s, a) => s + a.revenue, 0);

  let R0c = 0,
    R1c = 0,
    Q0c = 0,
    Q1c = 0,
    priceEffect = 0;
  let newRev = 0,
    lostRev = 0,
    newCount = 0,
    lostCount = 0;

  for (const key of new Set([...cur.keys(), ...prior.keys()])) {
    const c = cur.get(key);
    const p = prior.get(key);
    const cRev = c?.revenue ?? 0;
    const pRev = p?.revenue ?? 0;

    if (c && p) {
      R0c += pRev;
      R1c += cRev;
      Q0c += p.units;
      Q1c += c.units;
      if (p.units > 0 && c.units > 0) {
        priceEffect += c.units * (cRev / c.units - pRev / p.units);
      }
    } else if (c && !p) {
      newRev += cRev;
      newCount += 1;
    } else if (p && !c) {
      lostRev += pRev;
      lostCount += 1;
    }
  }

  const avgP0c = Q0c > 0 ? R0c / Q0c : 0;
  const volumeEffect = (Q1c - Q0c) * avgP0c;
  const mixEffect = R1c - R0c - volumeEffect - priceEffect; // residual → bridge reconciles

  return {
    cur: R1,
    prior: R0,
    delta: R1 - R0,
    newCount,
    lostCount,
    parts: [
      { key: "volume", label: "Volume", amount: volumeEffect },
      { key: "mix", label: "Mix", amount: mixEffect },
      { key: "price", label: "Price", amount: priceEffect },
      { key: "new", label: "New products", amount: newRev },
      { key: "lost", label: "Lost products", amount: -lostRev },
    ],
  };
}
