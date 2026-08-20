"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CustomerViewMode } from "../constants";

/**
 * Customers whose last campaign send didn't land — skipped before it went out
 * (no address, unsubscribed, duplicate address) or rejected by the provider.
 *
 * Complements the other two email hooks: [useEmailQuality] says an address
 * looks unusable, [useSuppressionFlags] says it went bad after we mailed it,
 * and this one says what actually happened the last time we tried.
 */

export type CampaignSkip = {
  status: "skipped" | "failed" | string;
  reason: string | null;
};

export type CampaignSkipMaps = {
  /** customer ref → the outcome of their most recent campaign send. */
  byRef: Map<string, CampaignSkip>;
  loaded: boolean;
};

const EMPTY: CampaignSkipMaps = { byRef: new Map(), loaded: false };

/** Tagged with the view mode it describes — see useEmailQuality. */
type Tagged = CampaignSkipMaps & { mode: CustomerViewMode | null };

export function useCampaignSkips(viewMode: CustomerViewMode): CampaignSkipMaps {
  const [maps, setMaps] = useState<Tagged>({ ...EMPTY, mode: null });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch(
          `/api/email/skipped-recipients?type=${viewMode === "d2c" ? "d2c" : "wholesale"}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (!res.ok) return;
        const json = await res.json();
        const byRef = new Map<string, CampaignSkip>();
        for (const row of (json.blocked ?? []) as Array<{
          ref: string;
          status: string;
          reason: string | null;
        }>) {
          byRef.set(row.ref, { status: row.status, reason: row.reason });
        }
        if (!cancelled) setMaps({ byRef, loaded: true, mode: viewMode });
      } catch {
        /* non-critical — the list just renders without skip flags */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewMode]);

  // Memoized so the identity is stable — callers key their filter memos off it.
  return useMemo(() => (maps.mode === viewMode ? maps : EMPTY), [maps, viewMode]);
}

/**
 * Chip for a blocked send — but only when the reason isn't already on the row.
 * "No email address on file" and "Unsubscribed" duplicate the quality and
 * suppression chips, and three chips saying the same thing is noise. Returns
 * null when another chip already explains it.
 */
export function skipChip(skip: CampaignSkip): {
  label: string;
  className: string;
  title: string;
} | null {
  const reason = (skip.reason ?? "").toLowerCase();

  if (reason.includes("no email address")) return null;
  if (reason.includes("unsubscribed")) return null;

  if (reason.includes("duplicate address")) {
    return {
      label: "Duplicate address",
      className: "bg-violet-100 text-violet-700",
      title:
        "Another customer selected in the same campaign shares this address, so only one copy was sent — this record was skipped.",
    };
  }

  return {
    label: skip.status === "failed" ? "Send failed" : "Send skipped",
    className: skip.status === "failed" ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-600",
    title: skip.reason
      ? `Last campaign send didn't go out: ${skip.reason}`
      : "The last campaign send to this customer didn't go out.",
  };
}
