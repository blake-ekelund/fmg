import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import { fetchMessage } from "@/lib/email/subscriptions";

export const runtime = "nodejs";
// Graph requires a response within 10s; we exceed that comfortably by
// short-circuiting on validation and offloading heavy work to async path.
export const maxDuration = 30;

type GraphNotification = {
  subscriptionId: string;
  clientState?: string;
  changeType: string;
  resource?: string;
  resourceData?: {
    id?: string;
    "@odata.id"?: string;
  };
};

/**
 * POST /api/email/webhook
 *
 * Handles two flavors of request from Microsoft Graph:
 *
 *   1. SUBSCRIPTION VALIDATION (one-time, when we create/renew a subscription).
 *      Graph POSTs with ?validationToken=… in the query string. We must
 *      respond within 10s with the bare token as text/plain.
 *
 *   2. CHANGE NOTIFICATIONS. Graph POSTs a JSON envelope listing one or more
 *      events. Each event has the resource path of a new message and the
 *      clientState we set when subscribing. We validate clientState, fetch the
 *      message body, and thread it into our DB.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let body: { value?: GraphNotification[] };
  try {
    body = (await request.json()) as { value?: GraphNotification[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = body.value ?? [];
  if (events.length === 0) {
    return NextResponse.json({ ok: true });
  }

  // Best-effort processing. We ACK 200 even when individual events fail so
  // Graph doesn't retry them indefinitely.
  await Promise.all(events.map(processEvent));
  return NextResponse.json({ ok: true });
}

// GET is also used by Graph for the validation step in some flows.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ ok: true });
}

async function processEvent(evt: GraphNotification): Promise<void> {
  try {
    // 1) Resolve subscriptionId -> account row + verify clientState.
    const { data: account, error: acctErr } = await supabaseServer
      .from("user_email_accounts")
      .select("id, user_id, email, subscription_id, subscription_client_state, status")
      .eq("subscription_id", evt.subscriptionId)
      .maybeSingle();
    if (acctErr || !account) return; // Unknown subscription — drop silently
    if (account.status === "disconnected") return;
    if (
      !account.subscription_client_state ||
      account.subscription_client_state !== evt.clientState
    ) {
      // clientState mismatch — could be a spoofed POST. Drop.
      return;
    }

    // 2) Extract message id from resourceData (preferred) or resource path.
    const messageId =
      evt.resourceData?.id ??
      (evt.resource ? evt.resource.split("/").pop() : undefined);
    if (!messageId) return;

    // 3) Mint a fresh access token for this user.
    let accessToken: string;
    try {
      const t = await getAccessTokenForUser(account.user_id);
      accessToken = t.accessToken;
    } catch {
      // Token refresh failed; getAccessTokenForUser marked the account.
      return;
    }

    // 4) Fetch the full message body.
    let msg;
    try {
      msg = await fetchMessage(accessToken, messageId);
    } catch {
      return;
    }

    const graphId = msg.id as string;
    const conversationId = (msg.conversationId as string) || "";
    if (!conversationId) return;

    const from = (msg.from as Record<string, { address?: string; name?: string }> | undefined)
      ?.emailAddress;
    const fromAddress = from?.address ?? null;
    const fromName = from?.name ?? null;

    // Skip our own outbound copies — those land in Sent Items not Inbox so we
    // shouldn't actually see them here, but be defensive.
    if (fromAddress && fromAddress.toLowerCase() === account.email.toLowerCase()) return;

    const to = ((msg.toRecipients as Array<{ emailAddress?: { address?: string; name?: string } }>) ??
      [])
      .map((r) => ({ address: r.emailAddress?.address ?? "", name: r.emailAddress?.name ?? null }));
    const cc = ((msg.ccRecipients as Array<{ emailAddress?: { address?: string; name?: string } }>) ??
      [])
      .map((r) => ({ address: r.emailAddress?.address ?? "", name: r.emailAddress?.name ?? null }));

    // 5) Find an existing thread on (account, conversationId), or create one.
    const { data: existingThread } = await supabaseServer
      .from("email_threads")
      .select("id, customer_type, customer_ref")
      .eq("account_id", account.id)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    let threadId: string;
    if (existingThread) {
      threadId = existingThread.id as string;
    } else {
      // No existing thread — try to match the sender to a customer by email.
      const matched = fromAddress
        ? await matchCustomerByEmail(fromAddress)
        : null;
      const { data: newThread, error: tErr } = await supabaseServer
        .from("email_threads")
        .insert({
          account_id: account.id,
          customer_type: matched?.customer_type ?? null,
          customer_ref: matched?.customer_ref ?? null,
          customer_name: matched?.customer_name ?? fromName,
          conversation_id: conversationId,
          subject: (msg.subject as string) ?? null,
        })
        .select("id")
        .single();
      if (tErr || !newThread) return;
      threadId = newThread.id as string;
    }

    // 6) Insert the message (no-op if we already have it via unique index).
    const bodyObj = msg.body as { contentType?: string; content?: string } | undefined;
    const isHtml = (bodyObj?.contentType ?? "").toLowerCase() === "html";

    await supabaseServer.from("email_messages").upsert(
      {
        thread_id: threadId,
        account_id: account.id,
        direction: "received",
        graph_message_id: graphId,
        internet_message_id: (msg.internetMessageId as string) ?? null,
        conversation_id: conversationId,
        from_address: fromAddress,
        from_name: fromName,
        to_addresses: to,
        cc_addresses: cc,
        subject: (msg.subject as string) ?? null,
        body_html: isHtml ? bodyObj?.content ?? null : null,
        body_text: !isHtml ? bodyObj?.content ?? null : null,
        body_preview: (msg.bodyPreview as string) ?? null,
        has_attachments: Boolean(msg.hasAttachments),
        received_at: (msg.receivedDateTime as string) ?? new Date().toISOString(),
        sent_at: (msg.sentDateTime as string) ?? null,
        read_at: msg.isRead ? new Date().toISOString() : null,
        raw_graph_json: msg,
      },
      { onConflict: "account_id,graph_message_id" },
    );
  } catch {
    // Swallow — we don't want a single bad event to block ACKing the batch.
  }
}

type MatchedCustomer = {
  customer_type: "wholesale" | "d2c";
  customer_ref: string;
  customer_name: string | null;
};

/**
 * Look up a customer by email address across both views. Returns the first
 * match found (wholesale tried first).
 */
async function matchCustomerByEmail(email: string): Promise<MatchedCustomer | null> {
  const lower = email.trim().toLowerCase();
  if (!lower) return null;

  const { data: w } = await supabaseServer
    .from("customer_contact_summary")
    .select("customerid, customer_name")
    .ilike("email", lower)
    .limit(1);
  if (w && w.length > 0) {
    return {
      customer_type: "wholesale",
      customer_ref: (w[0] as { customerid: string }).customerid,
      customer_name: (w[0] as { customer_name: string | null }).customer_name,
    };
  }

  const { data: d } = await supabaseServer
    .from("d2c_customer_contact")
    .select("person_key, customer_name")
    .ilike("email", lower)
    .limit(1);
  if (d && d.length > 0) {
    return {
      customer_type: "d2c",
      customer_ref: (d[0] as { person_key: string }).person_key,
      customer_name: (d[0] as { customer_name: string | null }).customer_name,
    };
  }

  return null;
}
