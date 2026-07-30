import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { normalizeEmail } from "@/lib/email/unsubscribe";

export const runtime = "nodejs";

/** PostgREST puts .in() lists in the URL — keep lookups chunked. */
const QUERY_CHUNK = 200;
/** Far above any plausible suppression-list size; a bound, not a pager. */
const MAX_ROWS = 5000;

type SuppressionRow = {
  email: string;
  source: string;
  reason: string | null;
  customer_type: string | null;
  customer_ref: string | null;
  created_at: string;
};

type CustomerInfo = {
  customer_name: string | null;
  customer_type: string | null;
  customer_ref: string | null;
};

/**
 * GET /api/email/suppressions
 *
 * The suppression list (unsubscribes + bounces + complaints) with each row
 * resolved back to the customer it belongs to. Link unsubscribes carry their
 * customer ref in the row; bounce/complaint rows arrive from the Resend
 * webhook with only an address, so those are matched against who we've
 * actually mailed at that address (send-job recipients, then automation
 * enrollments).
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("email_unsubscribes")
    .select("email, source, reason, customer_type, customer_ref, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data as SuppressionRow[] | null) ?? [];
  const emails = [...new Set(rows.map((r) => normalizeEmail(r.email)).filter(Boolean))];

  // email → customer identity, from the most reliable sources we have.
  const byEmail = new Map<string, CustomerInfo>();

  const absorb = (email: string | null, info: CustomerInfo) => {
    const key = normalizeEmail(email ?? "");
    if (!key) return;
    const existing = byEmail.get(key);
    // First hit wins unless it lacked a name and this one has one.
    if (!existing || (!existing.customer_name && info.customer_name)) {
      byEmail.set(key, info);
    }
  };

  for (let i = 0; i < emails.length; i += QUERY_CHUNK) {
    const slice = emails.slice(i, i + QUERY_CHUNK);

    const { data: sent } = await supabaseServer
      .from("email_send_job_recipients")
      .select("customer_email, customer_name, customer_type, customer_ref")
      .in("customer_email", slice);
    for (const r of ((sent as Array<Record<string, string | null>> | null) ?? [])) {
      absorb(r.customer_email, {
        customer_name: r.customer_name ?? null,
        customer_type: r.customer_type ?? null,
        customer_ref: r.customer_ref ?? null,
      });
    }

    const { data: enrolled } = await supabaseServer
      .from("automation_enrollments")
      .select("customer_email, customer_name, customer_type, customer_ref")
      .in("customer_email", slice);
    for (const r of ((enrolled as Array<Record<string, string | null>> | null) ?? [])) {
      absorb(r.customer_email, {
        customer_name: r.customer_name ?? null,
        customer_type: r.customer_type ?? null,
        customer_ref: r.customer_ref ?? null,
      });
    }
  }

  const suppressions = rows.map((r) => {
    const match = byEmail.get(normalizeEmail(r.email));
    return {
      email: r.email,
      source: r.source,
      reason: r.reason,
      created_at: r.created_at,
      // The row's own ref (link unsubs mint it from the token) beats a lookup.
      customer_type: r.customer_type ?? match?.customer_type ?? null,
      customer_ref: r.customer_ref ?? match?.customer_ref ?? null,
      customer_name: match?.customer_name ?? null,
    };
  });

  return NextResponse.json({ suppressions, capped: rows.length === MAX_ROWS });
}
