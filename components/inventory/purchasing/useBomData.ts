"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BomUniverse } from "@/lib/fishbowlBom";
import type { VarianceRow } from "@/lib/inventoryVariance";
import { fetchPointBRows, normPart, resolveOnHand } from "@/lib/inventoryOnHand";
import { usableStock, whereUsed } from "@/lib/bomPlan";

/**
 * Fishbowl BOMs + component stock, with Point B's live count laid over
 * anything Point B holds (finished goods used inside kits and testers).
 * Shared by the product page's BOM tab and the Purchasing page.
 */
export function useBomData() {
  const [universe, setUniverse] = useState<BomUniverse | null>(null);
  const [pointb, setPointb] = useState<Map<string, VarianceRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError(null);
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const bomReq = fetch(`/api/inventory/bom${reloadKey > 0 ? "?fresh=1" : ""}`, {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? `BOM read failed (${res.status})`);
        return json as BomUniverse;
      });
      // Point B is optional here: without it, Fishbowl's own Point B figure stands.
      const pbReq = fetchPointBRows().catch(() => null);
      try {
        const [u, pb] = await Promise.all([bomReq, pbReq]);
        if (cancelled) return;
        setUniverse(u);
        setPointb(pb);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  /** Usable units of a part right now (no on-order). */
  const stockOf = useCallback(
    (part: string): number => {
      const p = universe?.parts[part];
      const vr = pointb?.get(normPart(part));
      // Only take Point B's figure when it's comparable (same unit as Fishbowl).
      const resolved = vr ? resolveOnHand(null, vr) : null;
      const pbAvail = resolved && resolved.source === "pointb" ? resolved.onHand : null;
      return usableStock(p, pbAvail);
    },
    [universe, pointb],
  );

  const used = useMemo(() => (universe ? whereUsed(universe.boms) : new Map<string, string[]>()), [universe]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { universe, stockOf, whereUsed: used, pointbLive: pointb !== null, loading, error, reload };
}
