"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { parseEmailAddresses } from "@/lib/email/addresses";

/**
 * Email-suppression flags for the customer lists: who we can no longer email
 * (bounced / unsubscribed / complained), matched the same way sends match —
 * by ADDRESS. If the address on the customer record changes (fixed in
 * Fishbowl), the hard flag clears and a "new email on file" note takes over.
 */

export type SuppressionInfo = { source: string; email: string; addressChanged: boolean };

export type SuppressionMaps = {
  /** normalized address → suppression (the address itself is dead/opted out) */
  byEmail: Map<string, SuppressionInfo>;
  /** `${customer_type}:${customer_ref}` → suppression attributed to that account */
  byCustomer: Map<string, SuppressionInfo>;
  loaded: boolean;
};

export type CustomerEmailFlag = {
  /** suppressed = current address is blocked; changed = a PAST address was
      suppressed but the record now carries a different one (sends work). */
  kind: "suppressed" | "changed";
  source: string;
  email: string;
};

const EMPTY: SuppressionMaps = { byEmail: new Map(), byCustomer: new Map(), loaded: false };

export function useSuppressionFlags(): SuppressionMaps {
  const [maps, setMaps] = useState<SuppressionMaps>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch("/api/email/suppressions", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const json = await res.json();
        const rows = (json.suppressions ?? []) as Array<{
          email: string;
          source: string;
          customer_type: string | null;
          customer_ref: string | null;
          address_changed?: boolean;
        }>;
        const byEmail = new Map<string, SuppressionInfo>();
        const byCustomer = new Map<string, SuppressionInfo>();
        for (const r of rows) {
          const info: SuppressionInfo = {
            source: r.source,
            email: r.email,
            addressChanged: r.address_changed === true,
          };
          const email = r.email.trim().toLowerCase();
          if (email && !byEmail.has(email)) byEmail.set(email, info);
          if (r.customer_type && r.customer_ref) {
            const key = `${r.customer_type}:${r.customer_ref}`;
            // A still-suppressed row outranks one whose address was since fixed.
            const existing = byCustomer.get(key);
            if (!existing || (existing.addressChanged && !info.addressChanged)) {
              byCustomer.set(key, info);
            }
          }
        }
        if (!cancelled) setMaps({ byEmail, byCustomer, loaded: true });
      } catch {
        /* non-critical — lists just render without flags */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return maps;
}

/** The flag (if any) for one customer row. */
export function customerEmailFlag(
  maps: SuppressionMaps,
  customerType: "wholesale" | "d2c",
  customerRef: string,
  emailRaw?: string | null,
): CustomerEmailFlag | null {
  if (!maps.loaded) return null;

  // Attributed suppression for this account. The server compared it against
  // the contact view's CURRENT address, so `addressChanged` already encodes
  // "someone fixed the email in Fishbowl since" — no row email needed
  // (wholesale list rows don't carry one).
  const attributed = maps.byCustomer.get(`${customerType}:${customerRef}`);
  if (attributed) {
    return {
      kind: attributed.addressChanged ? "changed" : "suppressed",
      source: attributed.source,
      email: attributed.email,
    };
  }

  // Fallback for unattributed suppressions: match the row's own primary
  // address (sends go to the FIRST parsed address).
  const primary = (parseEmailAddresses(emailRaw)[0] ?? "").toLowerCase();
  if (primary) {
    const hit = maps.byEmail.get(primary);
    if (hit) return { kind: "suppressed", source: hit.source, email: hit.email };
  }
  return null;
}

const SOURCE_LABEL: Record<string, string> = {
  bounce: "Email bounced",
  complaint: "Spam complaint",
  link: "Unsubscribed",
  manual: "Unsubscribed",
};

/** Display text + classes for a flag chip. */
export function flagChip(flag: CustomerEmailFlag): { label: string; className: string; title: string } {
  if (flag.kind === "changed") {
    return {
      label: "New email on file",
      className: "bg-sky-100 text-sky-700",
      title: `Previous address ${flag.email} ${SOURCE_LABEL[flag.source]?.toLowerCase() ?? "was suppressed"} — the address now on file is different, so emails send normally.`,
    };
  }
  return {
    label: SOURCE_LABEL[flag.source] ?? "Suppressed",
    className:
      flag.source === "bounce"
        ? "bg-rose-100 text-rose-700"
        : flag.source === "complaint"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-200 text-slate-600",
    title:
      flag.source === "bounce"
        ? `${flag.email} hard-bounced — the mailbox no longer exists. Emails to this customer are skipped until the address is corrected in Fishbowl.`
        : flag.source === "complaint"
          ? `${flag.email} marked an email as spam. Sends are suppressed.`
          : `${flag.email} unsubscribed. Sends are suppressed.`,
  };
}
