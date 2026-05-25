"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Brand-level config (display name, accent color, sender name) keyed by the
 * brand string ("NI" / "Sassy" today). Maintained from /settings → Brand
 * settings; read here by any page that wants to surface brand-aware UI.
 */

export type BrandSettings = {
  brand: string;
  display_name: string | null;
  primary_color: string | null;
  sender_name: string | null;
};

export function useBrandSettings() {
  const [byBrand, setByBrand] = useState<Record<string, BrandSettings>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("brand_settings")
        .select("brand, display_name, primary_color, sender_name");
      if (cancelled) return;
      const map: Record<string, BrandSettings> = {};
      for (const r of (data ?? []) as BrandSettings[]) {
        map[r.brand] = r;
      }
      setByBrand(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { byBrand, loading };
}

/**
 * Inline style for a brand badge — light tint background + bold accent text,
 * derived from the saved primary_color hex. Falls back to neutral gray when
 * no color is configured.
 */
export function brandBadgeStyle(
  hex: string | null | undefined,
): React.CSSProperties {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return { background: "#f3f4f6", color: "#374151" };
  }
  // ~12% alpha tint behind the brand's accent color.
  return {
    background: `${hex}1f`,
    color: hex,
  };
}
