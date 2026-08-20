"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { flagEmailField, type EmailIssue } from "@/lib/email/addresses";
import type { CustomerViewMode } from "../constants";

/**
 * Address-quality flags for the customer lists: who we *can't* email because
 * the record has no address or a malformed one, and who we technically can but
 * probably shouldn't count on — `info@`, `sales@`, `orders@`.
 *
 * Distinct from [useSuppressionFlags], which answers "did this address go
 * bad after we mailed it" (bounces, unsubscribes). This one answers "is there
 * a usable address here at all", which is knowable before the first send —
 * and is where most skipped recipients come from: 103 of the 141 skips on the
 * first blast were simply "No email address on file".
 *
 * The judgement itself is `flagEmail`, the same function the automations
 * dry-run preview uses, so a customer flagged here is flagged there too.
 */

export type EmailQualityInfo = {
  issue: EmailIssue;
  warning: string;
  /** The address judged — the first one, since that's where sends go. */
  email: string | null;
};

export type EmailQualityMaps = {
  /** customer ref → issue. Only customers WITH an issue are present. */
  byRef: Map<string, EmailQualityInfo>;
  loaded: boolean;
};

const PAGE_SIZE = 1000;

type ContactRow = {
  customerid?: string | null;
  person_key?: string | null;
  email: string | null;
};

/** Both contact views, spelled out rather than built from a variable — a
 *  template-literal select defeats the client's column typing.
 *
 *  Ordered by the ref column, and that is load-bearing: paginating a view with
 *  no ORDER BY lets Postgres return rows in a different arrangement per page,
 *  so pages overlap and other rows are never returned at all. Measured on
 *  customer_contact_summary: 2,477 rows fetched but only 2,076 distinct
 *  customers, i.e. 401 customers silently missing from the flags. */
function contactPage(viewMode: CustomerViewMode, page: number) {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  return viewMode === "d2c"
    ? supabase
        .from("d2c_customer_contact")
        .select("person_key, email")
        .order("person_key")
        .range(from, to)
    : supabase
        .from("customer_contact_summary")
        .select("customerid, email")
        .order("customerid")
        .range(from, to);
}

const EMPTY: EmailQualityMaps = { byRef: new Map(), loaded: false };

/** Which view mode the loaded flags describe, so a mode switch reads as
 *  "not loaded yet" rather than briefly showing the other list's flags. */
type Tagged = EmailQualityMaps & { mode: CustomerViewMode | null };

export function useEmailQuality(viewMode: CustomerViewMode): EmailQualityMaps {
  const [maps, setMaps] = useState<Tagged>({ ...EMPTY, mode: null });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const byRef = new Map<string, EmailQualityInfo>();

      // The contact views are a few thousand rows of two columns; scanning
      // them once per view mode costs less than asking the server the same
      // question per filter change, and it's what lets the chips render on
      // every row rather than only while a filter is on.
      for (let page = 0; ; page++) {
        const { data, error } = await contactPage(viewMode, page);

        if (cancelled) return;
        // Non-critical: the lists just render without quality chips.
        if (error || !data) break;

        for (const row of data as ContactRow[]) {
          const ref = row.person_key ?? row.customerid;
          if (!ref) continue;
          const flag = flagEmailField(row.email);
          if (!flag.issue) continue;
          byRef.set(ref, {
            issue: flag.issue,
            warning: flag.warning ?? "",
            email: row.email,
          });
        }

        if (data.length < PAGE_SIZE) break;
      }

      if (!cancelled) setMaps({ byRef, loaded: true, mode: viewMode });
    })();

    return () => {
      cancelled = true;
    };
  }, [viewMode]);

  // Memoized so the identity is stable — callers key their filter memos off it.
  return useMemo(() => (maps.mode === viewMode ? maps : EMPTY), [maps, viewMode]);
}

/** Chip text + classes for an address-quality issue. */
export function qualityChip(info: EmailQualityInfo): {
  label: string;
  className: string;
  title: string;
} {
  switch (info.issue) {
    case "missing":
      return {
        label: "No email",
        className: "bg-slate-200 text-slate-600",
        title:
          "No address on file, so this customer is skipped by every campaign. Add one in Fishbowl.",
      };
    case "invalid":
      return {
        label: "Invalid email",
        className: "bg-rose-100 text-rose-700",
        title: `“${info.email ?? ""}” isn't a valid address — sends to it are rejected outright.`,
      };
    case "typo":
      return {
        label: "Likely typo",
        className: "bg-amber-100 text-amber-700",
        title: `${info.warning} — mail to it bounces or reaches a stranger.`,
      };
    case "role":
      return {
        label: "Role address",
        className: "bg-sky-100 text-sky-700",
        title: `“${info.email ?? ""}” is a shared mailbox (info@, sales@…). It delivers, but often to nobody in particular.`,
      };
  }
}

/** Which issues each filter value selects. */
export const QUALITY_FILTERS: Record<string, EmailIssue[]> = {
  no_email: ["missing"],
  bad_address: ["invalid", "typo"],
  role_address: ["role"],
};
