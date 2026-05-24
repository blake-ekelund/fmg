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

type TriggerType = "status_change" | "order_event" | "date" | "manual";
type AudienceConfig = "d2c" | "wholesale" | "both";
type Recurring = "none" | "weekly" | "monthly" | "quarterly" | "annually";

type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type: TriggerType;
  trigger_config: {
    audience?: AudienceConfig;
    // status_change
    status_target?: "at_risk" | "churned";
    lookback_days?: number;
    // order_event
    order_event_type?: "first" | "last";
    days_after?: number;
    // date
    scheduled_at?: string; // YYYY-MM-DD
    recurring?: Recurring;
    // filters (shared)
    min_spend?: number;
    channel?: string;
    state?: string;
    status_filter?: "active" | "at_risk" | "churned";
  };
  sender_user_id: string | null;
};

const STATUS_DAYS = { at_risk: 180, churned: 365 } as const;

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

  /* ── 1) Load automations + their steps ──
     In dry mode include disabled automations too so the UI's "Preview
     eligible" button shows real numbers before the user enables. */
  let autosQuery = supabaseServer
    .from("automations")
    .select("id, name, enabled, trigger_type, trigger_config, sender_user_id");
  if (!dry) autosQuery = autosQuery.eq("enabled", true);
  const { data: autos } = await autosQuery;
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
  // In dry mode, accumulate a sample of who would be enrolled so the UI
  // can show the user the actual customer list, not just a count.
  const sampleCandidates: Array<{
    customer_type: AudienceSide;
    customer_ref: string;
    name: string | null;
    email: string | null;
    last_order_date: string | null;
    lifetime_revenue: number | null;
    warning: string | null;
  }> = [];
  let invalidEmailCount = 0;
  let suspectEmailCount = 0;
  const SAMPLE_CAP = 100;
  for (const a of automations) {
    const steps = stepsByAutomation.get(a.id) ?? [];
    // In live mode, skip automations with no steps configured — there'd be
    // nothing to send. In dry mode we still compute candidates so the UI can
    // preview enrollment counts before steps are added.
    if (!dry && steps.length === 0) continue;
    if (a.trigger_type === "manual") continue; // manual = only enrolled by hand

    const candidates = await findTriggerCandidates(a, { dry });
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

    const eligible = candidates.filter(
      (c) => !enrolledSet.has(c.customer_ref) && !!c.email,
    );
    if (eligible.length === 0) continue;

    if (!dry) {
      // Live mode: cap at MAX_NEW_ENROLLMENTS_PER_AUTOMATION so cron stays bounded.
      const toEnroll = eligible.slice(0, MAX_NEW_ENROLLMENTS_PER_AUTOMATION);
      const rows = toEnroll.map((c) => ({
        automation_id: a.id,
        customer_type: c.audience_side,
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
      // Dry mode: count the full eligible set + tally email-quality issues
      // across the whole pool, but only sample the first N for the panel.
      totalEnrolled += eligible.length;
      for (const c of eligible) {
        const f = flagEmail(c.email);
        if (!f.ok) invalidEmailCount++;
        else if (f.warning) suspectEmailCount++;
        if (sampleCandidates.length >= SAMPLE_CAP) continue;
        sampleCandidates.push({
          customer_type: c.audience_side,
          customer_ref: c.customer_ref,
          name: c.customer_name,
          email: c.email,
          last_order_date: c.last_order_date,
          lifetime_revenue: c.lifetime_revenue,
          warning: f.warning ?? null,
        });
      }
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
      invalid_emails: invalidEmailCount,
      suspect_emails: suspectEmailCount,
      due_now: due.length,
      sample_due: due.slice(0, 10),
      sample_candidates: sampleCandidates,
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

/**
 * Lightweight quality check on a customer email. Returns a warning the UI
 * can render. None of these block sends — the user just sees a chip so they
 * can fix the data or exclude problematic recipients before enabling.
 */
function flagEmail(email: string | null): { ok: boolean; warning?: string } {
  const e = (email ?? "").trim();
  if (!e) return { ok: false, warning: "Missing" };

  // Stricter than the casual regex: at least one char before @, a domain
  // with a dot, no whitespace, no consecutive dots.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || /\.\./.test(e)) {
    return { ok: false, warning: "Invalid format" };
  }

  const lower = e.toLowerCase();
  const domain = lower.split("@")[1];
  const local = lower.split("@")[0];

  // Common domain typos — list isn't exhaustive but catches the obvious ones.
  const TYPOS: Record<string, string> = {
    "gmial.com": "gmail.com",
    "gmai.com": "gmail.com",
    "gmal.com": "gmail.com",
    "gnail.com": "gmail.com",
    "gmail.co": "gmail.com",
    "gmail.cm": "gmail.com",
    "yahooo.com": "yahoo.com",
    "yaho.com": "yahoo.com",
    "yahho.com": "yahoo.com",
    "yahoo.co": "yahoo.com",
    "hotmial.com": "hotmail.com",
    "hotmai.com": "hotmail.com",
    "hotamil.com": "hotmail.com",
    "outloook.com": "outlook.com",
    "outlok.com": "outlook.com",
    "outllook.com": "outlook.com",
    "aol.co": "aol.com",
  };
  if (TYPOS[domain]) {
    return { ok: false, warning: `Possible typo — did you mean ${TYPOS[domain]}?` };
  }

  // Role-based / shared mailboxes — deliverable, but worth surfacing for B2B.
  const ROLE_BASED = new Set([
    "info", "sales", "support", "admin", "contact", "hello",
    "noreply", "no-reply", "donotreply",
    "marketing", "office", "orders", "billing", "accounts", "service", "team", "help",
  ]);
  if (ROLE_BASED.has(local)) {
    return { ok: true, warning: "Role-based address" };
  }

  return { ok: true };
}

/* ── Trigger candidate query ─────────────────────────────────────────────── */

type AudienceSide = "d2c" | "wholesale";

function viewFor(side: AudienceSide): { view: string; refColumn: string } {
  return side === "d2c"
    ? { view: "d2c_customer_contact", refColumn: "person_key" }
    : { view: "customer_contact_summary", refColumn: "customerid" };
}

async function findTriggerCandidates(
  automation: Automation,
  options: { dry?: boolean } = {},
): Promise<Array<ContactRow & { audience_side: AudienceSide }>> {
  const t = automation.trigger_type;
  const dry = options.dry === true;
  const cfg = automation.trigger_config ?? {};
  if (t === "manual") return [];

  const audience: AudienceConfig = cfg.audience ?? "d2c";
  const sides: AudienceSide[] = audience === "both" ? ["d2c", "wholesale"] : [audience];
  // In dry mode, query up to 5,000 rows so the preview count reflects the
  // real eligible pool, not the per-run enrollment cap.
  const queryLimit = dry ? 5000 : MAX_NEW_ENROLLMENTS_PER_AUTOMATION * 2;

  /* Helper: apply the shared filters (min_spend / channel / state) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (q: any) => {
    let out = q.not("email", "is", null);
    if ((cfg.min_spend ?? 0) > 0) out = out.gte("lifetime_revenue", cfg.min_spend);
    if (cfg.channel) out = out.eq("primary_channel", cfg.channel);
    if (cfg.state) out = out.eq("billto_state", cfg.state);
    return out;
  };

  /* ── status_change: customer is in at_risk / churned status ──────────── */
  // Default behavior: catch every customer past the threshold. Dedup via
  // automation_enrollments ensures no one's emailed twice. lookback_days > 0
  // narrows to only customers who crossed within the last N days (useful for
  // ongoing automations once the backlog is drained).
  if (t === "status_change") {
    const target = cfg.status_target ?? "at_risk";
    const days = STATUS_DAYS[target];
    const lookback = cfg.lookback_days ?? 0;
    const crossingDate = new Date();
    crossingDate.setDate(crossingDate.getDate() - days);
    const out: Array<ContactRow & { audience_side: AudienceSide }> = [];
    for (const side of sides) {
      const rows = await runContactQuery(
        side,
        (q) => {
          let out2 = applyFilters(q).lte(
            "last_order_date",
            crossingDate.toISOString().slice(0, 10),
          );
          if (lookback > 0) {
            const oldest = new Date(crossingDate);
            oldest.setDate(oldest.getDate() - lookback);
            out2 = out2.gte("last_order_date", oldest.toISOString().slice(0, 10));
          }
          return out2;
        },
        queryLimit,
      );
      out.push(...rows);
    }
    return out;
  }

  /* ── order_event: N days after first or last order ──────────────────── */
  if (t === "order_event") {
    const subtype = cfg.order_event_type ?? "first";
    const daysAfter = cfg.days_after ?? 7;
    const lookback = cfg.lookback_days ?? 30;
    const target = new Date();
    target.setDate(target.getDate() - daysAfter);
    const oldest = new Date(target);
    oldest.setDate(oldest.getDate() - lookback);
    const column = subtype === "first" ? "first_order_date" : "last_order_date";
    const out: Array<ContactRow & { audience_side: AudienceSide }> = [];
    for (const side of sides) {
      const rows = await runContactQuery(
        side,
        (q) =>
          applyFilters(q)
            .gte(column, oldest.toISOString().slice(0, 10))
            .lte(column, target.toISOString().slice(0, 10)),
        queryLimit,
      );
      out.push(...rows);
    }
    return out;
  }

  /* ── date: one-shot or recurring blast ──────────────────────────────── */
  if (t === "date") {
    if (!cfg.scheduled_at) return [];
    const scheduled = new Date(cfg.scheduled_at + "T00:00:00Z");
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const recurring: Recurring = cfg.recurring ?? "none";

    // In live mode, gate on whether the trigger should fire today + we
    // haven't fired this cycle. In dry mode (preview), skip both checks so
    // the user sees how many would be enrolled if the date hit right now.
    if (!dry) {
      const { shouldFire, cycleStart } = computeDateFire(scheduled, today, recurring);
      if (!shouldFire) return [];
      const { count } = await supabaseServer
        .from("automation_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("automation_id", automation.id)
        .gte("enrolled_at", cycleStart.toISOString());
      if ((count ?? 0) > 0) return [];
    }

    // Apply status filter for date triggers: Active = ordered <180d, At Risk
    // 180–365d, Churned = 365d+. Same cutoffs the customer list uses.
    const status = cfg.status_filter;
    const activeCutoff = new Date();
    activeCutoff.setDate(activeCutoff.getDate() - 180);
    const riskCutoff = new Date();
    riskCutoff.setDate(riskCutoff.getDate() - 365);

    const out: Array<ContactRow & { audience_side: AudienceSide }> = [];
    for (const side of sides) {
      const rows = await runContactQuery(
        side,
        (q) => {
          let out2 = applyFilters(q);
          if (status === "active") {
            out2 = out2.gte("last_order_date", activeCutoff.toISOString().slice(0, 10));
          } else if (status === "at_risk") {
            out2 = out2
              .lt("last_order_date", activeCutoff.toISOString().slice(0, 10))
              .gte("last_order_date", riskCutoff.toISOString().slice(0, 10));
          } else if (status === "churned") {
            out2 = out2.lt("last_order_date", riskCutoff.toISOString().slice(0, 10));
          }
          return out2;
        },
        queryLimit,
      );
      out.push(...rows);
    }
    return out;
  }

  return [];
}

/**
 * Given the user-picked scheduled_at and the recurrence rule, decide whether
 * the trigger should fire today and what the current cycle's start date is.
 * cycleStart is used to dedup against past enrollments — anything before it
 * belonged to a prior cycle.
 */
function computeDateFire(
  scheduled: Date,
  today: Date,
  recurring: Recurring,
): { shouldFire: boolean; cycleStart: Date } {
  if (recurring === "none") {
    // One-shot: fire within a 7-day grace window starting on the scheduled date.
    const grace = new Date(scheduled);
    grace.setUTCDate(grace.getUTCDate() + 7);
    return {
      shouldFire: today >= scheduled && today <= grace,
      cycleStart: scheduled,
    };
  }

  if (recurring === "weekly") {
    // Fire on the same weekday as scheduled_at every week.
    const targetWeekday = scheduled.getUTCDay();
    const shouldFire = today.getUTCDay() === targetWeekday && today >= scheduled;
    const cycleStart = new Date(today);
    cycleStart.setUTCHours(0, 0, 0, 0);
    cycleStart.setUTCDate(today.getUTCDate() - 6); // last 7 days
    return { shouldFire, cycleStart };
  }

  if (recurring === "monthly") {
    // Fire on the same day-of-month as scheduled_at every month.
    const targetDay = scheduled.getUTCDate();
    const shouldFire = today.getUTCDate() === targetDay && today >= scheduled;
    const cycleStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { shouldFire, cycleStart };
  }

  if (recurring === "quarterly") {
    // Fire on the same day-of-month as scheduled_at every 3 months from the
    // scheduled month onward (Jan->Apr->Jul->Oct if scheduled in Jan).
    const targetDay = scheduled.getUTCDate();
    if (today.getUTCDate() !== targetDay || today < scheduled) {
      return { shouldFire: false, cycleStart: scheduled };
    }
    const monthsSinceStart =
      (today.getUTCFullYear() - scheduled.getUTCFullYear()) * 12 +
      (today.getUTCMonth() - scheduled.getUTCMonth());
    const shouldFire = monthsSinceStart >= 0 && monthsSinceStart % 3 === 0;
    const cycleStart = new Date(today);
    cycleStart.setUTCMonth(today.getUTCMonth() - 2, 1);
    cycleStart.setUTCHours(0, 0, 0, 0);
    return { shouldFire, cycleStart };
  }

  if (recurring === "annually") {
    const shouldFire =
      today.getUTCMonth() === scheduled.getUTCMonth() &&
      today.getUTCDate() === scheduled.getUTCDate() &&
      today >= scheduled;
    const cycleStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    return { shouldFire, cycleStart };
  }

  return { shouldFire: false, cycleStart: today };
}

// The supabase-js generic parameters change at every .select / .filter call,
// which makes a typed callback signature painful. The build() callback can
// return any chainable filter builder — what matters is that it implements
// .limit() at the end. Using `any` here is local and contained.
type AnyQuery = { limit: (n: number) => Promise<{ data: unknown }> } & Record<
  string,
  unknown
>;

async function runContactQuery(
  side: AudienceSide,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (q: any) => any,
  limit: number = MAX_NEW_ENROLLMENTS_PER_AUTOMATION * 2,
): Promise<Array<ContactRow & { audience_side: AudienceSide }>> {
  const { view, refColumn } = viewFor(side);
  const base = supabaseServer
    .from(view)
    .select(
      `${refColumn}, customer_name, email, billto_city, billto_state, primary_channel, lifetime_revenue, order_count, last_order_date, first_order_date`,
    );
  const filtered = build(base) as AnyQuery;
  const { data } = await filtered.limit(limit);
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
    audience_side: side,
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
