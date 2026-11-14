"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  LayoutGrid,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Receipt,
  Search,
  Send,
  ShoppingBag,
  StickyNote,
  User,
  Wrench,
  X,
} from "lucide-react";
import PageMeta from "@/components/PageMeta";
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

/** /api/support/conversions — is the concierge selling? */
type Conversions =
  | { ready: false }
  | {
      ready: true;
      days: number;
      summary: {
        chats: number;
        chatsWithAdd: number;
        addValue: number;
        orders: number;
        paidOrders: number;
        paidRevenue: number;
      };
      byId: Record<string, { bagAdds: number; orderNumber: number | null; paid: boolean }>;
    };

const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : "—");
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

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
  entry_preset: string | null;
  message_count: number;
  last_message_at: string;
  agent_unread: boolean;
  page_url: string | null;
  created_at: string;
  /** From migration 20261114030000; absent before it runs. */
  has_attachments?: boolean;
  refund_requested?: boolean;
  /** Collected by the concierge before handoff (migration 20261114040000). */
  phone?: string | null;
  /** Resolution (migration 20261114050000): drives board → Archive. */
  resolved_at?: string | null;
  resolved_by?: "ai" | "agent" | "auto" | null;
  resolution?: string | null;
};

/** A photo the shopper sent from the chat widget. `url` is a signed link. */
type Attachment = { path: string; name?: string; url: string | null };

type ToolCall = { tool: string; input: unknown; output: unknown };

type Message = {
  id: string;
  role: "user" | "assistant" | "agent" | "note" | "system";
  content: string;
  author_name: string | null;
  tools: ToolCall[] | null;
  attachments?: Attachment[] | null;
  created_at: string;
  seq: number;
};

/** Thumbnails of the shopper's photos; click opens the full-size one. */
function PhotoGrid({ items }: { items: Attachment[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {items.map((a) =>
        a.url ? (
          <a
            key={a.path}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            title={a.name ? `${a.name} (opens full size)` : "Open full size"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.url}
              alt={a.name || "Customer photo"}
              className="h-28 w-28 rounded-lg border border-gray-200 object-cover transition hover:opacity-90"
            />
          </a>
        ) : (
          <span
            key={a.path}
            className="grid h-28 w-28 place-items-center rounded-lg border border-dashed border-gray-200 text-[10px] text-gray-400"
          >
            photo unavailable
          </span>
        ),
      )}
    </div>
  );
}

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** How often the inbox and the open thread refresh. */
const POLL_MS = 8000;

/** The board, left to right: who has the customer right now. */
const COLUMNS: {
  status: Status;
  title: string;
  hint: string;
  empty: string;
  dot: string;
  tint: string;
  alert?: boolean;
}[] = [
  {
    status: "bot",
    title: "AI is handling",
    hint: "The concierge is answering",
    empty: "No live AI chats.",
    dot: "bg-gray-400",
    tint: "bg-gray-50",
  },
  {
    status: "needs_human",
    title: "Sent to a human",
    hint: "Waiting for someone to take it",
    empty: "Nobody waiting. Nice.",
    dot: "bg-amber-400",
    tint: "bg-amber-50/60",
    alert: true,
  },
  {
    status: "human",
    title: "Human helping",
    hint: "Someone on the team has it",
    empty: "Nothing in progress.",
    dot: "bg-emerald-500",
    tint: "bg-emerald-50/50",
  },
  {
    status: "closed",
    title: "Issue handled",
    hint: "Archived 12h after resolving",
    empty: "Nothing resolved in the last 12 hours.",
    dot: "bg-sky-500",
    tint: "bg-sky-50/50",
  },
];

const STATUS_CHIP: Record<Status, string> = {
  bot: "bg-gray-100 text-gray-600",
  needs_human: "bg-amber-50 text-amber-700",
  human: "bg-emerald-50 text-emerald-700",
  closed: "bg-gray-100 text-gray-400",
};

const STATUS_LABEL: Record<Status, string> = {
  bot: "AI is handling",
  needs_human: "Sent to a human",
  human: "Human helping",
  closed: "Issue handled",
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
  const [conversions, setConversions] = useState<Conversions | null>(null);

  const [dragOver, setDragOver] = useState<Status | null>(null);
  const [view, setView] = useState<"board" | "archive">("board");
  // Bumped on every move so the archive list refetches too.
  const [version, setVersion] = useState(0);
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
        `/api/support/conversations?status=board&store=${storeFilter}`,
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
    // Conversions ride along, but never break the inbox if they fail.
    try {
      const res = await fetch(`/api/support/conversions?store=${storeFilter}&days=30`, {
        headers: await authHeader(),
      });
      if (res.ok) setConversions(await res.json());
    } catch {
      // keep the last read
    }
  }, [storeFilter]);

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
      [r.subject, r.email, r.name, r.phone, r.page_url]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, query]);

  // Deep link from the notification bell: /storefronts/conversations?open=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("open");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) setOpenId(id);
  }, []);

  // Esc closes the drawer; a new thread starts from a clean slate.
  useEffect(() => {
    if (!openId) return;
    setThreadOf(null);
    setThread([]);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  async function postTo(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/support/conversations/${id}`, {
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

  async function post(body: Record<string, unknown>) {
    if (!openId) return false;
    return postTo(openId, body);
  }

  /**
   * Move a ticket to a column. Optimistic, so a drag lands instantly; the
   * next reload corrects it if the server disagreed. "Human helping" is a
   * claim (assigns it to you and silences the AI), not just a status.
   */
  async function move(id: string, status: Status) {
    const current = rows.find((r) => r.id === id);
    if (current?.status === status) return;
    const resolved =
      status === "closed"
        ? { resolved_at: new Date().toISOString(), resolved_by: "agent" as const }
        : { resolved_at: null, resolved_by: null };
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status, ...resolved } : r)));
    if (threadOf?.id === id) setThreadOf({ ...threadOf, status, ...resolved });
    await postTo(id, status === "human" ? { action: "claim" } : { action: "status", status });
    if (openId === id) await loadThread(id, true);
    void reload();
    setVersion((v) => v + 1);
  }

  const selectCls =
    "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none";

  return (
    <div className="w-full space-y-5 p-6 md:px-8">
      <PageMeta
        title="Customer Service"
        description="Storefront chat conversations — replying here pauses the bot until you hand back."
      />

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
          {/* Is the concierge selling? Chats in the last 30 days that led to
              an add-to-bag tap on something it offered, and to an order in the
              same visit. Follows the store filter. */}
          {conversions?.ready ? (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 sm:grid-cols-4">
              {[
                { label: `Chats · last ${conversions.days} days`, value: conversions.summary.chats.toLocaleString(), sub: "conversations started" },
                {
                  label: "Added to bag",
                  value: pct(conversions.summary.chatsWithAdd, conversions.summary.chats),
                  sub: `${conversions.summary.chatsWithAdd} chats · ${usd(conversions.summary.addValue)} added`,
                },
                {
                  label: "Ordered after chat",
                  value: pct(conversions.summary.orders, conversions.summary.chats),
                  sub: `${conversions.summary.orders} orders · ${conversions.summary.paidOrders} paid`,
                },
                { label: "Paid revenue", value: usd(conversions.summary.paidRevenue), sub: "from chat-assisted orders" },
              ].map((k) => (
                <div key={k.label} className="bg-white px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">{k.label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{k.value}</p>
                  <p className="text-[11px] text-gray-400">{k.sub}</p>
                </div>
              ))}
            </div>
          ) : conversions && !conversions.ready ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-2.5 text-xs text-gray-400">
              Conversion tracking starts once{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">
                supabase/migrations/20261102010000_support_conversation_conversions.sql
              </code>{" "}
              has been run.
            </p>
          ) : null}

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5">
              {([
                { key: "board", label: "Board", icon: <LayoutGrid size={13} /> },
                { key: "archive", label: "Archive", icon: <Archive size={13} /> },
              ] as const).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    view === v.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
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
            {view === "board" ? (
              <p className="text-xs text-gray-400">
                Drag a card to move it. Moving to &ldquo;Human helping&rdquo; assigns it to you.
              </p>
            ) : null}
            <div className={`relative ml-auto ${view === "board" ? "" : "hidden"}`}>
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, phone, message…"
                className="w-64 rounded-lg border border-gray-200 py-1.5 pl-7 pr-2.5 text-xs focus:border-gray-400 focus:outline-none"
              />
            </div>
          </div>

          {view === "archive" ? (
            <ArchiveView
              store={storeFilter}
              version={version}
              openId={openId}
              onOpen={setOpenId}
            />
          ) : loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
              <Loader2 size={15} className="animate-spin" /> Loading
              conversations…
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {COLUMNS.map((col) => {
                const cards = filtered.filter((c) => c.status === col.status);
                const over = dragOver === col.status;
                return (
                  <section
                    key={col.status}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOver !== col.status) setDragOver(col.status);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setDragOver(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(null);
                      const id = e.dataTransfer.getData("text/plain");
                      if (id) void move(id, col.status);
                    }}
                    className={`flex min-h-[16rem] flex-col rounded-xl border transition-colors ${
                      over
                        ? "border-gray-900 bg-gray-100"
                        : `${col.tint} border-transparent`
                    }`}
                  >
                    <header className="flex items-center gap-2 px-3 pb-2 pt-3">
                      <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                      <h2 className="text-[13px] font-semibold text-gray-900">
                        {col.title}
                      </h2>
                      <span
                        className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                          col.alert && cards.length > 0
                            ? "bg-amber-400 text-white"
                            : "bg-white text-gray-500"
                        }`}
                      >
                        {cards.length}
                      </span>
                      <span className="ml-auto truncate text-[11px] text-gray-400">
                        {col.hint}
                      </span>
                    </header>
                    <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2 xl:max-h-[calc(100vh-17rem)]">
                      {cards.length === 0 ? (
                        <p className="px-2 py-8 text-center text-xs text-gray-400">
                          {col.empty}
                        </p>
                      ) : (
                        cards.map((c) => (
                          <Card
                            key={c.id}
                            c={c}
                            agent={c.assigned_to ? agents[c.assigned_to] : undefined}
                            conversion={conversions?.ready ? conversions.byId[c.id] : undefined}
                            active={openId === c.id}
                            onOpen={() => setOpenId(c.id)}
                          />
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Conversation drawer */}
      {openId ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setOpenId(null)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="Conversation"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-gray-200 bg-white shadow-2xl"
          >
            {!threadOf ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-400">
                <Loader2 size={15} className="animate-spin" /> Loading…
              </div>
            ) : (
              <>
                <div className="border-b border-gray-100 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CHIP[threadOf.status]}`}
                        >
                          {STATUS_LABEL[threadOf.status]}
                        </span>
                        {threadOf.refund_requested ? (
                          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                            Refund
                          </span>
                        ) : null}
                        <span className="text-[10px] uppercase tracking-wider text-gray-400">
                          {threadOf.store === "ni" ? "Natural Inspirations" : "Sassy"} · {threadOf.channel}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-base font-semibold text-gray-900">
                        {threadOf.name || threadOf.email || "Anonymous shopper"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        {threadOf.email ? (
                          <a href={`mailto:${threadOf.email}`} className="inline-flex items-center gap-1 text-gray-700 hover:underline">
                            <Mail size={12} className="text-gray-400" /> {threadOf.email}
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400">
                            <Mail size={12} /> no email yet
                          </span>
                        )}
                        {threadOf.phone ? (
                          <a href={`tel:${threadOf.phone}`} className="inline-flex items-center gap-1 text-gray-700 hover:underline">
                            <Phone size={12} className="text-gray-400" /> {threadOf.phone}
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400">
                            <Phone size={12} /> no phone yet
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[11px] text-gray-400">
                        Started {clock(threadOf.created_at)}
                        {threadOf.page_url ? ` · from ${threadOf.page_url}` : ""}
                        {threadOf.assigned_to && agents[threadOf.assigned_to]
                          ? ` · with ${agents[threadOf.assigned_to]}`
                          : ""}
                      </p>
                      {threadOf.status === "closed" && (threadOf.resolution || threadOf.resolved_by) ? (
                        <p className="mt-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs text-sky-900">
                          <span className="font-medium">
                            Resolved
                            {threadOf.resolved_by === "ai"
                              ? " by the AI"
                              : threadOf.resolved_by === "agent"
                                ? " by the team"
                                : threadOf.resolved_by === "auto"
                                  ? " (customer left)"
                                  : ""}
                            {threadOf.resolved_at ? ` · ${clock(threadOf.resolved_at)}` : ""}
                          </span>
                          {threadOf.resolution ? ` · ${threadOf.resolution}` : ""}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenId(null)}
                      className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Close conversation"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {threadOf.status !== "human" ? (
                      <button
                        type="button"
                        onClick={() => void move(threadOf.id, "human")}
                        className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                        title="Assign to you; the AI stops replying"
                      >
                        Take it
                      </button>
                    ) : null}
                    {threadOf.status !== "closed" ? (
                      <button
                        type="button"
                        onClick={() => void move(threadOf.id, "closed")}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        <CheckCircle2 size={13} /> Mark handled
                      </button>
                    ) : null}
                    {threadOf.status !== "bot" ? (
                      <button
                        type="button"
                        onClick={() => void move(threadOf.id, "bot")}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                        title="The AI answers this conversation again"
                      >
                        <Bot size={13} /> Back to AI
                      </button>
                    ) : null}
                  </div>
                </div>

                <div
                  ref={scrollRef}
                  className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
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
                                <User size={10} /> Customer
                              </>
                            ) : m.role === "agent" ? (
                              <>
                                <Check size={10} /> {m.author_name ?? "Team"}
                              </>
                            ) : (
                              <>
                                <Bot size={10} /> AI
                              </>
                            )}
                            <span>· {clock(m.created_at)}</span>
                          </p>
                          {m.attachments?.length ? (
                            <PhotoGrid items={m.attachments} />
                          ) : null}
                          {m.content !== "(sent a photo)" || !m.attachments?.length ? (
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
                          ) : null}
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
                      Internal note (the customer never sees this)
                    </label>
                    {!isNote && threadOf.status !== "human" ? (
                      <span className="text-[11px] text-gray-400">
                        Sending moves this to Human helping and stops the AI.
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
                          : "Reply to the customer… (Ctrl+Enter to send)"
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
              </>
            )}
          </aside>
        </>
      ) : null}
    </div>
  );
}

/** One ticket on the board. Draggable between columns; click opens it. */
function Card({
  c,
  agent,
  conversion,
  active,
  onOpen,
}: {
  c: Conversation;
  agent?: string;
  conversion?: { bagAdds: number; orderNumber: number | null; paid: boolean };
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", c.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      className={`w-full cursor-grab rounded-lg border bg-white px-3 py-2.5 text-left shadow-sm transition active:cursor-grabbing ${
        active
          ? "border-gray-900 ring-1 ring-gray-900"
          : c.agent_unread
            ? "border-amber-300 hover:border-amber-400"
            : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {c.agent_unread ? (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
            title="New message from the customer"
          />
        ) : null}
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            c.store === "ni" ? "bg-violet-50 text-violet-700" : "bg-pink-50 text-pink-700"
          }`}
        >
          {c.store === "ni" ? "NI" : "Sassy"}
        </span>
        {c.channel === "wholesale" ? (
          <span className="text-[10px] uppercase tracking-wider text-gray-400">wholesale</span>
        ) : null}
        {c.refund_requested ? (
          <span
            title="Refund / damaged-item request"
            className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700"
          >
            Refund
          </span>
        ) : null}
        {c.has_attachments ? (
          <span title="The customer sent photos" className="text-sky-600">
            <Camera size={11} />
          </span>
        ) : null}
        {conversion?.bagAdds ? (
          <span
            title={`${conversion.bagAdds} added to bag from chat`}
            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700"
          >
            <ShoppingBag size={10} /> {conversion.bagAdds}
          </span>
        ) : null}
        {conversion?.orderNumber ? (
          <span
            title={conversion.paid ? "Paid order after this chat" : "Order placed after this chat"}
            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700"
          >
            <Receipt size={10} /> #{conversion.orderNumber}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 text-[10px] text-gray-400">{when(c.last_message_at)}</span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-gray-800">
        {c.subject || "(no message yet)"}
      </p>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-400">
        <span className="min-w-0 truncate">
          {c.name || c.email || "Anonymous"}
          {c.phone ? ` · ${c.phone}` : ""}
        </span>
        <span className="ml-auto shrink-0 tabular-nums">{c.message_count} msgs</span>
      </div>
      {c.status === "closed" && c.resolution ? (
        <p className="mt-1 line-clamp-1 text-[11px] text-sky-700">
          {c.resolved_by === "ai" ? "AI: " : ""}
          {c.resolution}
        </p>
      ) : agent ? (
        <p className="mt-1 text-[11px] text-emerald-700">With {agent}</p>
      ) : null}
    </button>
  );
}

const RESOLVED_BY: Record<string, { label: string; cls: string }> = {
  ai: { label: "AI", cls: "bg-gray-900 text-white" },
  agent: { label: "Team", cls: "bg-emerald-50 text-emerald-700" },
  auto: { label: "Customer left", cls: "bg-gray-100 text-gray-500" },
};

/**
 * The Archive: every ticket resolved more than 12 hours ago. Searchable and
 * paged on the server, because it only grows. Rows open the same drawer as
 * the board, and "Take it" there pulls a ticket back out.
 */
function ArchiveView({
  store,
  version,
  openId,
  onOpen,
}: {
  store: "all" | "sassy" | "ni";
  version: number;
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<Conversation[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (offset: number) => {
      const params = new URLSearchParams({
        status: "archive",
        store,
        offset: String(offset),
        ...(debounced ? { q: debounced } : {}),
      });
      const res = await fetch(`/api/support/conversations?${params}`, {
        headers: await authHeader(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return null;
      return json as { conversations: Conversation[]; total: number | null };
    },
    [store, debounced],
  );

  useEffect(() => {
    let live = true;
    setLoading(true);
    void load(0).then((json) => {
      if (!live) return;
      setRows(json?.conversations ?? []);
      setTotal(json?.total ?? null);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [load, version]);

  async function loadMore() {
    setMore(true);
    const json = await load(rows.length);
    setRows((r) => [...r, ...(json?.conversations ?? [])]);
    setMore(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-gray-400">
          Resolved more than 12 hours ago. If a customer writes back within 12
          hours of a resolution, the ticket reopens on the board instead.
        </p>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the archive…"
            className="w-64 rounded-lg border border-gray-200 py-1.5 pl-7 pr-2.5 text-xs focus:border-gray-400 focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 size={15} className="animate-spin" /> Loading the archive…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
          <Archive size={22} className="mx-auto mb-2 text-gray-300" />
          {debounced ? "Nothing in the archive matches that." : "Nothing archived yet."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-[11px] uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-3 py-2 font-medium">Resolved</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Asked about</th>
                <th className="px-3 py-2 font-medium">Outcome</th>
                <th className="px-3 py-2 font-medium">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((c) => {
                const by = c.resolved_by ? RESOLVED_BY[c.resolved_by] : null;
                return (
                  <tr
                    key={c.id}
                    onClick={() => onOpen(c.id)}
                    className={`cursor-pointer align-top transition-colors hover:bg-gray-50 ${
                      openId === c.id ? "bg-gray-50" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">
                      {clock(c.resolved_at ?? c.last_message_at)}
                      <div className="mt-0.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            c.store === "ni" ? "bg-violet-50 text-violet-700" : "bg-pink-50 text-pink-700"
                          }`}
                        >
                          {c.store === "ni" ? "NI" : "Sassy"}
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[14rem] px-3 py-2.5 text-xs">
                      <p className="truncate text-gray-800">{c.name || c.email || "Anonymous"}</p>
                      {c.name && c.email ? <p className="truncate text-gray-400">{c.email}</p> : null}
                      {c.phone ? <p className="truncate text-gray-400">{c.phone}</p> : null}
                    </td>
                    <td className="max-w-[22rem] px-3 py-2.5">
                      <p className="line-clamp-2 text-[13px] text-gray-800">{c.subject || "(no message)"}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        {c.refund_requested ? (
                          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">Refund</span>
                        ) : null}
                        {c.has_attachments ? <Camera size={11} className="text-sky-600" /> : null}
                        <span className="text-[11px] text-gray-400">{c.message_count} msgs</span>
                      </div>
                    </td>
                    <td className="max-w-[20rem] px-3 py-2.5 text-xs text-gray-600">
                      {c.resolution || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {by ? (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${by.cls}`}>{by.label}</span>
                      ) : (
                        <span className="text-[11px] text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {total !== null && rows.length < total ? (
            <div className="border-t border-gray-100 p-2 text-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={more}
                className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {more ? "Loading…" : `Load more (${rows.length} of ${total})`}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
