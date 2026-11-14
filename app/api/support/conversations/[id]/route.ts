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
  action?: "reply" | "note" | "status" | "claim" | "check_resolved";
  text?: string;
  status?: "bot" | "needs_human" | "human" | "closed";
};

function tableMissing(message: string): boolean {
  // Deliberately narrow. "does not exist" on its own also fires for a missing
  // COLUMN, and reporting that as "run the migration" sends someone to re-run
  // a migration that already ran while the real cause — a column added to the
  // file after it was applied — stays invisible. Match the relation, not the
  // phrase.
  return (
    /relation \"?[a-z_.]*support_(conversations|messages)\"? does not exist/i.test(
      message
    ) || /schema cache/i.test(message)
  );
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

  // `attachments` arrives with migration 20261114030000; until it's applied
  // the thread still loads, just without photos.
  const BASE_COLS = "id, role, content, author_name, tools, created_at, seq";
  const loadMessages = (cols: string) =>
    supabaseServer
      .from("support_messages")
      .select(cols)
      .eq("conversation_id", id)
      .order("seq", { ascending: true })
      .limit(500)
      .returns<Array<Record<string, unknown> & { attachments?: unknown }>>();
  // `kind` arrives with migration 20261114060000, `attachments` with 20261114030000.
  let { data: messages, error: msgErr } = await loadMessages(`${BASE_COLS}, attachments, kind`);
  if (msgErr) ({ data: messages, error: msgErr } = await loadMessages(`${BASE_COLS}, attachments`));
  if (msgErr) ({ data: messages } = await loadMessages(BASE_COLS));

  // Customer photos sit in a private bucket. Hand the browser signed links
  // that expire, rather than ever making the bucket public.
  type Att = { path: string; name?: string; type?: string; size?: number };
  const paths = (messages ?? []).flatMap((m) =>
    Array.isArray((m as { attachments?: Att[] }).attachments)
      ? ((m as { attachments: Att[] }).attachments.map((a) => a.path).filter(Boolean) as string[])
      : [],
  );
  const signed: Record<string, string> = {};
  if (paths.length) {
    const { data: urls } = await supabaseServer.storage
      .from("support-attachments")
      .createSignedUrls(paths, 60 * 60);
    for (const u of urls ?? []) {
      if (u.path && u.signedUrl) signed[u.path] = u.signedUrl;
    }
  }
  const withPhotos = (messages ?? []).map((m) => {
    const atts = (m as { attachments?: Att[] }).attachments;
    return {
      ...m,
      attachments: Array.isArray(atts)
        ? atts.map((a) => ({ ...a, url: signed[a.path] ?? null }))
        : null,
    };
  });

  // Opening the thread is what "read" means here — there's no separate
  // acknowledge step, and an agent who opened it has seen it.
  if (conversation.agent_unread) {
    await supabaseServer
      .from("support_conversations")
      .update({ agent_unread: false })
      .eq("id", id);
  }

  // The rest of this shopper's history. Tickets roll over deliberately (a
  // closed thread, a long gap, a thread that got too long), which keeps each
  // one readable — but it also means the ticket in front of you may be the
  // second half of a story. Without this an agent answers a follow-up having
  // never seen the original complaint.
  //
  // Matched three ways, widest first: the same browser session, the same
  // account, or the same checkout email. A signed-in shopper who switched
  // laptops still lines up; an anonymous one at least lines up per browser.
  // These become a PostgREST filter STRING, where a comma or a paren in a
  // value would break out of the expression — so only shapes that can't are
  // interpolated. Ids are uuids; the email is checked against a conservative
  // pattern and simply dropped if it doesn't match, which costs a little
  // matching breadth and no correctness.
  const UUID = /^[0-9a-f-]{36}$/i;
  const SAFE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  const match: string[] = [];
  if (UUID.test(String(conversation.session_key ?? ""))) {
    match.push(`session_key.eq.${conversation.session_key}`);
  }
  if (UUID.test(String(conversation.profile_id ?? ""))) {
    match.push(`profile_id.eq.${conversation.profile_id}`);
  }
  if (SAFE_EMAIL.test(String(conversation.email ?? ""))) {
    match.push(`email.eq.${conversation.email}`);
  }

  // Nothing safe to match on (no uuid session key, no account, no usable
  // email) means no history rather than an unfiltered list of everyone's.
  const related = match.length
    ? (
        await supabaseServer
          .from("support_conversations")
          .select("id, subject, status, message_count, last_message_at, entry_preset")
          .eq("store", conversation.store)
          .neq("id", id)
          .or(match.join(","))
          .order("last_message_at", { ascending: false })
          .limit(10)
      ).data
    : [];

  return NextResponse.json({
    conversation: { ...conversation, agent_unread: false },
    messages: withPhotos,
    related: related ?? [],
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

  if (action === "check_resolved") {
    // "Has this been resolved?" A message the customer sees like any reply,
    // but marked so their chat shows Yes / No buttons under it. Asking it
    // takes the thread, and makes the asker the rep the survey rates.
    const name = await agentName(user.id);
    const text =
      String(body.text ?? "").trim().slice(0, 500) ||
      "Has everything been resolved for you? Just let me know below.";
    const row = {
      conversation_id: id,
      role: "agent",
      content: text,
      author_id: user.id,
      author_name: name,
    };
    let { error: insErr } = await supabaseServer
      .from("support_messages")
      .insert({ ...row, kind: "resolution_check" });
    let buttons = true;
    if (insErr) {
      // Before the migration: still ask, the customer just types the answer.
      ({ error: insErr } = await supabaseServer.from("support_messages").insert(row));
      buttons = false;
    }
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    await supabaseServer
      .from("support_conversations")
      .update({
        status: "human",
        assigned_to: user.id,
        agent_unread: false,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", id);
    await supabaseServer
      .from("support_conversations")
      .update({ csat_agent_id: user.id, customer_resolved: null })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "human", buttons });
  }

  if (action === "claim") {
    await supabaseServer
      .from("support_conversations")
      .update({ status: "human", assigned_to: user.id, agent_unread: false })
      .eq("id", id);
    // Taking a resolved ticket back un-resolves it (separate: pre-migration safe).
    await supabaseServer
      .from("support_conversations")
      .update({ resolved_at: null, resolved_by: null, resolution: null })
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

    // Who resolved it and when (migration 20261114050000). This drives the
    // board → Archive move 12h later, so it's set on close and cleared on any
    // other move. Its own update, so an unmigrated database still changes status.
    await supabaseServer
      .from("support_conversations")
      .update(
        next === "closed"
          ? {
              resolved_at: new Date().toISOString(),
              resolved_by: "agent",
              resolution: String(body.text ?? "").trim().slice(0, 300) || null,
            }
          : { resolved_at: null, resolved_by: null, resolution: null },
      )
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
  await supabaseServer
    .from("support_conversations")
    .update({ resolved_at: null, resolved_by: null, resolution: null })
    .eq("id", id);

  return NextResponse.json({ ok: true, status: "human", authorName: name });
}
