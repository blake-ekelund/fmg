import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import {
  helpAssistantConfigured,
  streamHelpAnswer,
  type HelpChatMessage,
  type HelpEvent,
} from "@/lib/assistant/helpAgent";
import type { UserRole } from "@/components/UserContext";

export const runtime = "nodejs";
// Creating drafts calls the AI generators (up to ~2 min for a blog post).
export const maxDuration = 300;

/**
 * POST /api/help/assistant — one turn of Sage, the in-app assistant.
 *
 * Body: { messages: { role, content }[], pathname: string, conversationId?: string,
 *         attachments?: { name, text }[] }
 * Returns: NDJSON stream of HelpEvent — {t:"text"|"status", v} and
 * {t:"action", label, href} for each draft Sage creates.
 *
 * Internal staff only. The role comes from the session (never the body) and
 * decides which guide entries and tools Sage gets. Tools that call our own API
 * routes forward the user's token, so they act exactly as the user.
 */

const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;

/* Files the user attached in this chat (resent each turn — they're never saved
   with the conversation). Text only; Sage's tools read them by name. */
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_CHARS = 1_500_000;

function readAttachments(raw: unknown): { name: string; text: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (a): a is { name: string; text: string } =>
        !!a && typeof a === "object" && typeof (a as { name?: unknown }).name === "string" && typeof (a as { text?: unknown }).text === "string",
    )
    .slice(-MAX_ATTACHMENTS)
    .map((a) => ({ name: a.name.slice(0, 200), text: a.text.slice(0, MAX_ATTACHMENT_CHARS) }));
}

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!helpAssistantConfigured()) {
    const off: HelpEvent = { t: "text", v: "Sage isn't switched on yet (the server is missing its AI key). Ask Blake to enable it." };
    return new Response(JSON.stringify(off) + "\n", { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
  }

  const body = (await request.json().catch(() => ({}))) as {
    messages?: unknown;
    pathname?: unknown;
    conversationId?: unknown;
    attachments?: unknown;
  };
  const pathname =
    typeof body.pathname === "string" && body.pathname.startsWith("/") ? body.pathname.slice(0, 200) : "/dashboard";
  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: HelpChatMessage[] = raw
    .filter(
      (m): m is HelpChatMessage =>
        !!m &&
        typeof m === "object" &&
        ((m as HelpChatMessage).role === "user" || (m as HelpChatMessage).role === "assistant") &&
        typeof (m as HelpChatMessage).content === "string",
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  // The API needs the conversation to open on a user turn.
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Send at least one message ending with a user turn." }, { status: 400 });
  }

  const ctx = {
    role: user.access as UserRole,
    userId: user.id,
    origin: new URL(request.url).origin,
    authorization: request.headers.get("authorization") ?? "",
    conversationId: typeof body.conversationId === "string" ? body.conversationId : null,
    attachments: readAttachments(body.attachments),
  };
  const encoder = new TextEncoder();
  const send = (e: HelpEvent) => encoder.encode(JSON.stringify(e) + "\n");
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamHelpAnswer(ctx, pathname, messages)) {
          controller.enqueue(send(event));
        }
      } catch (e) {
        console.error("[help/assistant]", e);
        controller.enqueue(send({ t: "text", v: "\n\nSorry — I hit a snag. Please try again in a moment." }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
