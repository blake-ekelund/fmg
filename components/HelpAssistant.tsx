"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Loader2, Send, Sparkles, X, RotateCcw } from "lucide-react";
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

type ChatAction = { label: string; href: string };
type ChatMessage = { role: "user" | "assistant"; content: string; actions?: ChatAction[] };

type HelpEvent = { t: "text"; v: string } | { t: "status"; v: string } | ({ t: "action" } & ChatAction);

/* What the server sees of past turns: drafts Sage made ride along as text so
   follow-ups ("change its subject line") know which one. */
const forApi = (m: ChatMessage) => ({
  role: m.role,
  content: m.actions?.length
    ? `${m.content}\n\n[Created: ${m.actions.map((a) => `${a.label} → ${a.href}`).join("; ")}]`
    : m.content,
});

const STORAGE_KEY = "fmg-help-chat";
const OPEN_EVENT = "fmg:open-help";

/** Open Sage from anywhere (e.g. the /help page), optionally asking a question. */
export function openHelpAssistant(question?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: question ?? null }));
}

const SUGGESTIONS = [
  "What can I do on this page?",
  "Draft an NI holiday gift email for D2C shoppers",
  "Add a task for me to review Q4 promos by Friday",
  "How do I email a group of customers?",
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore / persist the conversation for this browser tab.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved) as ChatMessage[]);
    } catch {
      /* storage unavailable — start fresh */
    }
  }, []);
  useEffect(() => {
    if (busy) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* ignore */
    }
  }, [messages, busy]);

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

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
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
        body: JSON.stringify({ messages: next.map(forApi), pathname }),
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
          } else if (ev.t === "action" && isAppPath(ev.href)) {
            actions.push({ label: ev.label, href: ev.href });
            setStatus(null);
          }
        }
        setMessages([...next, { role: "assistant", content: reply, actions: [...actions] }]);
      }
      if (!reply.trim() && !actions.length) throw new Error("Sage didn't send a reply. Try again.");
    } catch (e) {
      // Keep anything Sage already made — the draft exists even if the reply broke off.
      setMessages(reply || actions.length ? [...next, { role: "assistant", content: reply, actions }] : next);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  sendRef.current = send;

  function reset() {
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  }

  // The dashboard has its own "+" quick-create button in this corner — sit above it.
  const lift = pathname === "/dashboard" ? "bottom-24" : "bottom-5";
  const waiting = busy && messages[messages.length - 1]?.content === "";

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Sage"
          className={`fixed ${lift} right-5 z-40 flex items-center gap-2 rounded-full bg-brand-700 px-4 py-3 text-sm font-medium text-white shadow-lg ring-1 ring-brand-900/10 transition hover:bg-brand-600`}
        >
          <Sparkles size={17} />
          <span>Ask Sage</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-x-0 bottom-0 z-[60] sm:inset-x-auto sm:bottom-5 sm:right-5">
          <div className="flex h-[80vh] w-full flex-col overflow-hidden border border-line bg-surface shadow-overlay sm:h-[600px] sm:w-[420px] sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                  <Sparkles size={16} />
                </span>
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-ink">Sage</div>
                  <button
                    onClick={() => router.push("/help")}
                    className="text-xs text-ink-muted underline-offset-2 hover:text-brand-700 hover:underline"
                  >
                    Browse the full user guide
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={reset}
                    disabled={busy}
                    aria-label="Start a new conversation"
                    title="New conversation"
                    className="rounded-lg p-1.5 text-ink-muted transition hover:bg-surface-muted hover:text-ink disabled:opacity-40"
                  >
                    <RotateCcw size={16} />
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

            <div ref={scrollRef} onClick={onTranscriptClick} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-ink-secondary">
                    Hi, I&apos;m Sage. Ask me how to do anything in the portal — or ask me to do it: draft an email
                    template, add a task, write a social or blog post, or look something up.
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
                    {m.actions?.map((a) => (
                      <button
                        key={a.href}
                        onClick={() => go(a.href)}
                        className="inline-flex max-w-[92%] items-center gap-1.5 rounded-xl border border-brand-700/20 bg-brand-50 px-3 py-2 text-left text-sm font-medium text-brand-700 transition hover:bg-brand-100"
                      >
                        <span className="truncate">{a.label}</span>
                        <ArrowRight size={14} className="shrink-0" />
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
      )}
    </>
  );
}
