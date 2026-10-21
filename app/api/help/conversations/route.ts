import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import {
  deleteConversation,
  getConversation,
  listConversations,
  saveConversation,
  type StoredMessage,
} from "@/lib/assistant/sageMemory";

export const runtime = "nodejs";

/**
 * Sage conversation history for the signed-in staff member — always their own.
 *
 * GET              → { ready, items: [{ id, title, updated_at }] }
 * GET ?id=…        → { conversation: { id, title, messages, updated_at } | null }
 * POST { id?, messages } → { id }   (create or update; id null if history isn't set up)
 * DELETE ?id=…     → { ok: true }
 *
 * `ready: false` means the sage_conversations migration hasn't been applied;
 * the widget then keeps the chat in the browser tab only.
 */

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  try {
    if (id) return NextResponse.json({ conversation: await getConversation(user.id, id) });
    return NextResponse.json(await listConversations(user.id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load history." }, { status: 500 });
  }
}

const MAX_CHARS = 20_000;

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; messages?: unknown };
  const messages: StoredMessage[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m): m is StoredMessage =>
        !!m &&
        typeof m === "object" &&
        ((m as StoredMessage).role === "user" || (m as StoredMessage).role === "assistant") &&
        typeof (m as StoredMessage).content === "string",
    )
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_CHARS),
      ...(Array.isArray(m.actions) ? { actions: m.actions.slice(0, 10) } : {}),
    }));
  if (!messages.length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  try {
    const id = await saveConversation(user.id, typeof body.id === "string" ? body.id : null, messages);
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await deleteConversation(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't delete." }, { status: 500 });
  }
}
