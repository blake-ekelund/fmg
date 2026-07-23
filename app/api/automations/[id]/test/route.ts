import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import {
  applyMergeFields,
  sendEmail,
  firstNameOf,
  currentQuarterLabel,
  type MergeVars,
} from "@/lib/email/send";
import { buildTrackedHtmlBody } from "@/lib/email/tracking";
import { publicOriginFromRequest } from "@/lib/email/origin";
import {
  isSuppressed,
  unsubscribeUrl,
  unsubscribeFooterHtml,
} from "@/lib/email/unsubscribe";

export const runtime = "nodejs";

type TestBody = {
  email?: string;
  /** Optional real customer to borrow merge-field values from. */
  customerType?: "d2c" | "wholesale";
  customerRef?: string;
};

/** Fallback when no customer is chosen — every merge field still populated. */
const SAMPLE = {
  firstName: "Alex",
  customerName: "Sample Customer Co.",
  city: "Minneapolis",
  state: "MN",
  channel: "GIFT",
  lifetimeRevenue: 12450,
  lifetimeOrders: 18,
  lastOrderDate: "2026-01-15",
  daysSinceLastOrder: 189,
};

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/**
 * Merge-field values for a real customer, read from the same views the cron
 * runner uses — so a test renders with exactly the data a live send would.
 *
 * Note this returns DATA ONLY. The customer's own email address is never read
 * here and never used as a recipient: a test always goes to the address typed
 * into the test field.
 */
async function loadCustomerVars(
  customerType: "d2c" | "wholesale",
  customerRef: string,
): Promise<{ vars: Partial<MergeVars>; name: string | null } | null> {
  const view =
    customerType === "d2c" ? "d2c_customer_contact" : "customer_contact_summary";
  const refColumn = customerType === "d2c" ? "person_key" : "customerid";

  const { data } = await supabaseServer
    .from(view)
    .select(
      `${refColumn}, customer_name, billto_city, billto_state, primary_channel, lifetime_revenue, order_count, last_order_date`,
    )
    .eq(refColumn, customerRef)
    .maybeSingle();
  if (!data) return null;

  const r = data as Record<string, unknown>;
  const name = (r.customer_name as string | null) ?? null;
  const lastOrder = (r.last_order_date as string | null) ?? null;

  return {
    name,
    vars: {
      firstName: firstNameOf(name),
      customerName: name,
      city: (r.billto_city as string | null) ?? null,
      state: (r.billto_state as string | null) ?? null,
      channel: (r.primary_channel as string | null) ?? null,
      lifetimeRevenue: numOrNull(r.lifetime_revenue),
      lifetimeOrders: numOrNull(r.order_count),
      lastOrderDate: lastOrder,
      daysSinceLastOrder: daysSince(lastOrder),
    },
  };
}

/**
 * POST /api/automations/:id/test  { email, customerType?, customerRef? }
 *
 * Sends every step of the sequence to one address, immediately, ignoring the
 * waits between them — the point is to read the emails, not to re-live the
 * schedule. Subjects are prefixed [TEST n/N] so the inbox stays legible.
 *
 * Deliberately writes NOTHING: no enrollment, no automation_step_sends, no
 * email_threads row. A test must not show up in the automation's history or
 * skew its stats, and it must never mark a real customer as already-emailed.
 *
 * Sends from the signed-in user's connected mailbox (not the automation's
 * configured sender), so you are always testing with a mailbox you control.
 */
/**
 * DELETE /api/automations/:id/test — wipe this automation's TEST enrollments.
 *
 * Rehearsals are meant to be repeatable, and enrollment dedup means a customer
 * used in one test is skipped by the next. Clearing lets the same audience be
 * run again from scratch.
 *
 * Scoped to is_test = true, so live enrollments and real sending history can
 * never be touched by this.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const { data, error } = await supabaseServer
    .from("automation_enrollments")
    .delete()
    .eq("automation_id", id)
    .eq("is_test", true)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cleared: (data ?? []).length });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  let body: TestBody;
  try {
    body = (await request.json()) as TestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid test email address is required" }, { status: 400 });
  }

  /* The suppression list is absolute — it applies to test sends too. If it
     didn't, "test it on yourself" would be the one way to mail an address
     that has explicitly opted out. */
  if (await isSuppressed(email)) {
    return NextResponse.json(
      {
        error: `${email} has unsubscribed, so we can't send there. Use a different address, or remove it from the suppression list first.`,
      },
      { status: 400 },
    );
  }

  const { data: autoRow, error: autoErr } = await supabaseServer
    .from("automations")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (autoErr) return NextResponse.json({ error: autoErr.message }, { status: 500 });
  if (!autoRow) return NextResponse.json({ error: "Automation not found" }, { status: 404 });

  const { data: stepRows, error: stepErr } = await supabaseServer
    .from("automation_steps")
    .select("id, step_order, template_id, delay_days")
    .eq("automation_id", id)
    .order("step_order", { ascending: true });
  if (stepErr) return NextResponse.json({ error: stepErr.message }, { status: 500 });

  const steps = (stepRows ?? []) as Array<{
    id: string;
    step_order: number;
    template_id: string | null;
    delay_days: number;
  }>;
  const sendable = steps.filter((s) => s.template_id);

  if (sendable.length === 0) {
    return NextResponse.json(
      { error: "Nothing to test — no step has an email yet." },
      { status: 400 },
    );
  }

  const { data: tplRows, error: tplErr } = await supabaseServer
    .from("user_email_templates")
    .select("id, name, subject, body")
    .in("id", sendable.map((s) => s.template_id as string));
  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });

  const templates = new Map(
    ((tplRows ?? []) as Array<{ id: string; name: string; subject: string; body: string }>).map(
      (t) => [t.id, t],
    ),
  );

  let accessToken: string;
  let senderEmail: string;
  let senderDisplay: string | null;
  try {
    const t = await getAccessTokenForUser(user.id);
    accessToken = t.accessToken;
    senderEmail = t.account.email;
    senderDisplay = t.account.display_name;
  } catch (e) {
    return NextResponse.json(
      {
        error: `Connect your email account before sending a test (${
          e instanceof Error ? e.message : String(e)
        })`,
      },
      { status: 400 },
    );
  }

  /* Borrow merge values from a real customer when one was chosen, so you can
     see how the fields actually flow. Falls back to SAMPLE if the customer
     can't be found, rather than sending a mail full of blanks. */
  let customerVars: Partial<MergeVars> = SAMPLE;
  let usedCustomer: string | null = null;
  if (body.customerRef && body.customerType) {
    const loaded = await loadCustomerVars(body.customerType, body.customerRef);
    if (loaded) {
      customerVars = loaded.vars;
      usedCustomer = loaded.name ?? body.customerRef;
    }
  }

  const origin = publicOriginFromRequest(request);
  const vars: MergeVars = {
    ...customerVars,
    senderName: senderDisplay,
    senderFirstName: firstNameOf(senderDisplay),
    senderEmail,
    currentYear: String(new Date().getFullYear()),
    currentQuarter: currentQuarterLabel(),
  };

  const results: Array<{ step: number; template: string; ok: boolean; error?: string }> = [];

  for (let i = 0; i < sendable.length; i++) {
    const step = sendable[i];
    const tpl = templates.get(step.template_id as string);
    if (!tpl) {
      results.push({ step: step.step_order, template: "(missing)", ok: false, error: "Template not found" });
      continue;
    }

    const subject = `[TEST ${i + 1}/${sendable.length}] ${applyMergeFields(tpl.subject, vars)}`;
    const bodyText = applyMergeFields(tpl.body, vars);
    // A tracked body keeps the test visually identical to a real send; the
    // messageId is random and unrecorded, so opens land nowhere.
    const tracked = buildTrackedHtmlBody({
      plainText: bodyText,
      origin,
      messageId: randomUUID(),
    });

    /* Include the same unsubscribe footer a real send carries, so the test
       shows the whole email. The token is minted for the TEST address, so
       clicking it opts out the tester — never the customer whose data was
       borrowed for the merge fields. */
    const bodyHtml =
      tracked.html +
      unsubscribeFooterHtml(unsubscribeUrl(origin, { email, automationId: id }));

    try {
      await sendEmail(accessToken, {
        subject,
        bodyHtml,
        to: [{ address: email }],
      });
      results.push({ step: step.step_order, template: tpl.name, ok: true });
    } catch (e) {
      results.push({
        step: step.step_order,
        template: tpl.name,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const skippedNoTemplate = steps.length - sendable.length;

  return NextResponse.json({
    sent,
    total: sendable.length,
    skippedNoTemplate,
    to: email,
    /** Whose data filled the merge fields; null = the built-in sample. */
    usedCustomer,
    results,
  });
}
