"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";
import type { DemandProfile } from "@/lib/seasonalDemand";

/**
 * Browser access to the seasonal demand profiles (/api/inventory/demand).
 * One request per 5 minutes is shared by every caller on the page. A failure
 * resolves to an empty map, so callers fall back to the flat avg / mo they used
 * before rather than blanking.
 */

const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; value: Promise<Map<string, DemandProfile>> } | null = null;

async function load(): Promise<Map<string, DemandProfile>> {
  try {
    const { data } = await supabaseBrowser().auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch("/api/inventory/demand", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return new Map();
    const j = (await res.json()) as { profiles?: Record<string, DemandProfile> };
    return new Map(Object.entries(j.profiles ?? {}));
  } catch {
    return new Map();
  }
}

export function fetchDemandProfiles(): Promise<Map<string, DemandProfile>> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = load();
  cached = { at: Date.now(), value };
  // Don't hold on to an empty (failed) answer.
  value.then((m) => {
    if (m.size === 0 && cached?.value === value) cached = null;
  });
  return value;
}
