import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/** Recipient rows scanned. Well above the current campaign history. */
const MAX_ROWS = 20000;

type Recipient = {
  customer_type: string;
  customer_ref: string;
  status: string;
  error_text: string | null;
  sent_at: string | null;
  job_id: string;
};

/**
 * GET /api/email/skipped-recipients?type=wholesale|d2c
 *
 * Customers whose MOST RECENT campaign send didn't land — skipped before it
 * went out, or failed at the provider — with the reason.
 *
 * Latest-send rather than ever-skipped on purpose: a customer who was skipped
 * in March for a missing address and mailed successfully in April is fixed,
 * and listing them as a problem sends someone to re-fix nothing.
 *
 * Service role because email_send_job_recipients is RLS-scoped per mailbox,
 * while the customer list needs the whole company's sends.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "d2c" ? "d2c" : "wholesale";

  const { data, error } = await supabaseServer
    .from("email_send_job_recipients")
    .select("customer_type, customer_ref, status, error_text, sent_at, job_id")
    .eq("customer_type", type)
    .limit(MAX_ROWS);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep only each customer's newest send. Skipped rows have no sent_at (they
  // never went out), so fall back to the job id to keep the ordering stable
  // rather than letting a null date look like the oldest row.
  const latest = new Map<string, Recipient>();
  for (const r of ((data as Recipient[] | null) ?? [])) {
    const prev = latest.get(r.customer_ref);
    if (!prev) {
      latest.set(r.customer_ref, r);
      continue;
    }
    const newer =
      (r.sent_at ?? "") > (prev.sent_at ?? "") ||
      ((r.sent_at ?? "") === (prev.sent_at ?? "") && r.job_id > prev.job_id);
    if (newer) latest.set(r.customer_ref, r);
  }

  const blocked: Array<{ ref: string; status: string; reason: string | null }> = [];
  for (const r of latest.values()) {
    if (r.status !== "skipped" && r.status !== "failed") continue;
    blocked.push({
      ref: r.customer_ref,
      status: r.status,
      // Provider errors are long; the head of the message carries the meaning.
      reason: r.error_text ? r.error_text.slice(0, 140) : null,
    });
  }

  return NextResponse.json({ blocked, scanned: latest.size });
}
