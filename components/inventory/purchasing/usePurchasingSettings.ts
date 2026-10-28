"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { PartSetting, VendorSetting } from "@/lib/bomPlan";

type Kind = "part" | "vendor";

/**
 * The ordering rules staff set on the Purchasing page (minimums, multiples,
 * prices, lead times). Edits apply to the page immediately and save in the
 * background; if the table isn't there yet (migration not pushed) they still
 * apply for this visit, and `ready` is false so the drawer can say so.
 */
export function usePurchasingSettings() {
  const [parts, setParts] = useState<Map<string, PartSetting>>(new Map());
  const [vendors, setVendors] = useState<Map<string, VendorSetting>>(new Map());
  const [ready, setReady] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/inventory/purchasing-settings", { cache: "no-store", headers: await authHeaders() });
      const json = await res.json().catch(() => null);
      if (cancelled || !res.ok || !json) return;
      setReady(json.ready !== false);
      setParts(new Map((json.parts as PartSetting[]).map((p) => [p.part, p])));
      setVendors(new Map((json.vendors as VendorSetting[]).map((v) => [v.vendor, v])));
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  const save = useCallback(
    async (kind: Kind, key: string, fields: Record<string, number | string | null>) => {
      // Apply locally first, so the order list updates as soon as you tab out.
      if (kind === "part") {
        setParts((m) => {
          const prev = m.get(key) ?? { part: key, min_qty: null, multiple: null, unit_price: null, lead_days: null, note: null };
          return new Map(m).set(key, { ...prev, ...fields } as PartSetting);
        });
      } else {
        setVendors((m) => {
          const prev = m.get(key) ?? { vendor: key, min_run_qty: null, item_min_qty: null, lead_days: null, note: null };
          return new Map(m).set(key, { ...prev, ...fields } as VendorSetting);
        });
      }
      setSaveError(null);
      try {
        const res = await fetch("/api/inventory/purchasing-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ kind, [kind]: key, ...fields }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          if (res.status === 503) setReady(false);
          else setSaveError(json?.error ?? `Couldn't save (${res.status})`);
        }
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e));
      }
    },
    [authHeaders],
  );

  return { partSettings: parts, vendorSettings: vendors, save, ready, saveError };
}
