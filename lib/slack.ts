import crypto from "crypto";

/**
 * Slack integration helpers for the FMG assistant.
 *
 * The bot listens for @mentions (and DMs) in the connected FMG workspace,
 * verifies each request really came from Slack (signing-secret HMAC), resolves
 * the sender's verified email, and — only for internal FMG staff — answers with
 * the Claude-powered assistant. All secrets are server-only env vars; nothing
 * here is safe to import into a client component.
 *
 * Env:
 *   SLACK_SIGNING_SECRET  — verifies inbound event requests came from Slack.
 *   SLACK_BOT_TOKEN       — xoxb- token for chat.postMessage / users.info.
 */

const SLACK_API = "https://slack.com/api";

export function slackSigningSecret(): string | null {
  return process.env.SLACK_SIGNING_SECRET?.trim() || null;
}

export function slackBotToken(): string | null {
  return process.env.SLACK_BOT_TOKEN?.trim() || null;
}

/** True when both Slack secrets are present (server-only check). */
export function slackConfigured(): boolean {
  return slackSigningSecret() !== null && slackBotToken() !== null;
}

/**
 * Verify a Slack request signature.
 *
 * Slack signs every request as `v0=HMAC_SHA256(signing_secret, "v0:" + ts +
 * ":" + rawBody)`. We recompute it over the EXACT raw body (so the route must
 * read `await request.text()`, never a re-serialized JSON object) and compare
 * in constant time. Requests older than 5 minutes are rejected to blunt replay.
 */
export function verifySlackSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
): boolean {
  const secret = slackSigningSecret();
  if (!secret || !signature || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  // Reject stale requests (5 min window), guarding against replay.
  if (Math.abs(Date.now() / 1000 - ts) > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected =
    "v0=" + crypto.createHmac("sha256", secret).update(base).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Look up the verified email for a Slack user id via users.info. Requires the
 * bot token to hold the `users:read.email` scope. Returns null on any failure
 * (missing scope, deactivated user, API error) — the caller treats "no email"
 * as "not authorized", which is the safe default.
 */
export async function getSlackUserEmail(userId: string): Promise<string | null> {
  const token = slackBotToken();
  if (!token) return null;

  try {
    const res = await fetch(`${SLACK_API}/users.info?user=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as {
      ok: boolean;
      user?: { profile?: { email?: string } };
    };
    if (!json.ok) return null;
    return json.user?.profile?.email?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Post a message to a channel (optionally threaded under `threadTs`). Returns
 * true on success. Failures are swallowed to a boolean so the events route can
 * always return 200 to Slack regardless.
 */
export async function postSlackMessage(
  channel: string,
  text: string,
  threadTs?: string,
): Promise<boolean> {
  const token = slackBotToken();
  if (!token) return false;

  try {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel,
        text,
        ...(threadTs ? { thread_ts: threadTs } : {}),
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    const json = (await res.json()) as { ok: boolean };
    return json.ok === true;
  } catch {
    return false;
  }
}

/**
 * Strip a leading bot @mention (and any others) from an app_mention text.
 * Slack sends mentions as `<@U012ABC>`; we remove them so the assistant sees
 * just the question. Collapses the resulting whitespace.
 */
export function stripMentions(text: string): string {
  return text.replace(/<@[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
