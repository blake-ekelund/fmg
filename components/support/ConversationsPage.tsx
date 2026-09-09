"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronLeft,
  Loader2,
  MessageSquare,
  Search,
  Send,
  StickyNote,
  User,
  Wrench,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Customer Service — the storefront chat inbox.
 *
 * Every conversation the "ask sassy" concierge has is written down here, and
 * this page is both the transcript and the reply surface. Answering a thread
 * takes it: the bot goes quiet, and what you type shows up in the shopper's
 * chat widget within a few seconds.
 *
 * The tool trace under each bot reply is the point of the whole thing. When a
 * shopper is told something wrong, the trace says whether the model invented
 * it or a catalog field came back empty — those need very different fixes.
 */

type Status = "bot" | "needs_human" | "human" | "closed";

type Conversation = {
  id: string;
  store: "sassy" | "ni";
  session_key: string;
  profile_id: string | null;
  email: string | null;
  name: string | null;
  channel: "d2c" | "wholesale";
  status: Status;
  assigned_to: string | null;
  subject: string | null;
  message_count: number;
  last_message_at: string;
  agent_unread: boolean;
  page_url: string | null;
  created_at: string;
};

type ToolCall = { tool: string; input: unknown; output: unknown };

type Message = {
  id: string;
  role: "user" | "assistant" | "agent" | "note" | "system";
  content: string;
  author_name: string | null;
  tools: ToolCall[] | null;
  created_at: string;
  seq: number;
};

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** How often the inbox and the open thread refresh. */
const POLL_MS = 8000;

const STATUS_TABS: { key: "all" | Status; label: string }[] = [
  { key: "needs_human", label: "Needs a human" },
  { key: "human", label: "With us" },
  { key: "bot", label: "Bot handled" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

const STATUS_CHIP: Record<Status, string> = {
  bot: "bg-gray-100 text-gray-600",
  needs_human: "bg-amber-50 text-amber-700",
  human: "bg-emerald-50 text-emerald-700",
  closed: "bg-gray-100 text-gray-400",
};

const STATUS_LABEL: Record<Status, string> = {
  bot: "Bot",
  needs_human: "Needs a human",
  human: "With us",
  closed: "Closed",
};

function when(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The tool calls behind one bot reply, collapsed until asked for. */
function ToolTrace({ tools }: { tools: ToolCall[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600"
      >
        <Wrench size={11} />
        {tools.length} tool {tools.length === 1 ? "call" : "calls"}:{" "}
        {tools.map((t) => t.tool).join(", ")}
      </button>
      {open ? (
        <div className="mt-1.5 space-y-2 rounded-lg bg-gray-50 p-2.5">
          {tools.map((t, i) => (
            <div key={i}>
              <div className="text-[11px] font-medium text-gray-600">{t.tool}</div>
              <pre className="mt-0.5 max-h-52 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-gray-500">
                {JSON.stringify(t.input)}
                {"\n→ "}
                {JSON.stringify(t.output, null, 1)}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ConversationsPage() {
  const [rows, setRows] = useState<Conversation[]>([]);
  const [agents, setAgents] = useState<Record<string, string>>({});
  const [notReady, setNotReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<"all" | Status>("needs_human");
  const [storeFilter, setStoreFilter] = useState<"all" | "sassy" | "ni">("all");
  const [query, setQuery] = useState("");

  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [threadOf, setThreadOf] = useState<Conversation | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState<"reply" | "note" | null>(null);
  const [isNote, setIsNote] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/support/conversations?status=${tab}&store=${storeFilter}`,
        { headers: await authHeader() }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setRows(json.conversations ?? []);
      setAgents(json.agents ?? {});
      setNotReady(Boolean(json.notReady));
      setError(null);
    } catch {
      setError("Couldn't load conversations.");
    } finally {
      setLoading(false);
    }
  }, [tab, storeFilter]);

  const loadThread = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setThreadLoading(true);
    try {
      const res = await fetch(`/api/support/conversations/${id}`, {
        headers: await authHeader(),
      });
      const json = await res.json();
      if (res.ok) {
        setThread(json.messages ?? []);
        setThreadOf(json.conversation ?? null);
      }
    } catch {
      // keep whatever is on screen; the next poll retries
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!openId) return;
    void loadThread(openId);
  }, [openId, loadThread]);

  // Keep both panes live. A support inbox that needs a refresh button is a
  // support inbox where somebody waits.
  useEffect(() => {
    const timer = setInterval(() => {
      void reload();
      if (openId) void loadThread(openId, true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reload, loadThread, openId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.subject, r.email, r.name, r.page_url]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, query]);

  const waiting = rows.filter((r) => r.status === "needs_human").length;

  async function post(body: Record<string, unknown>) {
    if (!openId) return;
    const res = await fetch(`/api/support/conversations/${openId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(body),
    });
    return res.ok;
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(isNote ? "note" : "reply");
    const ok = await post({ action: isNote ? "note" : "reply", text });
    if (ok) {
      setDraft("");
      if (openId) await loadThread(openId, true);
      void reload();
    }
    setSending(null);
  }

  async function setStatus(status: Status) {
    await post({ action: "status", status });
    if (openId) await loadThread(openId, true);
    void reload();
  }

  const selectCls =
    "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none";

  return (
    <div className="w-full space-y-5 p-6 md:px-8">
      <p className="max-w-2xl text-sm text-gray-500">
        Every conversation the storefront chat concierge has, and the place to
        take one over. Replying here goes straight to the shopper&apos;s chat
        window and{" "}
        <strong className="font-medium">stops the bot from answering</strong>{" "}
        until you hand it back.
      </p>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {notReady ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
          <MessageSquare size={24} className="mx-auto text-gray-300" />
          <h2 className="mt-3 text-sm font-medium text-gray-900">
            Conversation tables aren&apos;t set up yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            Run{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">
              supabase/migrations/20260909010000_support_conversations.sql
            </code>
            . Conversations start landing here as soon as it exists — the
            storefront logs quietly until then.
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                  tab === t.key
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t.label}
                {t.key === "needs_human" && waiting > 0 ? (
                  <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-semibold text-white">
                    {waiting}
                  </span>
                ) : null}
              </button>
            ))}
            <select
              value={storeFilter}
              onChange={(e) =>
                setStoreFilter(e.target.value as "all" | "sassy" | "ni")
              }
              className={selectCls}
            >
              <option value="all">Both stores</option>
              <option value="sassy">Sassy</option>
              <option value="ni">Natural Inspirations</option>
            </select>
            <div className="relative ml-auto">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations…"
                className="w-56 rounded-lg border border-gray-200 py-1.5 pl-7 pr-2.5 text-xs focus:border-gray-400 focus:outline-none"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
              <Loader2 size={15} className="animate-spin" /> Loading
              conversations…
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              {/* Inbox */}
              <div
                className={`space-y-1.5 ${openId ? "max-lg:hidden" : ""}`}
              >
                {filtered.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-400">
                    Nothing here.
                  </div>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setOpenId(c.id)}
                      className={`w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${
                        openId === c.id
                          ? "border-gray-900 bg-gray-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {c.agent_unread ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                        ) : null}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CHIP[c.status]}`}
                        >
                          {STATUS_LABEL[c.status]}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-gray-400">
                          {c.store}
                          {c.channel === "wholesale" ? " · wholesale" : ""}
                        </span>
                        <span className="ml-auto text-[10px] text-gray-400">
                          {when(c.last_message_at)}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-sm text-gray-800">
                        {c.subject || "(no message yet)"}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-gray-400">
                        {c.email || c.name || "Anonymous shopper"} ·{" "}
                        {c.message_count} messages
                        {c.assigned_to && agents[c.assigned_to]
                          ? ` · ${agents[c.assigned_to]}`
                          : ""}
                      </p>
                    </button>
                  ))
                )}
              </div>

              {/* Thread */}
              {openId && threadOf ? (
                <div className="flex min-h-[32rem] flex-col rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setOpenId(null)}
                      className="text-gray-400 hover:text-gray-700 lg:hidden"
                      aria-label="Back to inbox"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {threadOf.email || threadOf.name || "Anonymous shopper"}
                      </p>
                      <p className="truncate text-[11px] text-gray-400">
                        {threadOf.store} · {threadOf.channel} · started{" "}
                        {clock(threadOf.created_at)}
                        {threadOf.page_url ? ` · from ${threadOf.page_url}` : ""}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      {threadOf.status !== "bot" ? (
                        <button
                          type="button"
                          onClick={() => void setStatus("bot")}
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                          title="The bot answers this conversation again"
                        >
                          Hand back to bot
                        </button>
                      ) : null}
                      {threadOf.status !== "closed" ? (
                        <button
                          type="button"
                          onClick={() => void setStatus("closed")}
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                        >
                          Close
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div
                    ref={scrollRef}
                    className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
                    style={{ maxHeight: "28rem" }}
                  >
                    {threadLoading ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Loader2 size={13} className="animate-spin" /> Loading…
                      </div>
                    ) : null}

                    {thread.map((m) => {
                      if (m.role === "system") {
                        return (
                          <p
                            key={m.id}
                            className="text-center text-[11px] italic text-gray-400"
                          >
                            {m.content}
                          </p>
                        );
                      }
                      if (m.role === "note") {
                        return (
                          <div
                            key={m.id}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
                          >
                            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-amber-700">
                              <StickyNote size={10} /> Internal note ·{" "}
                              {m.author_name} · {clock(m.created_at)}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">
                              {m.content}
                            </p>
                          </div>
                        );
                      }
                      const fromShopper = m.role === "user";
                      return (
                        <div
                          key={m.id}
                          className={fromShopper ? "flex justify-start" : "flex justify-end"}
                        >
                          <div className="max-w-[80%]">
                            <p
                              className={`flex items-center gap-1 text-[10px] text-gray-400 ${
                                fromShopper ? "" : "justify-end"
                              }`}
                            >
                              {fromShopper ? (
                                <>
                                  <User size={10} /> Shopper
                                </>
                              ) : m.role === "agent" ? (
                                <>
                                  <Check size={10} /> {m.author_name ?? "Team"}
                                </>
                              ) : (
                                <>
                                  <Bot size={10} /> Concierge
                                </>
                              )}
                              <span>· {clock(m.created_at)}</span>
                            </p>
                            <div
                              className={`mt-0.5 whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                                fromShopper
                                  ? "rounded-bl-sm bg-gray-100 text-gray-800"
                                  : m.role === "agent"
                                    ? "rounded-br-sm bg-emerald-600 text-white"
                                    : "rounded-br-sm bg-gray-900 text-white"
                              }`}
                            >
                              {m.content}
                            </div>
                            {m.tools?.length ? <ToolTrace tools={m.tools} /> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Composer */}
                  <div className="border-t border-gray-100 p-3">
                    <div className="mb-2 flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        <input
                          type="checkbox"
                          checked={isNote}
                          onChange={(e) => setIsNote(e.target.checked)}
                          className="h-3 w-3"
                        />
                        Internal note (the shopper never sees this)
                      </label>
                      {!isNote && threadOf.status !== "human" ? (
                        <span className="text-[11px] text-gray-400">
                          Sending takes this conversation off the bot.
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-end gap-2">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            (e.metaKey || e.ctrlKey) &&
                            draft.trim()
                          ) {
                            e.preventDefault();
                            void send();
                          }
                        }}
                        rows={3}
                        placeholder={
                          isNote
                            ? "A note for the team…"
                            : "Reply to the shopper…"
                        }
                        className={`flex-1 resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none ${
                          isNote
                            ? "border-amber-200 bg-amber-50 focus:border-amber-400"
                            : "border-gray-200 focus:border-gray-400"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => void send()}
                        disabled={!draft.trim() || sending !== null}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
                      >
                        {sending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : isNote ? (
                          <StickyNote size={14} />
                        ) : (
                          <Send size={14} />
                        )}
                        {isNote ? "Save" : "Send"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hidden items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400 lg:flex">
                  Pick a conversation to read it.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
