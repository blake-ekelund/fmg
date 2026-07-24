import { NextResponse } from "next/server";
import { resolvePortalAgency } from "@/lib/email/server-auth";
import {
  askPortalAssistant,
  portalAssistantConfigured,
  type PortalChatMessage,
} from "@/lib/assistant/portalAgent";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/portal/assistant — one turn of the rep-portal chat assistant.
 *
 * Body: { messages: { role: "user" | "assistant"; content: string }[] }
 * Returns: { reply: string }
 *
 * Agency comes from the session via resolvePortalAgency (rep profile, or a
 * previewing owner/admin) — never from the body — and every tool the assistant
 * can call is fenced to that agency, so a rep can only ever ask about their own
 * book. Read-only: the assistant looks things up, it can't act.
 */

const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;

export async function POST(request: Request) {
  const rep = await resolvePortalAgency(request);
  if (!rep) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Feature isn't wired up (no API key) — answer gracefully rather than 500.
  if (!portalAssistantConfigured()) {
    return NextResponse.json({
      reply:
        "The assistant isn't switched on yet. In the meantime, you can track orders on the Orders page and reach the team from the Contact page.",
    });
  }

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: PortalChatMessage[] = raw
    .filter(
      (m): m is PortalChatMessage =>
        !!m &&
        typeof m === "object" &&
        (m as PortalChatMessage).role !== undefined &&
        ((m as PortalChatMessage).role === "user" ||
          (m as PortalChatMessage).role === "assistant") &&
        typeof (m as PortalChatMessage).content === "string",
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "Send at least one message ending with a user turn." },
      { status: 400 },
    );
  }

  try {
    const reply = await askPortalAssistant(String(rep.agencyCode), messages);
    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[portal/assistant]", e);
    return NextResponse.json(
      { error: "The assistant hit a snag. Please try again in a moment." },
      { status: 500 },
    );
  }
}
