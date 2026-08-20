import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { normalizeEmail } from "@/lib/email/unsubscribe";

export const runtime = "nodejs";

/** D2C storefront accounts in Fishbowl — the same trio the D2C order hooks use
 *  to find a person's orders, since D2C rows are keyed by person, not account. */
const D2C_CUSTOMER_IDS = ["12345", "12483", "13704"];

/** How long after a send an order still counts as "followed the email". Past
 *  this the link is too weak to be worth showing as attribution. */
const ATTRIBUTION_WINDOW_DAYS = 90;

/** No order in this long before a send = the account was cold when we mailed
 *  it, so an order after it reads as a reactivation rather than routine repeat. */
const LAPSED_DAYS = 180;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type CampaignSend = {
  id: string;
  /** 'bulk' = a designed-template blast, 'automation' = a sequence step. */
  kind: "bulk" | "automation";
  campaign: string;
  subject: string;
  /** Automation steps only: which step of the sequence this was. */
  stepOrder: number | null;
  isTest: boolean;
  status: string;
  sentAt: string | null;
  errorText: string | null;
  openedAt: string | null;
  openCount: number;
  clickedAt: string | null;
  clickCount: number;
  /** Opt-out/bounce recorded for this address after the send went out. */
  suppression: { source: string; at: string; reason: string | null } | null;
  /** First order placed after the send, inside the attribution window. */
  order: {
    ref: string;
    date: string;
    total: number | null;
    daysAfter: number;
    /** The account had gone quiet before the send, then ordered after it. */
    reactivated: boolean;
  } | null;
};

type OrderRow = {
  id: number | string;
  num: string | null;
  dateissued: string | null;
  datecompleted: string | null;
  totalprice: number | null;
};

/**
 * GET /api/email/customer-campaigns?type=wholesale|d2c&ref=<customer id>
 *
 * Every campaign email this customer received — bulk blasts and automation
 * steps alike — with what happened next: opens, clicks, opt-outs, and the
 * first order that followed.
 *
 * Runs with the service role because the source tables are RLS-scoped per
 * mailbox/admin, and the customer page needs the whole company's sends, not
 * just the signed-in rep's.
 *
 * The order link is timing, not proof of causation: it's the first order after
 * the send inside the window, and two sends close together will both point at
 * the same order. The UI says so.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "d2c" ? "d2c" : "wholesale";
  const ref = (url.searchParams.get("ref") ?? "").trim();
  if (!ref) return NextResponse.json({ error: "Missing ref" }, { status: 400 });

  const sends: CampaignSend[] = [];
  const messageIds: string[] = [];
  const addresses = new Set<string>();

  /* ── 1. Bulk sends (designed-template blasts) ───────────────────────────── */

  const { data: recipientRows } = await supabaseServer
    .from("email_send_job_recipients")
    .select(
      "id, job_id, status, message_id, customer_email, personalized_subject, sent_at, error_text",
    )
    .eq("customer_type", type)
    .eq("customer_ref", ref)
    .limit(500);

  type Recipient = {
    id: string;
    job_id: string;
    status: string;
    message_id: string | null;
    customer_email: string | null;
    personalized_subject: string | null;
    sent_at: string | null;
    error_text: string | null;
  };
  const recipients = (recipientRows as Recipient[] | null) ?? [];

  const jobIds = [...new Set(recipients.map((r) => r.job_id))];
  type Job = {
    id: string;
    created_at: string;
    subject_template: string | null;
    block_template_id?: string | null;
    test_email?: string | null;
  };
  const jobs = new Map<string, Job>();

  if (jobIds.length > 0) {
    // block_template_id / test_email arrived in later migrations; fall back to
    // the base columns so this endpoint works on a database without them.
    let jobRows: Job[] | null = null;
    const full = await supabaseServer
      .from("email_send_jobs")
      .select("id, created_at, subject_template, block_template_id, test_email")
      .in("id", jobIds);
    if (full.error) {
      const base = await supabaseServer
        .from("email_send_jobs")
        .select("id, created_at, subject_template")
        .in("id", jobIds);
      jobRows = (base.data as Job[] | null) ?? [];
    } else {
      jobRows = (full.data as Job[] | null) ?? [];
    }
    for (const j of jobRows) jobs.set(j.id, j);
  }

  // Campaign names come from the designed template, so a row reads
  // "Sassy Holiday Prebook" rather than whatever the subject line was.
  const tplIds = [...new Set([...jobs.values()].map((j) => j.block_template_id).filter(Boolean))] as string[];
  const tplNames = new Map<string, string>();
  if (tplIds.length > 0) {
    const { data } = await supabaseServer
      .from("email_templates")
      .select("id, name")
      .in("id", tplIds);
    for (const t of ((data as Array<{ id: string; name: string }> | null) ?? [])) {
      tplNames.set(t.id, t.name);
    }
  }

  for (const r of recipients) {
    const job = jobs.get(r.job_id);
    const subject = r.personalized_subject || job?.subject_template || "(no subject)";
    if (r.message_id) messageIds.push(r.message_id);
    if (r.customer_email) addAddress(addresses, r.customer_email);
    sends.push({
      id: `bulk:${r.id}`,
      kind: "bulk",
      campaign:
        (job?.block_template_id ? tplNames.get(job.block_template_id) : null) ??
        (job?.subject_template ?? subject).slice(0, 80),
      subject: subject.slice(0, 160),
      stepOrder: null,
      isTest: !!job?.test_email,
      status: r.status,
      sentAt: r.sent_at ?? job?.created_at ?? null,
      errorText: r.error_text,
      openedAt: null,
      openCount: 0,
      clickedAt: null,
      clickCount: 0,
      suppression: null,
      order: null,
      // message id is carried separately below
    });
    // Keep the message id alongside the send for the metrics pass.
    (sends[sends.length - 1] as CampaignSend & { messageId?: string | null }).messageId =
      r.message_id;
  }

  /* ── 2. Automation steps ────────────────────────────────────────────────── */

  const { data: enrollRows } = await supabaseServer
    .from("automation_enrollments")
    .select("id, automation_id, customer_email")
    .eq("customer_type", type)
    .eq("customer_ref", ref)
    .limit(200);

  type Enrollment = { id: string; automation_id: string; customer_email: string | null };
  const enrollments = (enrollRows as Enrollment[] | null) ?? [];

  if (enrollments.length > 0) {
    for (const e of enrollments) {
      if (e.customer_email) addAddress(addresses, e.customer_email);
    }

    const autoNames = new Map<string, string>();
    const { data: autoRows } = await supabaseServer
      .from("automations")
      .select("id, name")
      .in("id", [...new Set(enrollments.map((e) => e.automation_id))]);
    for (const a of ((autoRows as Array<{ id: string; name: string }> | null) ?? [])) {
      autoNames.set(a.id, a.name);
    }

    const { data: stepSendRows } = await supabaseServer
      .from("automation_step_sends")
      .select("id, enrollment_id, step_id, step_order, message_id, status, error_text, sent_at")
      .in("enrollment_id", enrollments.map((e) => e.id))
      .limit(500);

    type StepSend = {
      id: string;
      enrollment_id: string;
      step_id: string;
      step_order: number;
      message_id: string | null;
      status: string;
      error_text: string | null;
      sent_at: string | null;
    };
    const stepSends = (stepSendRows as StepSend[] | null) ?? [];

    // Step → template name, so a row names the email, not just "Step 2".
    const stepTemplates = new Map<string, string>();
    if (stepSends.length > 0) {
      const { data: stepRows } = await supabaseServer
        .from("automation_steps")
        .select("id, template_id")
        .in("id", [...new Set(stepSends.map((s) => s.step_id))]);
      const steps = (stepRows as Array<{ id: string; template_id: string | null }> | null) ?? [];
      const templateIds = [...new Set(steps.map((s) => s.template_id).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (templateIds.length > 0) {
        const { data: tplRows } = await supabaseServer
          .from("user_email_templates")
          .select("id, name")
          .in("id", templateIds);
        for (const t of ((tplRows as Array<{ id: string; name: string }> | null) ?? [])) {
          names.set(t.id, t.name);
        }
      }
      for (const s of steps) {
        const name = s.template_id ? names.get(s.template_id) : null;
        if (name) stepTemplates.set(s.id, name);
      }
    }

    const byEnrollment = new Map(enrollments.map((e) => [e.id, e]));

    for (const s of stepSends) {
      const enrollment = byEnrollment.get(s.enrollment_id);
      const automation = enrollment ? autoNames.get(enrollment.automation_id) : null;
      if (s.message_id) messageIds.push(s.message_id);
      sends.push({
        id: `auto:${s.id}`,
        kind: "automation",
        campaign: automation ?? "Automation",
        subject: stepTemplates.get(s.step_id) ?? `Step ${s.step_order}`,
        stepOrder: s.step_order,
        isTest: false,
        status: s.status,
        sentAt: s.sent_at,
        errorText: s.error_text,
        openedAt: null,
        openCount: 0,
        clickedAt: null,
        clickCount: 0,
        suppression: null,
        order: null,
      });
      (sends[sends.length - 1] as CampaignSend & { messageId?: string | null }).messageId =
        s.message_id;
    }
  }

  if (sends.length === 0) {
    return NextResponse.json({ sends: [], summary: emptySummary(), windowDays: ATTRIBUTION_WINDOW_DAYS });
  }

  /* ── 3. Open / click metrics for the messages those sends produced ──────── */

  type MessageMetrics = {
    openCount: number;
    firstOpenedAt: string | null;
    clickCount: number;
    firstClickedAt: string | null;
    subject: string | null;
    sentAt: string | null;
  };
  const metrics = new Map<string, MessageMetrics>();

  for (let i = 0; i < messageIds.length; i += 200) {
    const slice = messageIds.slice(i, i + 200);

    const { data: msgRows } = await supabaseServer
      .from("email_messages")
      .select("id, subject, sent_at, open_count, first_opened_at, link_click_count")
      .in("id", slice);
    for (const m of ((msgRows as Array<{
      id: string;
      subject: string | null;
      sent_at: string | null;
      open_count: number | null;
      first_opened_at: string | null;
      link_click_count: number | null;
    }> | null) ?? [])) {
      metrics.set(m.id, {
        openCount: m.open_count ?? 0,
        firstOpenedAt: m.first_opened_at,
        clickCount: m.link_click_count ?? 0,
        firstClickedAt: null,
        subject: m.subject,
        sentAt: m.sent_at,
      });
    }

    // Click timing lives on the per-link rows; the earliest one is the click.
    const { data: linkRows } = await supabaseServer
      .from("email_message_links")
      .select("message_id, click_count, first_clicked_at")
      .in("message_id", slice)
      .gt("click_count", 0);
    for (const l of ((linkRows as Array<{
      message_id: string;
      click_count: number | null;
      first_clicked_at: string | null;
    }> | null) ?? [])) {
      const entry = metrics.get(l.message_id);
      if (!entry || !l.first_clicked_at) continue;
      if (!entry.firstClickedAt || l.first_clicked_at < entry.firstClickedAt) {
        entry.firstClickedAt = l.first_clicked_at;
      }
    }
  }

  /* ── 4. Suppression events for this customer's addresses ────────────────── */

  type Suppression = { source: string; created_at: string; reason: string | null };
  const suppressions: Suppression[] = [];
  if (addresses.size > 0) {
    const { data: unsubRows } = await supabaseServer
      .from("email_unsubscribes")
      .select("email, source, created_at, reason")
      .in("email", [...addresses])
      .limit(50);
    for (const u of ((unsubRows as Array<{
      email: string;
      source: string;
      created_at: string;
      reason: string | null;
    }> | null) ?? [])) {
      suppressions.push({ source: u.source, created_at: u.created_at, reason: u.reason });
    }
  }
  // The address set carries both spellings, but a suppression logged against
  // a different capitalization would still slip past `in`; the customer-scoped
  // lookup catches anything the webhook attributed to the account itself.
  const { data: scopedUnsub } = await supabaseServer
    .from("email_unsubscribes")
    .select("email, source, created_at, reason")
    .eq("customer_type", type)
    .eq("customer_ref", ref)
    .limit(50);
  for (const u of ((scopedUnsub as Array<{
    source: string;
    created_at: string;
    reason: string | null;
  }> | null) ?? [])) {
    if (!suppressions.some((s) => s.source === u.source && s.created_at === u.created_at)) {
      suppressions.push({ source: u.source, created_at: u.created_at, reason: u.reason });
    }
  }

  /* ── 5. Orders, for "what happened after the email" ─────────────────────── */

  const orders = await loadOrders(type, ref);
  // Ascending by order date, so the first match after a send is the next order.
  const orderDates = orders
    .map((o) => ({
      ref: o.num ? String(o.num) : `#${o.id}`,
      date: o.dateissued ?? o.datecompleted,
      total: o.totalprice == null ? null : Number(o.totalprice),
    }))
    .filter((o): o is { ref: string; date: string; total: number | null } => !!o.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  /* ── 6. Stitch it together ─────────────────────────────────────────────── */

  for (const send of sends) {
    const messageId = (send as CampaignSend & { messageId?: string | null }).messageId ?? null;
    const m = messageId ? metrics.get(messageId) : null;

    if (!send.sentAt && m?.sentAt) send.sentAt = m.sentAt;
    if (m) {
      send.openCount = m.openCount;
      send.openedAt = m.firstOpenedAt;
      send.clickCount = m.clickCount;
      send.clickedAt = m.firstClickedAt;
    }

    if (!send.sentAt) continue;
    const sentMs = Date.parse(send.sentAt);
    if (Number.isNaN(sentMs)) continue;

    // Only opt-outs recorded after this send belong to it.
    const after = suppressions
      .filter((s) => Date.parse(s.created_at) >= sentMs)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    if (after) {
      send.suppression = { source: after.source, at: after.created_at, reason: after.reason };
    }

    const nextOrder = orderDates.find((o) => Date.parse(o.date) >= sentMs);
    if (nextOrder) {
      const daysAfter = Math.round((Date.parse(nextOrder.date) - sentMs) / MS_PER_DAY);
      if (daysAfter <= ATTRIBUTION_WINDOW_DAYS) {
        // Was the account already quiet when we mailed it?
        const previous = [...orderDates]
          .reverse()
          .find((o) => Date.parse(o.date) < sentMs);
        const gapDays = previous
          ? Math.round((sentMs - Date.parse(previous.date)) / MS_PER_DAY)
          : Infinity;
        send.order = {
          ref: nextOrder.ref,
          date: nextOrder.date,
          total: nextOrder.total,
          daysAfter,
          reactivated: gapDays >= LAPSED_DAYS,
        };
      }
    }
  }

  // Strip the internal message id before it goes over the wire.
  for (const send of sends) {
    delete (send as CampaignSend & { messageId?: string | null }).messageId;
  }

  sends.sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));

  return NextResponse.json({
    sends,
    summary: summarize(sends),
    windowDays: ATTRIBUTION_WINDOW_DAYS,
  });
}

/* ─── Helpers ─── */

/** `email_unsubscribes` is unique on lower(email) but stores the original
 *  spelling, and PostgREST's `in` is case-sensitive — so match on both. */
function addAddress(set: Set<string>, email: string) {
  set.add(email);
  set.add(normalizeEmail(email));
}

function emptySummary() {
  return {
    sent: 0,
    opened: 0,
    clicked: 0,
    failed: 0,
    ordersAfter: 0,
    revenueAfter: 0,
    medianDaysToOrder: null as number | null,
    suppressed: null as { source: string; at: string } | null,
  };
}

function summarize(sends: CampaignSend[]) {
  const delivered = sends.filter((s) => s.status === "sent");
  const opened = delivered.filter((s) => !!s.openedAt);
  const clicked = delivered.filter((s) => !!s.clickedAt);

  // Count each order once, however many sends preceded it.
  const seenOrders = new Map<string, number | null>();
  const daysToOrder: number[] = [];
  for (const s of delivered) {
    if (!s.order) continue;
    daysToOrder.push(s.order.daysAfter);
    if (!seenOrders.has(s.order.ref)) seenOrders.set(s.order.ref, s.order.total);
  }

  const revenue = [...seenOrders.values()].reduce((sum: number, t) => sum + (t ?? 0), 0);
  daysToOrder.sort((a, b) => a - b);
  const median = daysToOrder.length
    ? daysToOrder[Math.floor((daysToOrder.length - 1) / 2)]
    : null;

  const suppression = sends.find((s) => s.suppression)?.suppression ?? null;

  return {
    sent: delivered.length,
    opened: opened.length,
    clicked: clicked.length,
    failed: sends.filter((s) => s.status === "failed").length,
    ordersAfter: seenOrders.size,
    revenueAfter: revenue,
    medianDaysToOrder: median,
    suppressed: suppression ? { source: suppression.source, at: suppression.at } : null,
  };
}

/** This customer's orders. D2C rows are keyed by person, so they're found the
 *  same way the D2C order hooks find them: storefront accounts + email/name. */
async function loadOrders(type: "wholesale" | "d2c", ref: string): Promise<OrderRow[]> {
  const cols = "id, num, dateissued, datecompleted, totalprice";
  const query =
    type === "d2c"
      ? supabaseServer
          .from("sales_orders_raw")
          .select(cols)
          .in("customerid", D2C_CUSTOMER_IDS)
          .or(`email.eq.${ref},billtoname.eq.${ref}`)
      : supabaseServer.from("sales_orders_raw").select(cols).eq("customerid", ref);

  const { data } = await query.limit(1000);
  return (data as OrderRow[] | null) ?? [];
}
