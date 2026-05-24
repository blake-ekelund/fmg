import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import { getAuthUser } from "@/lib/email/server-auth";
import {
  applyMergeFields,
  currentQuarterLabel,
  daysSince,
  firstNameOf,
  sendEmail,
  type MergeVars,
} from "@/lib/email/send";
import { buildTrackedHtmlBody } from "@/lib/email/tracking";

export const runtime = "nodejs";
export const maxDuration = 300;

// Caps to keep a single cron run bounded.
const MAX_NEW_ENROLLMENTS_PER_AUTOMATION = 200;
const MAX_STEP_SENDS_PER_RUN = 200;
const SEND_CONCURRENCY = 5;

type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type: "d2c_at_risk" | "wholesale_at_risk" | "manual";
  trigger_config: { days_inactive?: number; lookback_days?: number };
  sender_user_id: string | null;
};

type Step = {
  id: string;
  automation_id: string;
  step_order: number;
  template_id: string;
  delay_days: number;
};

type Template = {
  id: string;
  subject: string;
  body: string;
};

type Enrollment = {
  id: string;
  automation_id: string;
  customer_type: "wholesale" | "d2c";
  customer_ref: string;
  customer_name: string | null;
  customer_email: string | null;
  next_step_order: number | null;
};

type ContactRow = {
  customer_ref: string;
  customer_name: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  channel: string | null;
  lifetime_revenue: number | null;
  lifetime_orders: number | null;
  last_order_date: string | null;
};

/**
 * GET /api/cron/automations
 * Two-phase tick:
 *   1) For each enabled automation with an automatic trigger, find new
 *      matching customers and enroll them (set next_step=1, next_send=now).
 *   2) Process all enrollments whose next_send_at <= now: send the current
 *      step's template, advance the state machine, schedule the next step.
 *
 * Safe to invoke ad-hoc via `?dry=1` (no enrollments inserted, no sends).
 */
export async function GET(request: Request) {
  // Accept either:
  //   - Vercel cron: Authorization: Bearer <CRON_SECRET>
  //   - A signed-in portal user (so the UI's "Preview eligible" works)
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const isCronCall = !!cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isCronCall) {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";

  /* ── 1) Load enabled automations + their steps ── */
  const { data: autos } = await supabaseServer
    .from("automations")
    .select("id, name, enabled, trigger_type, trigger_config, sender_user_id")
    .eq("enabled", true);
  const automations = (autos as Automation[] | null) ?? [];

  const stepsByAutomation = new Map<string, Step[]>();
  if (automations.length > 0) {
    const { data: stepsRows } = await supabaseServer
      .from("automation_steps")
      .select("id, automation_id, step_order, template_id, delay_days")
      .in(
        "automation_id",
        automations.map((a) => a.id),
      )
      .order("step_order", { ascending: true });
    for (const s of (stepsRows as Step[] | null) ?? []) {
      const arr = stepsByAutomation.get(s.automation_id) ?? [];
      arr.push(s);
      stepsByAutomation.set(s.automation_id, arr);
    }
  }

  /* ── 2) Enroll new candidates for each automation ── */
  let totalEnrolled = 0;
  for (const a of automations) {
    const steps = stepsByAutomation.get(a.id) ?? [];
    if (steps.length === 0) continue; // skip automations with no steps configured
    if (a.trigger_type === "manual") continue; // manual = only enrolled by hand

    const candidates = await findTriggerCandidates(a);
    if (candidates.length === 0) continue;

    // Filter out anyone already enrolled in this automation.
    const refs = candidates.map((c) => c.customer_ref);
    const { data: existing } = await supabaseServer
      .from("automation_enrollments")
      .select("customer_ref")
      .eq("automation_id", a.id)
      .in("customer_ref", refs);
    const enrolledSet = new Set(
      (existing ?? []).map((r) => (r as { customer_ref: string }).customer_ref),
    );

    const toEnroll = candidates
      .filter((c) => !enrolledSet.has(c.customer_ref) && !!c.email)
      .slice(0, MAX_NEW_ENROLLMENTS_PER_AUTOMATION);
    if (toEnroll.length === 0) continue;

    if (!dry) {
      const customerType = a.trigger_type === "wholesale_at_risk" ? "wholesale" : "d2c";
      const rows = toEnroll.map((c) => ({
        automation_id: a.id,
        customer_type: customerType,
        customer_ref: c.customer_ref,
        customer_name: c.customer_name,
        customer_email: c.email,
        next_step_order: 1,
        next_send_at: new Date().toISOString(),
        status: "enrolled" as const,
      }));
      const { error } = await supabaseServer.from("automation_enrollments").insert(rows);
      if (!error) totalEnrolled += rows.length;
    } else {
      totalEnrolled += toEnroll.length;
    }
  }

  /* ── 3) Process due enrollments ── */
  const { data: dueRows } = await supabaseServer
    .from("automation_enrollments")
    .select(
      "id, automation_id, customer_type, customer_ref, customer_name, customer_email, next_step_order",
    )
    .eq("status", "enrolled")
    .lte("next_send_at", new Date().toISOString())
    .order("next_send_at", { ascending: true })
    .limit(MAX_STEP_SENDS_PER_RUN);
  const due = (dueRows as Enrollment[] | null) ?? [];

  if (dry) {
    return NextResponse.json({
      dry: true,
      automations: automations.length,
      enrolled: totalEnrolled,
      due_now: due.length,
      sample_due: due.slice(0, 10),
    });
  }

  // Load templates needed for the due step sends.
  const stepIds = new Set<string>();
  const templateIds = new Set<string>();
  const autoStepsMap = new Map<string, Step[]>(stepsByAutomation);
  for (const e of due) {
    const steps = autoStepsMap.get(e.automation_id) ?? [];
    const step = steps.find((s) => s.step_order === e.next_step_order);
    if (step) {
      stepIds.add(step.id);
      templateIds.add(step.template_id);
    }
  }
  const { data: tplRows } = await supabaseServer
    .from("user_email_templates")
    .select("id, subject, body")
    .in("id", Array.from(templateIds));
  const templates = new Map<string, Template>();
  for (const t of (tplRows as Template[] | null) ?? []) {
    templates.set(t.id, t);
  }

  // Group enrollments by sender so we mint one access token per sender.
  const enrollmentsBySender = new Map<string, Enrollment[]>();
  const autosById = new Map(automations.map((a) => [a.id, a]));
  for (const e of due) {
    const auto = autosById.get(e.automation_id);
    if (!auto) continue;
    const sender = auto.sender_user_id ?? "__fallback__";
    const arr = enrollmentsBySender.get(sender) ?? [];
    arr.push(e);
    enrollmentsBySender.set(sender, arr);
  }

  let sentCount = 0;
  let failedCount = 0;
  let completedCount = 0;

  const origin =
    (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") ||
    "https://www.fragrance-marketing-group.com";

  for (const [senderKey, batch] of enrollmentsBySender.entries()) {
    let senderUserId = senderKey === "__fallback__" ? null : senderKey;
    if (!senderUserId) {
      const { data: fb } = await supabaseServer
        .from("user_email_accounts")
        .select("user_id")
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();
      senderUserId = (fb?.user_id as string | null) ?? null;
    }
    if (!senderUserId) continue;

    let accessToken: string;
    let accountId: string;
    let senderEmail: string;
    let senderDisplay: string | null;
    try {
      const t = await getAccessTokenForUser(senderUserId);
      accessToken = t.accessToken;
      accountId = t.account.id;
      senderEmail = t.account.email;
      senderDisplay = t.account.display_name;
    } catch (e) {
      // Token failure — mark all enrollments for this sender as failed so we
      // don't loop on them forever.
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseServer
        .from("automation_enrollments")
        .update({ status: "failed", last_error: msg })
        .in("id", batch.map((x) => x.id));
      failedCount += batch.length;
      continue;
    }

    const senderVars = {
      senderName: senderDisplay,
      senderFirstName: firstNameOf(senderDisplay),
      senderEmail,
      currentYear: String(new Date().getFullYear()),
      currentQuarter: currentQuarterLabel(),
    };

    const processOne = async (e: Enrollment): Promise<void> => {
      const auto = autosById.get(e.automation_id);
      const steps = autoStepsMap.get(e.automation_id) ?? [];
      const step = steps.find((s) => s.step_order === e.next_step_order);
      if (!auto || !step) {
        // No matching step (deleted or sequence ended) — mark completed.
        await supabaseServer
          .from("automation_enrollments")
          .update({
            status: "completed",
            next_step_order: null,
            next_send_at: null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", e.id);
        completedCount++;
        return;
      }
      const tpl = templates.get(step.template_id);
      if (!tpl) {
        await supabaseServer
          .from("automation_enrollments")
          .update({ status: "failed", last_error: "Template not found" })
          .eq("id", e.id);
        await supabaseServer.from("automation_step_sends").insert({
          enrollment_id: e.id,
          step_id: step.id,
          step_order: step.step_order,
          status: "failed",
          error_text: "Template not found",
        });
        failedCount++;
        return;
      }
      if (!e.customer_email) {
        await supabaseServer
          .from("automation_enrollments")
          .update({ status: "failed", last_error: "No email" })
          .eq("id", e.id);
        await supabaseServer.from("automation_step_sends").insert({
          enrollment_id: e.id,
          step_id: step.id,
          step_order: step.step_order,
          status: "skipped",
          error_text: "No email",
        });
        failedCount++;
        return;
      }

      // Load customer details for merge fields. One row per send is fine for
      // the cron's volume — pre-batching is a follow-up if this gets slow.
      const contact = await loadContact(e.customer_type, e.customer_ref);
      const vars: MergeVars = {
        firstName: firstNameOf(contact?.customer_name ?? e.customer_name),
        customerName: contact?.customer_name ?? e.customer_name,
        city: contact?.city ?? null,
        state: contact?.state ?? null,
        channel: contact?.channel ?? null,
        lifetimeRevenue: contact?.lifetime_revenue ?? null,
        lifetimeOrders: contact?.lifetime_orders ?? null,
        lastOrderDate: contact?.last_order_date ?? null,
        daysSinceLastOrder: daysSince(contact?.last_order_date ?? null),
        ...senderVars,
      };
      const subject = applyMergeFields(tpl.subject, vars);
      const bodyText = applyMergeFields(tpl.body, vars);
      const messageId = randomUUID();
      const tracked = buildTrackedHtmlBody({
        plainText: bodyText,
        origin,
        messageId,
      });

      try {
        const sent = await sendEmail(accessToken, {
          subject,
          bodyHtml: tracked.html,
          to: [{ address: e.customer_email, name: e.customer_name ?? undefined }],
        });

        const { data: thread } = await supabaseServer
          .from("email_threads")
          .upsert(
            {
              account_id: accountId,
              customer_type: e.customer_type,
              customer_ref: e.customer_ref,
              customer_name: e.customer_name,
              conversation_id: sent.conversationId,
              subject,
              last_message_at: sent.sentAt,
              last_direction: "sent",
              last_preview: sent.bodyPreview ?? bodyText.slice(0, 200),
            },
            { onConflict: "account_id,conversation_id" },
          )
          .select("id")
          .single();
        if (!thread) throw new Error("Thread upsert failed");

        const { data: msg, error: msgErr } = await supabaseServer
          .from("email_messages")
          .insert({
            id: messageId,
            thread_id: thread.id,
            account_id: accountId,
            direction: "sent",
            graph_message_id: sent.graphMessageId,
            internet_message_id: sent.internetMessageId,
            conversation_id: sent.conversationId,
            from_address: sent.fromAddress ?? senderEmail,
            to_addresses: [{ address: e.customer_email, name: e.customer_name }],
            subject,
            body_text: bodyText,
            body_html: tracked.html,
            body_preview: sent.bodyPreview ?? bodyText.slice(0, 200),
            sent_at: sent.sentAt,
          })
          .select("id")
          .single();
        if (msgErr || !msg) throw new Error(msgErr?.message ?? "Message insert failed");

        if (tracked.links.length > 0) {
          await supabaseServer.from("email_message_links").insert(
            tracked.links.map((l) => ({
              id: l.id,
              message_id: messageId,
              link_index: l.link_index,
              original_url: l.original_url,
            })),
          );
        }

        await supabaseServer.from("automation_step_sends").insert({
          enrollment_id: e.id,
          step_id: step.id,
          step_order: step.step_order,
          message_id: msg.id,
          status: "sent",
        });

        // Advance the state machine.
        const nextStep = steps.find((s) => s.step_order === step.step_order + 1);
        if (nextStep) {
          const nextSendAt = new Date();
          nextSendAt.setDate(nextSendAt.getDate() + nextStep.delay_days);
          await supabaseServer
            .from("automation_enrollments")
            .update({
              next_step_order: nextStep.step_order,
              next_send_at: nextSendAt.toISOString(),
              last_error: null,
            })
            .eq("id", e.id);
        } else {
          await supabaseServer
            .from("automation_enrollments")
            .update({
              status: "completed",
              next_step_order: null,
              next_send_at: null,
              completed_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("id", e.id);
          completedCount++;
        }
        sentCount++;
      } catch (err) {
        const errText = err instanceof Error ? err.message : String(err);
        await supabaseServer.from("automation_step_sends").insert({
          enrollment_id: e.id,
          step_id: step.id,
          step_order: step.step_order,
          status: "failed",
          error_text: errText,
        });
        // Don't mark the enrollment as permanently failed — it'll retry on
        // the next cron tick. (A future improvement: max-retries counter.)
        await supabaseServer
          .from("automation_enrollments")
          .update({ last_error: errText })
          .eq("id", e.id);
        failedCount++;
      }
    };

    await runWithConcurrency(batch, SEND_CONCURRENCY, processOne);
  }

  return NextResponse.json({
    automations: automations.length,
    enrolled: totalEnrolled,
    due: due.length,
    sent: sentCount,
    failed: failedCount,
    completed: completedCount,
  });
}

/* ── Trigger candidate query ─────────────────────────────────────────────── */

async function findTriggerCandidates(
  automation: Automation,
): Promise<ContactRow[]> {
  if (automation.trigger_type === "manual") return [];

  const days = automation.trigger_config?.days_inactive ?? 180;
  // lookback_days is the "don't go back further than this" cap on inactivity.
  // 0 (or missing) = no cap — catch everyone past the at-risk threshold.
  const lookback = automation.trigger_config?.lookback_days ?? 0;
  const triggerDate = new Date();
  triggerDate.setDate(triggerDate.getDate() - days);

  const isD2C = automation.trigger_type === "d2c_at_risk";
  const view = isD2C ? "d2c_customer_contact" : "customer_contact_summary";
  const refColumn = isD2C ? "person_key" : "customerid";

  let query = supabaseServer
    .from(view)
    .select(
      `${refColumn}, customer_name, email, billto_city, billto_state, primary_channel, lifetime_revenue, order_count, last_order_date`,
    )
    .lt("last_order_date", triggerDate.toISOString().slice(0, 10))
    .not("email", "is", null);

  if (lookback > 0) {
    const oldestDate = new Date(triggerDate);
    oldestDate.setDate(oldestDate.getDate() - lookback);
    query = query.gte("last_order_date", oldestDate.toISOString().slice(0, 10));
  }

  const { data } = await query.limit(MAX_NEW_ENROLLMENTS_PER_AUTOMATION * 2);

  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    customer_ref: r[refColumn] as string,
    customer_name: (r.customer_name as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    city: (r.billto_city as string | null) ?? null,
    state: (r.billto_state as string | null) ?? null,
    channel: (r.primary_channel as string | null) ?? null,
    lifetime_revenue: numOrNull(r.lifetime_revenue),
    lifetime_orders: numOrNull(r.order_count),
    last_order_date: (r.last_order_date as string | null) ?? null,
  }));
}

async function loadContact(
  customerType: "wholesale" | "d2c",
  customerRef: string,
): Promise<ContactRow | null> {
  const view =
    customerType === "d2c" ? "d2c_customer_contact" : "customer_contact_summary";
  const refColumn = customerType === "d2c" ? "person_key" : "customerid";
  const { data } = await supabaseServer
    .from(view)
    .select(
      `${refColumn}, customer_name, email, billto_city, billto_state, primary_channel, lifetime_revenue, order_count, last_order_date`,
    )
    .eq(refColumn, customerRef)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    customer_ref: r[refColumn] as string,
    customer_name: (r.customer_name as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    city: (r.billto_city as string | null) ?? null,
    state: (r.billto_state as string | null) ?? null,
    channel: (r.primary_channel as string | null) ?? null,
    lifetime_revenue: numOrNull(r.lifetime_revenue),
    lifetime_orders: numOrNull(r.order_count),
    last_order_date: (r.last_order_date as string | null) ?? null,
  };
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return isFinite(n) ? n : null;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const next = async (): Promise<void> => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        await worker(items[i]);
      } catch {
        /* item-level errors are recorded by the worker */
      }
    }
  };
  const pool = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => next(),
  );
  await Promise.all(pool);
}
