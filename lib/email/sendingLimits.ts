import { supabaseServer } from "@/lib/supabaseServer";
import { DEFAULT_LIMITS, type SendingLimits } from "@/lib/automations/overlap";

/**
 * The account's marketing frequency cap (email_settings). Falls back to the
 * defaults when the columns aren't migrated yet, so the cap is always on.
 */
export async function loadSendingLimits(): Promise<SendingLimits & { stored: boolean }> {
  const { data, error } = await supabaseServer
    .from("email_settings")
    .select("marketing_per_week, marketing_min_gap_days")
    .maybeSingle();
  if (error || !data) return { ...DEFAULT_LIMITS, stored: false };
  const row = data as { marketing_per_week: number | null; marketing_min_gap_days: number | null };
  return {
    perWeek: row.marketing_per_week ?? DEFAULT_LIMITS.perWeek,
    minGapDays: row.marketing_min_gap_days ?? DEFAULT_LIMITS.minGapDays,
    stored: true,
  };
}

/**
 * When this address last received marketing mail in the past 7 days: every
 * real automation send plus every real bulk-blast send. Test sends (test
 * batches, test blasts) went to a tester, so they don't count.
 */
export async function recentMarketingSends(email: string): Promise<Date[]> {
  // ilike with the LIKE wildcards escaped = case-insensitive equality.
  const address = email.trim().replace(/[\\%_]/g, (c) => "\\" + c);
  if (!address) return [];
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [auto, blast] = await Promise.all([
    supabaseServer
      .from("automation_step_sends")
      .select("sent_at, automation_enrollments!inner(customer_email, is_test)")
      .eq("status", "sent")
      .gte("sent_at", since)
      .eq("automation_enrollments.is_test", false)
      .ilike("automation_enrollments.customer_email", address),
    supabaseServer
      .from("email_send_job_recipients")
      .select("sent_at, email_send_jobs!inner(test_email)")
      .eq("status", "sent")
      .gte("sent_at", since)
      .is("email_send_jobs.test_email", null)
      .ilike("customer_email", address),
  ]);

  const out: Date[] = [];
  for (const r of ((auto.data as Array<{ sent_at: string }> | null) ?? [])) out.push(new Date(r.sent_at));
  for (const r of ((blast.data as Array<{ sent_at: string | null }> | null) ?? [])) {
    if (r.sent_at) out.push(new Date(r.sent_at));
  }
  return out;
}
