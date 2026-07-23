import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/** Guard rail — cohort reporting reads enrollment rows in bulk. */
const MAX_ENROLLMENTS = 20000;

type Outcome =
  | "won_back"
  | "replied"
  | "opened_no_action"
  | "no_action"
  | "unsubscribed";

type CohortRow = {
  key: string;
  automationId: string;
  automationName: string;
  label: string;
  number: number;
  firstReleasedAt: string | null;
  size: number;
  sent: number;
  opened: number;
  replied: number;
  wonBack: number;
  unsubscribed: number;
  noAction: number;
  stillActive: number;
  /** Rehearsal batch — mail went to a tester, not these customers. */
  isTest: boolean;
};

/**
 * GET /api/automations/cohorts
 *
 * One row per released batch, with the outcome mix. Aggregated in JS from a
 * handful of bulk queries rather than a view, because the chain spans five
 * tables (enrollments → step_sends → messages → opens, plus threads for
 * replies) and PostgREST can't express that join in one call.
 *
 * Every customer lands in exactly one outcome bucket, most-committed first:
 *   won back > replied > opened but no action > no action, with unsubscribed
 * pulled out separately. Otherwise the percentages wouldn't sum.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  /* 1. Every enrollment that belongs to a cohort. */
  const { data: enrollRows, error: enrollErr } = await supabaseServer
    .from("automation_enrollments")
    .select(
      "id, automation_id, cohort_label, cohort_number, status, exit_reason, enrolled_at, customer_type, customer_ref, is_test",
    )
    .not("cohort_number", "is", null)
    .order("enrolled_at", { ascending: false })
    .limit(MAX_ENROLLMENTS);
  if (enrollErr) return NextResponse.json({ error: enrollErr.message }, { status: 500 });

  const enrollments = (enrollRows ?? []) as Array<{
    id: string;
    automation_id: string;
    cohort_label: string | null;
    cohort_number: number;
    status: string;
    exit_reason: string | null;
    enrolled_at: string;
    customer_type: "wholesale" | "d2c";
    customer_ref: string;
    is_test: boolean;
  }>;

  if (enrollments.length === 0) {
    return NextResponse.json({ cohorts: [], automations: [] });
  }

  const enrollmentIds = enrollments.map((e) => e.id);

  /* 2. Automation names. */
  const autoIds = [...new Set(enrollments.map((e) => e.automation_id))];
  const { data: autoRows } = await supabaseServer
    .from("automations")
    .select("id, name")
    .in("id", autoIds);
  const autoNames = new Map(
    ((autoRows ?? []) as Array<{ id: string; name: string }>).map((a) => [a.id, a.name]),
  );

  /* 3. Sends, and the messages they produced. */
  const sentByEnrollment = new Map<string, number>();
  const messageToEnrollment = new Map<string, string>();
  for (let i = 0; i < enrollmentIds.length; i += 200) {
    const slice = enrollmentIds.slice(i, i + 200);
    const { data } = await supabaseServer
      .from("automation_step_sends")
      .select("enrollment_id, status, message_id")
      .in("enrollment_id", slice)
      .eq("status", "sent");
    for (const s of (data ?? []) as Array<{
      enrollment_id: string;
      message_id: string | null;
    }>) {
      sentByEnrollment.set(s.enrollment_id, (sentByEnrollment.get(s.enrollment_id) ?? 0) + 1);
      if (s.message_id) messageToEnrollment.set(s.message_id, s.enrollment_id);
    }
  }

  /* 4. Opens. open_count is maintained by a trigger on email_message_opens,
        so a single read of the message row is enough. */
  const openedEnrollments = new Set<string>();
  const messageIds = [...messageToEnrollment.keys()];
  for (let i = 0; i < messageIds.length; i += 200) {
    const slice = messageIds.slice(i, i + 200);
    const { data } = await supabaseServer
      .from("email_messages")
      .select("id, open_count")
      .in("id", slice)
      .gt("open_count", 0);
    for (const m of (data ?? []) as Array<{ id: string }>) {
      const eid = messageToEnrollment.get(m.id);
      if (eid) openedEnrollments.add(eid);
    }
  }

  /* 5. Replies. Threads are keyed by customer, so map customer → enrollments,
        then look for inbound mail after the enrollment date. */
  const repliedEnrollments = new Set<string>();
  const byCustomer = new Map<string, typeof enrollments>();
  for (const e of enrollments) {
    const key = `${e.customer_type}:${e.customer_ref}`;
    const arr = byCustomer.get(key) ?? [];
    arr.push(e);
    byCustomer.set(key, arr);
  }

  const refs = [...new Set(enrollments.map((e) => e.customer_ref))];
  const threadToCustomer = new Map<string, string>();
  for (let i = 0; i < refs.length; i += 200) {
    const slice = refs.slice(i, i + 200);
    const { data } = await supabaseServer
      .from("email_threads")
      .select("id, customer_type, customer_ref")
      .in("customer_ref", slice);
    for (const t of (data ?? []) as Array<{
      id: string;
      customer_type: string;
      customer_ref: string;
    }>) {
      threadToCustomer.set(t.id, `${t.customer_type}:${t.customer_ref}`);
    }
  }

  const threadIds = [...threadToCustomer.keys()];
  for (let i = 0; i < threadIds.length; i += 200) {
    const slice = threadIds.slice(i, i + 200);
    const { data } = await supabaseServer
      .from("email_messages")
      .select("thread_id, sent_at")
      .in("thread_id", slice)
      .eq("direction", "received");
    for (const m of (data ?? []) as Array<{ thread_id: string; sent_at: string }>) {
      const custKey = threadToCustomer.get(m.thread_id);
      if (!custKey) continue;
      const received = new Date(m.sent_at).getTime();
      // A reply only counts if it landed after we enrolled them — older
      // correspondence isn't a response to this campaign.
      for (const e of byCustomer.get(custKey) ?? []) {
        if (received > new Date(e.enrolled_at).getTime()) repliedEnrollments.add(e.id);
      }
    }
  }

  /* 6. Bucket each enrollment, then roll up per cohort. */
  function outcomeOf(e: (typeof enrollments)[number]): Outcome {
    if (e.status === "unsubscribed") return "unsubscribed";
    const reason = e.exit_reason ?? "";
    if (reason === "Placed an order" || reason === "Customer is active again") {
      return "won_back";
    }
    if (repliedEnrollments.has(e.id) || reason === "Customer replied") return "replied";
    if (openedEnrollments.has(e.id)) return "opened_no_action";
    return "no_action";
  }

  const cohorts = new Map<string, CohortRow>();
  for (const e of enrollments) {
    // Test and live batches can share a cohort number, so the mode is part
    // of the grouping key — never merge a rehearsal into real results.
    const key = `${e.automation_id}:${e.cohort_number}:${e.is_test ? "t" : "l"}`;
    const row =
      cohorts.get(key) ??
      ({
        key,
        automationId: e.automation_id,
        automationName: autoNames.get(e.automation_id) ?? "Unknown automation",
        label: e.cohort_label ?? `Cohort ${e.cohort_number}`,
        number: e.cohort_number,
        firstReleasedAt: e.enrolled_at,
        size: 0,
        sent: 0,
        opened: 0,
        replied: 0,
        wonBack: 0,
        unsubscribed: 0,
        noAction: 0,
        stillActive: 0,
        isTest: e.is_test,
      } satisfies CohortRow);

    row.size++;
    row.sent += sentByEnrollment.get(e.id) ?? 0;
    if (openedEnrollments.has(e.id)) row.opened++;
    if (e.status === "enrolled") row.stillActive++;
    if (e.enrolled_at < (row.firstReleasedAt ?? e.enrolled_at)) {
      row.firstReleasedAt = e.enrolled_at;
    }

    switch (outcomeOf(e)) {
      case "won_back":
        row.wonBack++;
        break;
      case "replied":
        row.replied++;
        break;
      case "unsubscribed":
        row.unsubscribed++;
        break;
      case "opened_no_action":
      case "no_action":
        row.noAction++;
        break;
    }

    cohorts.set(key, row);
  }

  const list = [...cohorts.values()].sort(
    (a, b) =>
      (b.firstReleasedAt ?? "").localeCompare(a.firstReleasedAt ?? "") ||
      b.number - a.number,
  );

  return NextResponse.json({
    cohorts: list,
    automations: autoIds.map((id) => ({ id, name: autoNames.get(id) ?? "Unknown" })),
    truncated: enrollments.length >= MAX_ENROLLMENTS,
  });
}
