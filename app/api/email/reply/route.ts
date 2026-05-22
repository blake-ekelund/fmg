import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAuthUser } from "@/lib/email/server-auth";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import { sendReply, type ReplyAttachment } from "@/lib/email/reply";

export const runtime = "nodejs";
export const maxDuration = 60;

// Combined raw-byte cap across all attachments in a single reply. Graph's
// inline /attachments POST has a per-request limit around 3MB; with base64
// overhead we keep raw bytes under this to fit the JSON envelope.
const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;

type IncomingAttachment = {
  name?: string;
  contentType?: string;
  /** Either raw base64 or a "data:<mime>;base64,<raw>" data URL. */
  contentBytes?: string;
};

type ReplyRequest = {
  thread_id?: string;
  body?: string;
  attachments?: IncomingAttachment[];
};

/**
 * POST /api/email/reply
 * Replies to an existing email thread. Uses the most-recent message in the
 * thread as the reply target so Graph preserves the conversationId.
 */
export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: ReplyRequest;
  try {
    body = (await request.json()) as ReplyRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const threadId = body.thread_id?.trim();
  const replyBody = body.body ?? "";
  if (!threadId) {
    return NextResponse.json({ error: "thread_id is required" }, { status: 400 });
  }
  if (!replyBody.trim()) {
    return NextResponse.json({ error: "Reply body is required" }, { status: 400 });
  }

  // Normalize + size-check attachments.
  const cleaned: ReplyAttachment[] = [];
  let totalBytes = 0;
  for (const att of body.attachments ?? []) {
    const name = (att.name ?? "").trim();
    const raw = (att.contentBytes ?? "").replace(/^data:[^,]*,/, "");
    if (!name || !raw) continue;
    // base64 → bytes ratio is roughly 3:4
    totalBytes += Math.floor((raw.length * 3) / 4);
    cleaned.push({
      name,
      contentType: att.contentType || "application/octet-stream",
      contentBytes: raw,
    });
  }
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return NextResponse.json(
      {
        error: `Attachments exceed 3 MB total. Total: ${(totalBytes / 1024 / 1024).toFixed(1)} MB.`,
      },
      { status: 413 },
    );
  }

  // Get sender token + account.
  let accessToken: string;
  let accountId: string;
  let senderEmail: string;
  let senderName: string | null;
  try {
    const t = await getAccessTokenForUser(user.id);
    accessToken = t.accessToken;
    accountId = t.account.id;
    senderEmail = t.account.email;
    senderName = t.account.display_name;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  // Load thread, verify it belongs to this user's mailbox.
  const { data: thread, error: tErr } = await supabaseServer
    .from("email_threads")
    .select("id, account_id, conversation_id, subject, customer_type, customer_ref, customer_name")
    .eq("id", threadId)
    .maybeSingle();
  if (tErr || !thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  if (thread.account_id !== accountId) {
    return NextResponse.json({ error: "Not your thread" }, { status: 403 });
  }

  // Pick the reply target: the most-recent message in the thread. Graph's
  // /createReply automatically sets To/Subject/conversationId based on this.
  const { data: target } = await supabaseServer
    .from("email_messages")
    .select("graph_message_id, direction, sent_at, received_at")
    .eq("thread_id", thread.id)
    .order("received_at", { ascending: false, nullsFirst: false })
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!target?.graph_message_id) {
    return NextResponse.json(
      { error: "Thread has no message to reply to" },
      { status: 400 },
    );
  }

  // Send via Graph.
  let result;
  try {
    result = await sendReply(accessToken, target.graph_message_id, replyBody, cleaned);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  // Record locally. The thread already exists; the trigger will bump
  // message_count + last_message_at automatically.
  const { data: msg, error: insertErr } = await supabaseServer
    .from("email_messages")
    .insert({
      thread_id: thread.id,
      account_id: accountId,
      direction: "sent",
      graph_message_id: result.graphMessageId,
      internet_message_id: result.internetMessageId,
      conversation_id: result.conversationId,
      from_address: senderEmail,
      from_name: senderName,
      to_addresses: [],
      subject: result.subject ?? (thread.subject ? `Re: ${thread.subject}` : null),
      body_text: replyBody,
      body_preview: result.bodyPreview ?? replyBody.slice(0, 200),
      has_attachments: cleaned.length > 0,
      sent_at: result.sentAt,
    })
    .select("id")
    .single();

  if (insertErr) {
    // The reply went out on Graph, but we failed to record it locally. Don't
    // pretend it failed — return success with a soft warning.
    return NextResponse.json({
      ok: true,
      warning: `Sent on Outlook but couldn't log locally: ${insertErr.message}`,
    });
  }

  return NextResponse.json({ ok: true, message_id: msg.id });
}
