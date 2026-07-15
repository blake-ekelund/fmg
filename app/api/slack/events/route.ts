import { after, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { isInternalEmail } from "@/lib/email/server-auth";
import {
  verifySlackSignature,
  getSlackUserEmail,
  postSlackMessage,
  stripMentions,
} from "@/lib/slack";
import { askAssistant } from "@/lib/assistant/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/slack/events — Slack Events API endpoint for the FMG assistant.
 *
 * Flow:
 *   1. Verify the request is really from Slack (signing-secret HMAC over the
 *      raw body). Reject otherwise.
 *   2. Answer the one-time url_verification handshake.
 *   3. For an @mention (in a channel) or a DM, dedupe on Slack's event_id
 *      (Slack retries deliveries), ACK within Slack's 3s window, then process
 *      asynchronously via `after()`.
 *
 * Access: only FMG employees get answers. We resolve the Slack user's verified
 * email and gate on `isInternalEmail` (a profile with a non-'rep' access role).
 * Unauthorized askers get one polite reply and nothing else. The workspace
 * connection itself is the first gate — only the connected FMG workspace can
 * deliver events here at all.
 */

const UNAUTHORIZED_REPLY =
  "Sorry — this assistant is only available to FMG staff. If you think you should have access, ask an FMG admin.";
const EMPTY_REPLY =
  "Hi! Ask me about inventory/stock, sales performance, a customer, or a sales rep.";
const ERROR_REPLY =
  "Something went wrong pulling that together. Try again in a moment.";

type SlackEvent = {
  type: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
};

type SlackEnvelope = {
  type: string;
  challenge?: string;
  event_id?: string;
  team_id?: string;
  event?: SlackEvent;
};

const ok = () => NextResponse.json({ ok: true });

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-slack-signature");
  const timestamp = request.headers.get("x-slack-request-timestamp");

  if (!verifySlackSignature(raw, signature, timestamp)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: SlackEnvelope;
  try {
    body = JSON.parse(raw) as SlackEnvelope;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // Slack's one-time endpoint verification handshake.
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type !== "event_callback" || !body.event) return ok();

  const event = body.event;

  // Ignore anything the bot itself posted, and edited/deleted/system messages.
  if (event.bot_id || event.subtype) return ok();

  const isMention = event.type === "app_mention";
  const isDM = event.type === "message" && event.channel_type === "im";
  if (!isMention && !isDM) return ok();
  if (!event.channel || !event.user) return ok();

  const eventId = body.event_id ?? `${event.channel}:${event.ts}`;

  // Dedupe: Slack retries deliveries. Insert-first; a unique-violation means we
  // already handled this event, so skip. Any OTHER insert error (e.g. table not
  // migrated yet) is non-fatal — we still answer, just without the audit row.
  const { error: insErr } = await supabaseServer.from("slack_events").insert({
    slack_event_id: eventId,
    team_id: body.team_id ?? null,
    channel_id: event.channel,
    slack_user_id: event.user,
  });
  if (insErr && (insErr as { code?: string }).code === "23505") {
    return ok(); // duplicate delivery
  }
  const audited = !insErr;

  // ACK now; do the slow work (email lookup + LLM + post) after responding so
  // Slack doesn't time out and retry.
  after(() => processEvent(event, eventId, isMention, audited));

  return ok();
}

async function processEvent(
  event: SlackEvent,
  eventId: string,
  isMention: boolean,
  audited: boolean,
): Promise<void> {
  const channel = event.channel!;
  // Thread replies under channel mentions; keep DMs flat.
  const threadTs = isMention ? event.thread_ts ?? event.ts : undefined;

  const patch = async (fields: Record<string, unknown>) => {
    if (!audited) return;
    await supabaseServer.from("slack_events").update(fields).eq("slack_event_id", eventId);
  };

  try {
    const email = await getSlackUserEmail(event.user!);
    const authorized = await isInternalEmail(email);

    if (!authorized) {
      await postSlackMessage(channel, UNAUTHORIZED_REPLY, threadTs);
      await patch({ slack_email: email, authorized: false });
      return;
    }

    const question = isMention ? stripMentions(event.text ?? "") : (event.text ?? "").trim();
    if (!question) {
      await postSlackMessage(channel, EMPTY_REPLY, threadTs);
      await patch({ slack_email: email, authorized: true, question: "" });
      return;
    }

    const answer = await askAssistant(question);
    await postSlackMessage(channel, answer, threadTs);
    await patch({ slack_email: email, authorized: true, question, answer });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await postSlackMessage(channel, ERROR_REPLY, threadTs);
    await patch({ error_text: msg });
  }
}
