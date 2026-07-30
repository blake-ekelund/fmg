import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import { renderBlocksToEmailHtml } from "@/lib/email/renderBlocks";
import { renderRawHtmlEmail } from "@/lib/email/rawHtml";
import { renderTextEmail } from "@/lib/email/renderText";
import { sendEmail } from "@/lib/email/send";
import { applyMergeFields, currentQuarterLabel, daysSince, type MergeVars } from "@/lib/email/send";
import { splitContactName } from "@/lib/email/mergeFields";
import type { EmailBlock } from "@/components/templates/types";

export const runtime = "nodejs";

/**
 * Real merge values for a chosen customer, read from the same contact views the
 * live send uses — so a test shows how the merge fields actually resolve for
 * that account. Data only; the email still goes to the tester's typed address.
 */
async function loadCustomerVars(
  customerType: "wholesale" | "d2c",
  customerRef: string,
): Promise<Partial<MergeVars> | null> {
  const view = customerType === "d2c" ? "d2c_customer_contact" : "customer_contact_summary";
  const refCol = customerType === "d2c" ? "person_key" : "customerid";
  const { data } = await supabaseServer
    .from(view)
    .select(`${refCol}, customer_name, billto_city, billto_state, primary_channel, lifetime_revenue, order_count, last_order_date`)
    .eq(refCol, customerRef)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  const name = (r.customer_name as string | null) ?? null;
  const { firstName, lastName } = splitContactName(name, customerType);
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const lastOrder = (r.last_order_date as string | null) ?? null;
  return {
    firstName,
    lastName,
    customerName: name,
    city: (r.billto_city as string | null) ?? null,
    state: (r.billto_state as string | null) ?? null,
    channel: (r.primary_channel as string | null) ?? null,
    lifetimeRevenue: num(r.lifetime_revenue),
    lifetimeOrders: num(r.order_count),
    lastOrderDate: lastOrder,
    daysSinceLastOrder: daysSince(lastOrder),
  };
}

/**
 * Sample merge values so a test email shows realistic content instead of raw
 * {{tokens}}. A real send substitutes per-recipient values; this is the same
 * set the on-screen preview uses so "test" and "preview" agree.
 */
const SAMPLE = {
  firstName: "Alex",
  lastName: "Rivera",
  customerName: "Acme Goods Co.",
  city: "Sacramento",
  state: "California",
  channel: "GIFT",
  lifetimeRevenue: 12450,
  lifetimeOrders: 5,
  lastOrderDate: new Date().toISOString(),
  daysSinceLastOrder: 124,
  senderName: "Your Name",
  senderFirstName: "Your",
  senderEmail: "you@fragrance-marketing-group.com",
  currentYear: String(new Date().getFullYear()),
  currentQuarter: currentQuarterLabel(),
  unsubscribeUrl: "#",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/email/block-templates/{id}/test
 * Body: { to: string }
 *
 * Sends one copy of the template to an arbitrary address through the caller's
 * own connected mailbox — a "what does this actually look like in an inbox"
 * check. It deliberately skips the bulk-send machinery (jobs, tracking pixels,
 * suppression list): a test is not a campaign, so it must never touch send
 * history or a customer's unsubscribe state.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  let toAddress = "";
  let customerType: "wholesale" | "d2c" | undefined;
  let customerRef: string | undefined;
  try {
    const parsed = (await request.json()) as {
      to?: string;
      customer_type?: "wholesale" | "d2c";
      customer_ref?: string;
    };
    toAddress = (parsed.to ?? "").trim();
    if ((parsed.customer_type === "wholesale" || parsed.customer_type === "d2c") && parsed.customer_ref) {
      customerType = parsed.customer_type;
      customerRef = parsed.customer_ref;
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!EMAIL_RE.test(toAddress)) {
    return NextResponse.json({ error: "Enter a valid email address to send the test to." }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("email_templates")
    .select("name, subject, preview_text, source, blocks, raw_html, text_body")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const previewText = (data.preview_text as string | null) ?? undefined;

  let html: string;
  if (data.source === "html") {
    const rawHtml = (data.raw_html as string | null) ?? "";
    if (!rawHtml.trim()) {
      return NextResponse.json({ error: `Template "${data.name}" has no HTML content yet.` }, { status: 400 });
    }
    html = renderRawHtmlEmail(rawHtml, { previewText });
  } else if (data.source === "text") {
    const textBody = (data.text_body as string | null) ?? "";
    if (!textBody.trim()) {
      return NextResponse.json({ error: `Template "${data.name}" has no content yet.` }, { status: 400 });
    }
    html = renderTextEmail(textBody, { previewText });
  } else {
    const blocks = (data.blocks ?? []) as EmailBlock[];
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return NextResponse.json({ error: `Template "${data.name}" has no content yet.` }, { status: 400 });
    }
    html = renderBlocksToEmailHtml(blocks, { previewText });
  }

  // Merge values: a chosen customer's real data (so the tester sees how the
  // fields resolve), falling back to sample values for anything missing.
  let vars: MergeVars = SAMPLE;
  let usedCustomer: string | null = null;
  if (customerType && customerRef) {
    const cust = await loadCustomerVars(customerType, customerRef);
    if (cust) {
      vars = { ...SAMPLE, ...cust };
      usedCustomer = cust.customerName ?? null;
    }
  }

  const subject = `[Test] ${(data.subject as string | null)?.trim() || data.name || "Untitled template"}`;
  const body = applyMergeFields(html, vars);

  // Send through the caller's own mailbox.
  let accessToken: string;
  try {
    const t = await getAccessTokenForUser(user.id);
    accessToken = t.accessToken;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not access your mailbox. Connect Outlook first." },
      { status: 400 },
    );
  }

  try {
    await sendEmail(accessToken, {
      subject,
      bodyHtml: body,
      to: [{ address: toAddress }],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Send failed." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sentTo: toAddress, usedCustomer });
}
