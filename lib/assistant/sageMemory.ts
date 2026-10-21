import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Sage's memory: each staff member's past conversations (sage_conversations,
 * migration 20261021000000). Every function takes the caller's user id and
 * scopes to it — one person never sees another's chats.
 *
 * If the migration hasn't been applied yet, reads return empty and saves are
 * skipped (`ready: false`), so Sage keeps working without history.
 */

export type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  actions?: { label: string; href?: string; download?: unknown }[];
};

export type ConversationSummary = { id: string; title: string; updated_at: string };

const TABLE = "sage_conversations";
const MAX_MESSAGES = 60;

const tableMissing = (msg?: string) => !!msg && /sage_conversations|schema cache|does not exist/i.test(msg);

function titleFrom(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.content.trim().replace(/\s+/g, " ") ?? "";
  return first ? (first.length > 70 ? first.slice(0, 67) + "…" : first) : "New conversation";
}

function searchTextFrom(messages: StoredMessage[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "Q" : "A"}: ${m.content}${m.actions?.length ? ` [${m.actions.map((a) => a.label).join("; ")}]` : ""}`)
    .join("\n")
    .toLowerCase()
    .slice(0, 50_000);
}

export async function listConversations(userId: string, limit = 50): Promise<{ ready: boolean; items: ConversationSummary[] }> {
  const { data, error } = await supabaseServer
    .from(TABLE)
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (tableMissing(error.message)) return { ready: false, items: [] };
    throw new Error(error.message);
  }
  return { ready: true, items: (data ?? []) as ConversationSummary[] };
}

export async function getConversation(userId: string, id: string) {
  const { data, error } = await supabaseServer
    .from(TABLE)
    .select("id, title, messages, updated_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error && !tableMissing(error.message)) throw new Error(error.message);
  return (data as (ConversationSummary & { messages: StoredMessage[] }) | null) ?? null;
}

/** Create (no id) or update the caller's conversation. Returns its id, or null if history isn't set up. */
export async function saveConversation(userId: string, id: string | null, raw: StoredMessage[]): Promise<string | null> {
  const messages = raw.slice(-MAX_MESSAGES);
  const row = {
    title: titleFrom(messages),
    messages,
    search_text: searchTextFrom(messages),
    updated_at: new Date().toISOString(),
  };
  const q = id
    ? supabaseServer.from(TABLE).update(row).eq("id", id).eq("user_id", userId).select("id").maybeSingle()
    : supabaseServer.from(TABLE).insert({ ...row, user_id: userId }).select("id").single();
  const { data, error } = await q;
  if (error) {
    if (tableMissing(error.message)) return null;
    throw new Error(error.message);
  }
  // An id that isn't theirs (or was deleted) updates nothing — start a new row.
  if (!data && id) return saveConversation(userId, null, raw);
  return (data as { id: string } | null)?.id ?? null;
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  const { error } = await supabaseServer.from(TABLE).delete().eq("id", id).eq("user_id", userId);
  if (error && !tableMissing(error.message)) throw new Error(error.message);
}

/**
 * Search the caller's past chats (every word must appear). Returns the matching
 * conversations with the exchanges that mention the words, for Sage to read.
 */
export async function searchConversations(userId: string, query: string, excludeId?: string | null, limit = 5) {
  const words = query.toLowerCase().split(/\s+/).map((w) => w.replace(/[%_,()]/g, "")).filter((w) => w.length > 1).slice(0, 6);
  let q = supabaseServer
    .from(TABLE)
    .select("id, title, messages, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  for (const w of words) q = q.ilike("search_text", `%${w}%`);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) {
    if (tableMissing(error.message)) return { ready: false, matches: [] };
    throw new Error(error.message);
  }
  const matches = ((data ?? []) as (ConversationSummary & { messages: StoredMessage[] })[]).map((c) => {
    // Keep the exchanges that mention a search word (plus the reply after a
    // matching question), trimmed — or the opening exchange if none match.
    const hits = c.messages.filter((m, i) => {
      const text = m.content.toLowerCase();
      const prev = c.messages[i - 1]?.content.toLowerCase() ?? "";
      return words.some((w) => text.includes(w) || (m.role === "assistant" && prev.includes(w)));
    });
    const pick = (hits.length ? hits : c.messages.slice(0, 2)).slice(0, 6);
    return {
      conversation_id: c.id,
      title: c.title,
      last_active: c.updated_at,
      excerpts: pick.map((m) => ({
        role: m.role,
        text: m.content.length > 700 ? m.content.slice(0, 700) + "…" : m.content,
        ...(m.actions?.length ? { made: m.actions.map((a) => (a.href ? `${a.label} (${a.href})` : a.label)) } : {}),
      })),
    };
  });
  return { ready: true, matches };
}
