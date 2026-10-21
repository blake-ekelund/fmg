"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Download, History, Loader2, Send, Sparkles, SquarePen, Trash2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { isAppPath, renderMarkdown } from "@/lib/help/markdown";

/**
 * Sage, the floating assistant bottom-right on every internal page. Staff ask
 * "how do I…" questions, or ask Sage to do something — draft an email
 * template, add a task, write a social or blog post, look up stock or a
 * customer. /api/help/assistant answers from the user guide in lib/help and
 * the role-gated tools in lib/assistant/helpTools.ts. Everything it creates is
 * a draft, shown here as an "Open" button.
 *
 * Mounted once in LayoutShell, so the conversation survives client-side
 * navigation (and is mirrored to sessionStorage to survive a reload).
 */

/** A button under a Sage reply: open a page, or download a CSV report. */
type ChatAction =
  | { label: string; href: string }
  | { label: string; download: { spec: unknown; filename: string } };
type ChatMessage = { role: "user" | "assistant"; content: string; actions?: ChatAction[] };

type HistoryItem = { id: string; title: string; updated_at: string };

/** "2:14 PM" today, "Yesterday", "Mon", or "Oct 3". */
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type HelpEvent ={ t: "text"; v: string } | { t: "status"; v: string } | ({ t: "action" } & ChatAction);

/* What the server sees of past turns: what Sage made rides along as text so
   follow-ups ("change its subject line") know which one. */
const forApi = (m: ChatMessage) => ({
  role: m.role,
  content: m.actions?.length
    ? `${m.content}\n\n[Shown: ${m.actions.map((a) => ("href" in a ? `${a.label} → ${a.href}` : a.label)).join("; ")}]`
    : m.content,
});

const STORAGE_KEY = "fmg-help-chat";
const OPEN_EVENT = "fmg:open-help";

/** Open Sage from anywhere (e.g. the /help page), optionally asking a question. */
export function openHelpAssistant(question?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: question ?? null }));
}

const SUGGESTIONS = [
  "Which products are running low on stock?",
  "Pull a report of wholesale customers who haven't ordered in 2026",
  "Draft an NI holiday gift email for D2C shoppers",
  "What can I do on this page?",
];

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function HelpAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // The saved conversation this chat belongs to (null until its first save).
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  const [view, setView] = useState<"chat" | "history">("chat");
  const [history, setHistory] = useState<{ ready: boolean; items: HistoryItem[]; error?: string } | null>(null);
  // A reply landed while the panel was closed — the launcher says so.
  const [hasUnread, setHasUnread] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Latest `open`, read inside the async send() without a stale closure.
  const openRef = useRef(open);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    openRef.current = open;
    if (open) setHasUnread(false);
  }, [open]);

  /* Create/resume the audio context during the send click, so the "done" chime
     is allowed to play later — by then we're outside any user gesture and a
     fresh context would be blocked by the browser's autoplay policy. */
  function unlockAudio() {
    if (!audioRef.current) {
      const Ctx =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) audioRef.current = new Ctx();
    }
    audioRef.current?.resume().catch(() => {});
  }

  /** A soft three-note rising chime, synthesized (no asset). Best-effort. */
  function playChime() {
    const ctx = audioRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.11;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.1, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  /* Tell the user Sage finished: chime when they may not be watching (panel
     closed, other tab, or it took a while); the launcher switches to "Sage is
     done" when the panel is closed; title flag while the tab is in the
     background. */
  function announceDone(ok: boolean, tookMs: number) {
    const watching = openRef.current && !document.hidden;
    if (!watching || tookMs > 4000) playChime();
    if (!openRef.current) setHasUnread(true);
    if (document.hidden) {
      const original = document.title;
      document.title = ok ? "✓ Sage is done" : "Sage hit a snag";
      const restore = () => {
        if (document.hidden) return;
        document.title = original;
        document.removeEventListener("visibilitychange", restore);
      };
      document.addEventListener("visibilitychange", restore);
    }
  }

  // Restore / persist the open conversation for this browser tab (the saved
  // history lives server-side; this just survives a reload mid-chat).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as
        | ChatMessage[]
        | { messages: ChatMessage[]; conversationId: string | null }
        | null;
      if (Array.isArray(saved)) setMessages(saved);
      else if (saved) {
        setMessages(saved.messages ?? []);
        setConversationId(saved.conversationId ?? null);
      }
    } catch {
      /* storage unavailable — start fresh */
    }
  }, []);
  useEffect(() => {
    if (busy) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-30), conversationId }));
    } catch {
      /* ignore */
    }
  }, [messages, busy, conversationId]);

  /* Save the conversation to the user's Sage history after each reply, so Sage
     can recall it later and it shows under History. Best-effort: if history
     isn't set up (migration not applied) the server returns id null. */
  async function persist(all: ChatMessage[]) {
    try {
      const res = await fetch("/api/help/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ id: conversationIdRef.current, messages: all }),
      });
      const j = (await res.json().catch(() => null)) as { id?: string | null } | null;
      if (res.ok && j?.id) {
        conversationIdRef.current = j.id;
        setConversationId(j.id);
      }
    } catch {
      /* history is a nice-to-have — never block the chat on it */
    }
  }

  async function openHistory() {
    setView("history");
    setHistory(null);
    try {
      const res = await fetch("/api/help/conversations", { headers: await authHeader(), cache: "no-store" });
      const j = (await res.json()) as { ready?: boolean; items?: HistoryItem[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't load your history.");
      setHistory({ ready: j.ready !== false, items: j.items ?? [] });
    } catch (e) {
      setHistory({ ready: true, items: [], error: e instanceof Error ? e.message : "Couldn't load your history." });
    }
  }

  async function loadConversation(id: string) {
    try {
      const res = await fetch(`/api/help/conversations?id=${encodeURIComponent(id)}`, { headers: await authHeader() });
      const j = (await res.json()) as { conversation?: { id: string; messages: ChatMessage[] } | null };
      if (!j.conversation) throw new Error("That conversation couldn't be found.");
      conversationIdRef.current = j.conversation.id;
      setConversationId(j.conversation.id);
      setMessages(j.conversation.messages ?? []);
      setError(null);
      setView("chat");
    } catch (e) {
      setHistory((h) => (h ? { ...h, error: e instanceof Error ? e.message : "Couldn't open that." } : h));
    }
  }

  async function removeConversation(id: string) {
    setHistory((h) => (h ? { ...h, items: h.items.filter((c) => c.id !== id) } : h));
    if (conversationIdRef.current === id) reset();
    try {
      await fetch(`/api/help/conversations?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: await authHeader() });
    } catch {
      /* already gone from the list; a failed delete reappears next time */
    }
  }

  // send() is redeclared each render; the listener reads the latest through a ref.
  const sendRef = useRef<(q: string) => void>(() => {});
  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const q = (e as CustomEvent<string | null>).detail;
      if (q) sendRef.current(q);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, open, status]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /* Reply links are real anchors; route in-app ones client-side so the shell
     (and this conversation) stays mounted. The panel stays open so the user
     can follow the steps on the page they just landed on. */
  function onTranscriptClick(e: React.MouseEvent) {
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
    if (!href || !isAppPath(href)) return;
    e.preventDefault();
    go(href);
  }

  /* /templates?edit= is read once on mount, so a hard load guarantees the
     editor opens even when we're already on /templates. */
  function go(href: string) {
    if (href.startsWith("/templates?") && pathname === "/templates") window.location.assign(href);
    else router.push(href);
  }

  /* Report buttons: the export route re-runs the query under the user's own
     permissions and returns a CSV, saved via a temporary object URL. */
  const [downloading, setDownloading] = useState<string | null>(null);
  async function download(a: Extract<ChatAction, { download: unknown }>) {
    setDownloading(a.label);
    setError(null);
    try {
      const res = await fetch("/api/help/export", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(a.download),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "Couldn't build that report.");
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = a.download.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't download that report.");
    } finally {
      setDownloading(null);
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    unlockAudio(); // while we still have the click / Enter gesture
    const startedAt = Date.now();
    setView("chat");
    setError(null);
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    let reply = "";
    const actions: ChatAction[] = [];
    try {
      const res = await fetch("/api/help/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ messages: next.map(forApi), pathname, conversationId: conversationIdRef.current }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "Sage couldn't answer right now.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: HelpEvent;
          try {
            ev = JSON.parse(line) as HelpEvent;
          } catch {
            continue;
          }
          if (ev.t === "text") {
            reply += ev.v;
            setStatus(null);
          } else if (ev.t === "status") {
            setStatus(ev.v);
          } else if (ev.t === "action") {
            if ("href" in ev && isAppPath(ev.href)) actions.push({ label: ev.label, href: ev.href });
            else if ("download" in ev) actions.push({ label: ev.label, download: ev.download });
            setStatus(null);
          }
        }
        setMessages([...next, { role: "assistant", content: reply, actions: [...actions] }]);
      }
      if (!reply.trim() && !actions.length) throw new Error("Sage didn't send a reply. Try again.");
      void persist([...next, { role: "assistant", content: reply, actions }]);
      announceDone(true, Date.now() - startedAt);
    } catch (e) {
      // Keep anything Sage already made — the draft exists even if the reply broke off.
      const kept: ChatMessage[] = reply || actions.length ? [...next, { role: "assistant", content: reply, actions }] : next;
      setMessages(kept);
      if (kept.length > next.length) void persist(kept);
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      announceDone(false, Date.now() - startedAt);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  sendRef.current = send;

  /** Start a new conversation (the current one stays in History). */
  function reset() {
    setMessages([]);
    setError(null);
    conversationIdRef.current = null;
    setConversationId(null);
    setView("chat");
    inputRef.current?.focus();
  }

  const waiting = busy && messages[messages.length - 1]?.content === "";

  return (
    <>
      {/* Launcher — shows Sage's state while the panel is closed: working
          (spinner + pulse) or done with a reply waiting (gold + dot). */}
      <button
        onClick={() => setOpen(true)}
        aria-label={busy ? "Sage is working — open" : hasUnread ? "Sage is done — open" : "Open Sage"}
        aria-hidden={open}
        tabIndex={open ? -1 : 0}
        className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium shadow-lg ring-1 transition-all duration-200 ease-out motion-reduce:transition-none ${
          open ? "pointer-events-none translate-y-2 scale-90 opacity-0" : "translate-y-0 scale-100 opacity-100"
        } ${
          hasUnread && !busy
            ? "bg-accent-500 text-brand-900 ring-accent-600/20 hover:bg-accent-400"
            : "bg-brand-700 text-white ring-brand-900/10 hover:bg-brand-600"
        }`}
      >
        {hasUnread && !busy && (
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-accent-600 ring-2 ring-surface" />
        )}
        {busy ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
        <span>{busy ? "Sage is working…" : hasUnread ? "Sage is done" : "Ask Sage"}</span>
      </button>

      {/* Always mounted (hidden + inert when closed) so open and close both animate. */}
      <div
        inert={!open}
        aria-hidden={!open}
        className={`fixed inset-x-0 bottom-0 z-[60] origin-bottom-right transition-all duration-200 ease-out motion-reduce:transition-none sm:inset-x-auto sm:bottom-5 sm:right-5 ${
          open ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-4 scale-95 opacity-0"
        }`}
      >
        <div className="flex h-[80vh] w-full flex-col overflow-hidden border border-line bg-surface shadow-overlay sm:h-[600px] sm:w-[420px] sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              </span>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-ink">Sage</div>
                {busy ? (
                  <div className="flex items-center gap-1 text-xs font-medium text-brand-700" aria-live="polite">
                    <Loader2 size={11} className="animate-spin" />
                    {status ?? "Working…"}
                  </div>
                ) : (
                  <button
                    onClick={() => router.push("/help")}
                    className="text-xs text-ink-muted underline-offset-2 hover:text-brand-700 hover:underline"
                  >
                    Browse the full user guide
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => (view === "history" ? setView("chat") : openHistory())}
                disabled={busy}
                aria-label={view === "history" ? "Back to the chat" : "Past conversations"}
                title={view === "history" ? "Back to the chat" : "Past conversations"}
                className={`rounded-lg p-1.5 transition hover:bg-surface-muted hover:text-ink disabled:opacity-40 ${
                  view === "history" ? "bg-surface-muted text-ink" : "text-ink-muted"
                }`}
              >
                <History size={16} />
              </button>
              {(messages.length > 0 || view === "history") && (
                <button
                  onClick={reset}
                  disabled={busy}
                  aria-label="Start a new conversation"
                  title="New conversation"
                  className="rounded-lg p-1.5 text-ink-muted transition hover:bg-surface-muted hover:text-ink disabled:opacity-40"
                >
                  <SquarePen size={16} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close Sage"
                className="rounded-lg p-1.5 text-ink-muted transition hover:bg-surface-muted hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {view === "history" && (
            <div className="flex-1 overflow-y-auto px-2 py-2">
              <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                Past conversations
              </div>
              {!history && (
                <div className="flex items-center gap-2 px-2 py-3 text-sm text-ink-muted">
                  <Loader2 size={14} className="animate-spin" /> Loading…
                </div>
              )}
              {history && !history.ready && (
                <p className="px-2 py-3 text-sm text-ink-muted">
                  Conversation history isn&apos;t switched on yet — ask Blake to run the database update.
                </p>
              )}
              {history?.error && <p className="px-2 py-2 text-xs text-red-700">{history.error}</p>}
              {history?.ready && !history.error && history.items.length === 0 && (
                <p className="px-2 py-3 text-sm text-ink-muted">No past conversations yet. Sage saves each chat here.</p>
              )}
              {history?.items.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-1 rounded-lg ${c.id === conversationId ? "bg-brand-50" : "hover:bg-surface-muted"}`}
                >
                  <button onClick={() => loadConversation(c.id)} className="min-w-0 flex-1 px-2 py-2 text-left">
                    <div className="truncate text-sm text-ink">{c.title}</div>
                    <div className="text-[11px] text-ink-muted">{when(c.updated_at)}</div>
                  </button>
                  <button
                    onClick={() => removeConversation(c.id)}
                    aria-label={`Delete “${c.title}”`}
                    title="Delete"
                    className="mr-1 rounded-md p-1.5 text-ink-subtle opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            ref={scrollRef}
            onClick={onTranscriptClick}
            className={`flex-1 space-y-3 overflow-y-auto px-4 py-4 ${view === "history" ? "hidden" : ""}`}
          >
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-ink-secondary">
                  Hi, I&apos;m Sage. Ask me how to do anything in the portal — or ask me to do it: draft an email
                  template, pull a report, check inventory, add or update a task, or write a social or blog post.
                </p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm text-ink-secondary transition hover:border-line-strong hover:bg-surface-muted hover:text-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-700 px-3 py-2 text-sm text-white">
                    {m.content}
                  </div>
                </div>
              ) : m.content || m.actions?.length ? (
                <div key={i} className="flex flex-col items-start gap-2">
                  {m.content && (
                    <div
                      className="max-w-[92%] space-y-1.5 rounded-2xl rounded-bl-sm bg-surface-muted px-3 py-2 text-sm text-ink [&_strong]:font-semibold"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                    />
                  )}
                  {m.actions?.map((a, j) => (
                    <button
                      key={j}
                      onClick={() => ("href" in a ? go(a.href) : download(a))}
                      disabled={"download" in a && downloading === a.label}
                      className="inline-flex max-w-[92%] items-center gap-1.5 rounded-xl border border-brand-700/20 bg-brand-50 px-3 py-2 text-left text-sm font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
                    >
                      {"download" in a &&
                        (downloading === a.label ? (
                          <Loader2 size={14} className="shrink-0 animate-spin" />
                        ) : (
                          <Download size={14} className="shrink-0" />
                        ))}
                      <span className="truncate">{a.label}</span>
                      {"href" in a && <ArrowRight size={14} className="shrink-0" />}
                    </button>
                  ))}
                </div>
              ) : null,
            )}

            {status && (
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <Loader2 size={13} className="animate-spin" />
                {status}
              </div>
            )}

            {waiting && !status && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-surface-muted px-3 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted" />
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            )}
          </div>

          <div className="border-t border-line px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder="Ask Sage, or tell it what to make…"
                className="max-h-28 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-brand-700/10"
              />
              <button
                onClick={() => send(input)}
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-ink-subtle">
              Sage makes drafts — sending, posting and publishing stay with you
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
