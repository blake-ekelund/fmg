import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import {
  helpAssistantConfigured,
  streamHelpAnswer,
  type HelpChatMessage,
} from "@/lib/assistant/helpAgent";
import type { UserRole } from "@/components/UserContext";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/help/assistant — one turn of the in-app Help chat.
 *
 * Body: { messages: { role, content }[], pathname: string }
 * Returns: text/plain stream of the reply.
 *
 * Internal staff only. The role comes from the session (never the body) and
 * decides which pages' guide entries the assistant is given.
 */

const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!helpAssistantConfigured()) {
    return new Response(
      "Sage isn't switched on yet (the server is missing its AI key). Ask Blake to enable it.",
      { headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { messages?: unknown; pathname?: unknown };
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamHelpAnswer(user.access as UserRole, pathname, messages)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (e) {
        console.error("[help/assistant]", e);
        controller.enqueue(encoder.encode("\n\nSorry — the assistant hit a snag. Please try again in a moment."));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
