"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Send, Sparkles, X } from "@/components/portal/icons";
import {
  portalPost,
  portalHref,
  portalDownload,
  type ChatMessage,
} from "@/components/portal/api";

/**
 * A floating chat assistant, available on every portal page, that answers a
 * rep's questions about their own agency — sales, customers, and orders. It
 * talks to /api/portal/assistant, which scopes every lookup to the signed-in
 * rep's agency, so the rep can only ever ask about their own book.
 *
 * Read-only: it looks things up and points to the right page for actions
 * (tracking, sample requests) rather than performing them.
 */

const SUGGESTIONS = [
  "How are my sales tracking vs last year?",
  "Which accounts haven't ordered this year?",
  "Show my open orders",
  "Who are my top customers?",
];

/**
 * Minimal, safe Markdown → HTML for the assistant's replies: bold, bullets, and
 * links. Only two href shapes are allowed to become live links — an in-portal
 * page (/portal…) or an agency-scoped Excel export (/api/portal/…/export). Both
 * are same-origin. Anything else (external URLs, javascript:, other paths) is
 * rendered as literal text, so a stray or injected URL can never become a live
 * off-site/hostile link. Page hrefs run through portalHref so admin preview
 * keeps ?previewAgency=; export hrefs stay raw (portalDownload adds the agency).
 */
const isPortalPage = (href: string) => /^\/portal(?:[/?#]|$)/.test(href);
const isExport = (href: string) => /^\/api\/portal\/[\w/-]+\/export(?:[/?#]|$)/.test(href);

/* Carrier tracking pages are the one off-site destination we allow — a rep
   clicking a tracking number should land on UPS/FedEx/USPS. Whitelisted by exact
   host so no other external URL (or a look-alike) can render as a live link. */
const CARRIER_HOSTS = new Set(["tools.usps.com", "www.ups.com", "www.fedex.com"]);
const isCarrierUrl = (href: string) => {
  if (!/^https:\/\//i.test(href)) return false;
  try {
    return CARRIER_HOSTS.has(new URL(href).hostname.toLowerCase());
  } catch {
    return false;
  }
};

function renderMarkdown(text: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");

  // esc + **bold** on a run of plain (non-link) text.
  const fmt = (s: string) =>
    esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  const inline = (s: string): string => {
    const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    let out = "";
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(s)) !== null) {
      out += fmt(s.slice(last, m.index));
      const label = m[1];
      const href = m[2].trim();
      const cls = "font-medium text-brand-700 underline underline-offset-2";
      if (isPortalPage(href)) {
        out += `<a href="${escAttr(portalHref(href))}" class="${cls}">${fmt(label)}</a>`;
      } else if (isExport(href)) {
        // Handled by the click interceptor as an authenticated download.
        out += `<a href="${escAttr(href)}" class="${cls}">⬇ ${fmt(label)}</a>`;
      } else if (isCarrierUrl(href)) {
        // Off-site carrier tracking — open in a new tab.
        out += `<a href="${escAttr(href)}" target="_blank" rel="noopener noreferrer nofollow" class="${cls}">${fmt(label)}</a>`;
      } else {
        out += fmt(m[0]); // not a safe link — keep it literal
      }
      last = linkRe.lastIndex;
    }
    out += fmt(s.slice(last));
    return out;
  };

  const lines = text.split("\n");
  const html: string[] = [];
  let inList = false;
  for (const line of lines) {
    const bullet = line.match(/^\s*[-•]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        html.push('<ul class="my-1 list-disc space-y-0.5 pl-4">');
        inList = true;
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
    } else {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      if (line.trim()) html.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) html.push("</ul>");
  return html.join("");
}

/**
 * `open` is controlled by the portal layout so the mobile menu can open the
 * assistant too (and so the floating launcher can hide while that menu is up).
 */
export default function AssistantWidget({
  open,
  onOpenChange,
  showLauncher = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showLauncher?: boolean;
}) {
  const setOpen = onOpenChange;
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A reply landed while the panel was closed — the launcher shows it.
  const [hasUnread, setHasUnread] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Read the latest `open` inside the async send() closure without stale capture.
  const openRef = useRef(open);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  // Opening the panel clears the "reply waiting" notification.
  useEffect(() => {
    openRef.current = open;
    if (open) {
      setHasUnread(false);
      inputRef.current?.focus();
    }
  }, [open]);

  /* Create/resume the audio context during a user gesture (the send click) so
     the chime is allowed to play later, when the reply arrives — by then we're
     outside any gesture and a fresh context would be blocked by autoplay policy. */
  function unlockAudio() {
    if (typeof window === "undefined") return;
    if (!audioRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctx) audioRef.current = new Ctx();
    }
    audioRef.current?.resume().catch(() => {});
  }

  /** A short two-note rising chime, synthesized (no asset). Best-effort. */
  function playChime() {
    const ctx = audioRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const [i, freq] of [660, 880].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  /* Links in replies are real anchors (dangerouslySetInnerHTML). Intercept the
     two safe shapes renderMarkdown allows:
     - export links (/api/portal/…/export) → authenticated blob download; a plain
       anchor GET wouldn't carry the Bearer token, so portalDownload does it.
     - page links (/portal…) → client-side nav, so the layout (and this widget +
       its conversation) stays mounted and the chat is still here on return. */
  function onTranscriptClick(e: React.MouseEvent) {
    const anchor = (e.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (!href) return;

    if (href.startsWith("/api/portal/")) {
      e.preventDefault();
      const report = new URLSearchParams(href.split("?")[1] ?? "").get("report");
      const base = report ?? href.split("?")[0].split("/").filter(Boolean).slice(-2, -1)[0] ?? "export";
      const date = new Date().toISOString().slice(0, 10);
      portalDownload(href, `${base}_${date}.xlsx`).catch((err) =>
        setError(err instanceof Error ? err.message : "Couldn't download that."),
      );
      return;
    }

    if (href.startsWith("/portal")) {
      e.preventDefault();
      setOpen(false);
      router.push(href);
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    unlockAudio(); // while we still have the click gesture
    setError(null);
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setBusy(true);
    try {
      const { reply } = await portalPost<{ reply: string }>("/api/portal/assistant", {
        messages: next,
      });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      // Closed the panel while it was thinking? Signal the reply is waiting.
      if (!openRef.current) {
        setHasUnread(true);
        playChime();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Launcher — turns gold with a pinging dot when a reply arrived while
          the panel was closed. */}
      {!open && showLauncher && (
        <button
          onClick={() => setOpen(true)}
          aria-label={hasUnread ? "Open assistant — new reply" : "Open assistant"}
          className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium shadow-lg ring-1 transition ${
            hasUnread
              ? "bg-accent-500 text-brand-900 ring-accent-600/20 hover:bg-accent-400"
              : "bg-brand-700 text-white ring-brand-900/10 hover:bg-brand-600"
          }`}
        >
          {hasUnread && (
            <span className="absolute -right-1 -top-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-500 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-accent-600 ring-2 ring-surface" />
            </span>
          )}
          <Sparkles size={17} />
          <span className="hidden sm:inline">
            {hasUnread ? "New reply" : "Ask the assistant"}
          </span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-40 sm:inset-x-auto sm:bottom-5 sm:right-5">
          <div className="flex h-[80vh] w-full flex-col overflow-hidden border border-line bg-surface shadow-overlay sm:h-[560px] sm:w-[400px] sm:rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                  <Bot size={17} />
                </span>
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-ink">Rep Assistant</div>
                  <div className="text-xs text-ink-muted">Your agency&apos;s sales, customers &amp; orders</div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="rounded-lg p-1.5 text-ink-muted transition hover:bg-surface-muted hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            {/* Transcript */}
            <div
              ref={scrollRef}
              onClick={onTranscriptClick}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            >
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-ink-secondary">
                    Ask me anything about your accounts. For example:
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
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-700 px-3 py-2 text-sm text-white">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start">
                    <div
                      className="max-w-[90%] space-y-1 rounded-2xl rounded-bl-sm bg-surface-muted px-3 py-2 text-sm text-ink [&_strong]:font-semibold"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                    />
                  </div>
                ),
              )}

              {busy && (
                <div className="flex justify-start">
                  <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-surface-muted px-3 py-3">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted" />
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-line bg-surface px-3 py-3">
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
                  placeholder="Ask about your sales, customers, or orders…"
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
                Reads your agency&apos;s data only · can look things up, not place orders
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
