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

  // Rows carry customer_type/customer_ref (link unsubs mint them from the
  // token; webhook + backfill attribute bounces). Resolve display names and
  // CURRENT addresses by ref from the contact views — the current address is
  // what lets the UI say "the address on file has changed since this bounce".
  const wholesaleRefs = [...new Set(rows.filter((r) => r.customer_type === "wholesale" && r.customer_ref).map((r) => r.customer_ref as string))];
  const d2cRefs = [...new Set(rows.filter((r) => r.customer_type === "d2c" && r.customer_ref).map((r) => r.customer_ref as string))];

  const byRef = new Map<string, { name: string | null; currentEmail: string | null }>();
  const load = async (view: string, refCol: string, refs: string[], type: string) => {
    for (let i = 0; i < refs.length; i += QUERY_CHUNK) {
      const { data: found } = await supabaseServer
        .from(view)
        .select(`${refCol}, customer_name, email`)
        .in(refCol, refs.slice(i, i + QUERY_CHUNK));
      for (const r of ((found as Array<Record<string, string | null>> | null) ?? [])) {
        byRef.set(`${type}:${r[refCol]}`, {
          name: r.customer_name ?? null,
          currentEmail: r.email ?? null,
        });
      }
    }
  };
  await load("customer_contact_summary", "customerid", wholesaleRefs, "wholesale");
  await load("d2c_customer_contact", "person_key", d2cRefs, "d2c");

  const suppressions = rows.map((r) => {
    const match = r.customer_ref ? byRef.get(`${r.customer_type}:${r.customer_ref}`) : undefined;
    // Does the customer's CURRENT primary address still match the suppressed
    // one? False → someone fixed it in Fishbowl since; sends now work again.
    const currentFirst = (match?.currentEmail ?? "").split(/[;,]/)[0]?.replace(/[<>]/g, "").trim();
    const addressChanged =
      !!match && !!r.customer_ref &&
      normalizeEmail(currentFirst || "") !== normalizeEmail(r.email);
    return {
      email: r.email,
      source: r.source,
      reason: r.reason,
      created_at: r.created_at,
      customer_type: r.customer_type,
      customer_ref: r.customer_ref,
      customer_name: match?.name ?? null,
      address_changed: addressChanged,
    };
  });

  return NextResponse.json({ suppressions, capped: rows.length === MAX_ROWS });
}
