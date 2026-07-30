import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * GET /api/email/customer-search?q=acme
 *
 * Type-ahead search across wholesale + D2C contacts, for picking a real
 * customer whose merge-field values a test email should use. Returns just
 * enough to label and identify each: { customer_type, customer_ref, name, email }.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ customers: [] });

  const like = `%${q}%`;
  const [ws, d2c] = await Promise.all([
    supabaseServer
      .from("customer_contact_summary")
      .select("customerid, customer_name, email")
      .ilike("customer_name", like)
      .limit(6),
    supabaseServer
      .from("d2c_customer_contact")
      .select("person_key, customer_name, email")
      .ilike("customer_name", like)
      .limit(6),
  ]);

  const customers = [
    ...((ws.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      customer_type: "wholesale" as const,
      customer_ref: r.customerid as string,
      name: (r.customer_name as string | null) ?? "(no name)",
      email: (r.email as string | null) ?? null,
    })),
    ...((d2c.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      customer_type: "d2c" as const,
      customer_ref: r.person_key as string,
      name: (r.customer_name as string | null) ?? "(no name)",
      email: (r.email as string | null) ?? null,
    })),
  ];

  return NextResponse.json({ customers });
}
