import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * One storefront chat conversation.
 *
 *   GET  — the full transcript, including the tool calls behind each bot reply
 *          and internal notes. Opening a thread marks it read.
 *   POST — act on it. Four actions, deliberately small:
 *            reply  — a message the SHOPPER sees, in the widget, on its next
 *                     poll. Sending one also takes the conversation ('human'),
 *                     which is what silences the bot.
 *            note   — internal only. Never leaves this table. The storefront's
 *                     poll filters role='note' out and that is the only thing
 *                     keeping it internal, so do not add a delivery path here.
 *            status — hand back to the bot, or close.
 *            claim  — take the thread without saying anything yet.
 *
 * Internal-only, same guard as the rest of the portal.
 */

const MAX_REPLY = 4000;

type PostBody = {
  action?: "reply" | "note" | "status" | "claim";
  text?: string;
  status?: "bot" | "needs_human" | "human" | "closed";
};

function tableMissing(message: string): boolean {
  return /schema cache|does not exist/i.test(message);
}

async function agentName(profileId: string): Promise<string> {
  const { data } = await supabaseServer
    .from("profiles")
    .select("first_name, email")
    .eq("id", profileId)
    .maybeSingle();
  return (
    (data?.first_name as string | null)?.trim() ||
    (data?.email as string | null)?.split("@")[0] ||
    "Sassy team"
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { data: conversation, error } = await supabaseServer
    .from("support_conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: tableMissing(error.message) ? "not migrated yet" : error.message },
      { status: 500 },
    );
  }
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: messages } = await supabaseServer
    .from("support_messages")
    .select("id, role, content, author_name, tools, created_at, seq")
    .eq("conversation_id", id)
    .order("seq", { ascending: true })
    .limit(500);

  // Opening the thread is what "read" means here — there's no separate
  // acknowledge step, and an agent who opened it has seen it.
  if (conversation.agent_unread) {
    await supabaseServer
      .from("support_conversations")
      .update({ agent_unread: false })
      .eq("id", id);
  }

  return NextResponse.json({
    conversation: { ...conversation, agent_unread: false },
    messages: messages ?? [],
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as PostBody;
  const action = body.action ?? "reply";

  const { data: conversation } = await supabaseServer
    .from("support_conversations")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "claim") {
    await supabaseServer
      .from("support_conversations")
      .update({ status: "human", assigned_to: user.id, agent_unread: false })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "human" });
  }

  if (action === "status") {
    const next = body.status;
    if (!next || !["bot", "needs_human", "human", "closed"].includes(next)) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }
    await supabaseServer
      .from("support_conversations")
      .update({
        status: next,
        // Handing it back to the bot releases the thread, so the widget stops
        // showing a person's name in the header.
        ...(next === "bot" || next === "closed" ? { assigned_to: null } : {}),
      })
      .eq("id", id);

    await supabaseServer.from("support_messages").insert({
      conversation_id: id,
      role: "system",
      content:
        next === "bot"
          ? "Handed back to the concierge."
          : next === "closed"
            ? "Conversation closed."
            : `Status set to ${next}.`,
      author_id: user.id,
      author_name: await agentName(user.id),
    });

    return NextResponse.json({ ok: true, status: next });
  }

  const text = String(body.text ?? "").trim().slice(0, MAX_REPLY);
  if (!text) {
    return NextResponse.json({ error: "Nothing to send" }, { status: 400 });
  }

  const name = await agentName(user.id);
  const { error: insertErr } = await supabaseServer.from("support_messages").insert({
    conversation_id: id,
    role: action === "note" ? "note" : "agent",
    content: text,
    author_id: user.id,
    author_name: name,
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  if (action === "note") {
    // A note is bookkeeping, not activity: it must not bump the thread up the
    // inbox as though the customer had written, and it must not take it.
    return NextResponse.json({ ok: true });
  }

  // Replying IS taking the conversation. There's no world where a person
  // answers and the bot should keep talking underneath them, so this is one
  // action rather than a claim the agent has to remember.
  await supabaseServer
    .from("support_conversations")
    .update({
      status: "human",
      assigned_to: user.id,
      agent_unread: false,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, status: "human", authorName: name });
}
