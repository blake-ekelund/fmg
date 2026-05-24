"use client";

/**
 * Drill-in chat view for a single email thread.
 *
 * Used by the customer-detail Emails tab and by the dedicated /inbox pages.
 * The thread row + an optional "back" handler are the only inputs; everything
 * else (messages, reply composer, sender labels) is self-contained.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Loader2,
  MousePointerClick,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import { supabaseBrowser } from "@/lib/supabase/browser";

/* ─── Types ───────────────────────────────────────────────────────────────── */

export type ThreadRow = {
  id: string;
  conversation_id: string;
  subject: string | null;
  last_message_at: string | null;
  last_direction: "sent" | "received" | null;
  last_preview: string | null;
  message_count: number;
  unread_count: number;
  /** Present on inbox queries; absent on customer-tab queries. */
  customer_type?: "wholesale" | "d2c" | null;
  customer_ref?: string | null;
  customer_name?: string | null;
};

export type MessageRow = {
  id: string;
  direction: "sent" | "received";
  from_address: string | null;
  from_name: string | null;
  to_addresses: Array<{ address: string; name?: string | null }>;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  body_preview: string | null;
  has_attachments: boolean;
  sent_at: string | null;
  received_at: string | null;
  open_count: number | null;
  distinct_open_count: number | null;
  last_opened_at: string | null;
  link_click_count: number | null;
};

type AttachmentDraft = {
  name: string;
  contentType: string;
  size: number;
  /** Raw base64 (no data URL prefix). */
  contentBytes: string;
};

const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ─── Main component ──────────────────────────────────────────────────────── */

type Props = {
  thread: ThreadRow;
  onBack?: () => void | Promise<void>;
  onSentReply?: () => void | Promise<void>;
  /** Override the back-button label (defaults to "Threads"). */
  backLabel?: string;
  /** Show a customer chip beneath the subject in the header. */
  showCustomer?: boolean;
};

export default function ThreadChatView({
  thread,
  onBack,
  onSentReply,
  backLabel = "Threads",
  showCustomer = false,
}: Props) {
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("email_messages")
      .select(
        "id, direction, from_address, from_name, to_addresses, subject, body_text, body_html, body_preview, has_attachments, sent_at, received_at, open_count, distinct_open_count, last_opened_at, link_click_count",
      )
      .eq("thread_id", thread.id)
      .order("sent_at", { ascending: true, nullsFirst: true })
      .order("received_at", { ascending: true });
    setMessages((data as MessageRow[]) ?? []);
  }, [thread.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Mark received messages as read once we open the thread.
  useEffect(() => {
    if (!messages) return;
    const unreadIds = messages
      .filter((m) => m.direction === "received")
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    supabase
      .from("email_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds)
      .is("read_at", null)
      .then(() => null);
  }, [messages]);

  // Auto-scroll to bottom when new messages render.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages?.length]);

  if (messages === null) {
    return (
      <div className="py-12 text-center text-sm text-gray-400 inline-flex items-center gap-2 justify-center w-full">
        <Loader2 size={14} className="animate-spin" />
        Loading conversation…
      </div>
    );
  }

  const grouped = groupByDay(messages);

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-gray-100 shrink-0">
        {onBack && (
          <>
            <button
              onClick={() => onBack()}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition"
            >
              <ArrowLeft size={14} />
              {backLabel}
            </button>
            <div className="w-px h-4 bg-gray-200" />
          </>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">
            {thread.subject || "(no subject)"}
          </div>
          <div className="text-[11px] text-gray-400 flex items-center gap-2">
            {showCustomer && thread.customer_name && (
              <>
                <span className="text-gray-600">{thread.customer_name}</span>
                <span>·</span>
              </>
            )}
            <span>
              {messages.length} message{messages.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4">
        {grouped.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-8">No messages yet.</div>
        ) : (
          grouped.map((day) => (
            <div key={day.label} className="space-y-2">
              <div className="text-center text-[10px] uppercase tracking-wider text-gray-400">
                {day.label}
              </div>
              {day.messages.map((m, i) => {
                const prev = i > 0 ? day.messages[i - 1] : null;
                const continuation = prev?.direction === m.direction;
                return <ChatBubble key={m.id} message={m} continuation={continuation} />;
              })}
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <ReplyComposer
        threadId={thread.id}
        onSent={async () => {
          await reload();
          if (onSentReply) await onSentReply();
        }}
      />
    </div>
  );
}

/* ─── ChatBubble ──────────────────────────────────────────────────────────── */

function ChatBubble({
  message,
  continuation,
}: {
  message: MessageRow;
  continuation: boolean;
}) {
  const isSent = message.direction === "sent";
  const ts = message.received_at || message.sent_at;
  const rawBody =
    message.body_text || stripHtml(message.body_html) || message.body_preview || "";
  const stripped = stripQuotedReply(rawBody);
  const body = stripped || (rawBody ? "(quoted reply only)" : "(no body)");
  const senderLabel = isSent ? "You" : message.from_name || message.from_address || "Sender";

  return (
    <div className={clsx("flex", isSent ? "justify-end" : "justify-start")}>
      <div className={clsx("max-w-[78%] flex flex-col", isSent ? "items-end" : "items-start")}>
        {!continuation && (
          <div className="text-[10px] text-gray-400 mb-1 px-1">{senderLabel}</div>
        )}
        <div
          className={clsx(
            "rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap break-words",
            isSent
              ? "bg-gray-900 text-white rounded-br-md"
              : "bg-gray-100 text-gray-800 rounded-bl-md",
          )}
        >
          {body || "(no body)"}
          {message.has_attachments && (
            <div
              className={clsx(
                "mt-1.5 text-[10px] inline-flex items-center gap-1 opacity-80",
                isSent ? "text-gray-300" : "text-gray-500",
              )}
            >
              <Paperclip size={10} />
              attachment
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5 px-1 tabular-nums">
          <span>{ts ? formatTime(ts) : ""}</span>
          {isSent && (
            <SentTrackingMeta
              opens={message.distinct_open_count ?? 0}
              rawOpens={message.open_count ?? 0}
              lastOpenedAt={message.last_opened_at}
              clicks={message.link_click_count ?? 0}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SentTrackingMeta({
  opens,
  rawOpens,
  lastOpenedAt,
  clicks,
}: {
  opens: number;
  rawOpens: number;
  lastOpenedAt: string | null;
  clicks: number;
}) {
  if (opens === 0 && clicks === 0) {
    return <span className="text-gray-300">· not opened</span>;
  }
  const lastOpenLabel = lastOpenedAt
    ? `last ${new Date(lastOpenedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "";
  const extraNote =
    rawOpens > opens
      ? ` (${rawOpens} raw pixel fetches incl. proxy / reply-quote re-fetches)`
      : "";
  return (
    <span className="inline-flex items-center gap-2">
      {opens > 0 && (
        <span
          className="inline-flex items-center gap-0.5 text-gray-500"
          title={`Opened by ${opens} distinct recipient${opens === 1 ? "" : "s"}${extraNote}. ${lastOpenLabel}. Apple Mail Privacy can pre-fetch on delivery, so the first signal may not be a real read.`}
        >
          <Eye size={10} />
          {opens}
        </span>
      )}
      {clicks > 0 && (
        <span
          className="inline-flex items-center gap-0.5 text-blue-600"
          title={`${clicks} link click${clicks === 1 ? "" : "s"} — reliable intent signal.`}
        >
          <MousePointerClick size={10} />
          {clicks}
        </span>
      )}
    </span>
  );
}

/* ─── ReplyComposer ──────────────────────────────────────────────────────── */

function ReplyComposer({
  threadId,
  onSent,
}: {
  threadId: string;
  onSent: () => void;
}) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const totalBytes = useMemo(
    () => attachments.reduce((s, a) => s + a.size, 0),
    [attachments],
  );

  async function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const next: AttachmentDraft[] = [...attachments];
    for (const f of files) {
      if (totalBytes + f.size > MAX_TOTAL_BYTES) {
        setError(
          `Attachment "${f.name}" pushes you over the 3 MB total cap (currently ${(totalBytes / 1024 / 1024).toFixed(1)} MB).`,
        );
        break;
      }
      const buf = await f.arrayBuffer();
      const b64 = base64FromBuffer(buf);
      next.push({
        name: f.name,
        contentType: f.type || "application/octet-stream",
        size: f.size,
        contentBytes: b64,
      });
    }
    setAttachments(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  function removeAttachment(idx: number) {
    setAttachments((cur) => cur.filter((_, i) => i !== idx));
  }

  async function send() {
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    setJustSent(false);
    try {
      const res = await fetch("/api/email/reply", {
        method: "POST",
        headers: {
          ...(await authHeader()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          thread_id: threadId,
          body,
          attachments: attachments.map((a) => ({
            name: a.name,
            contentType: a.contentType,
            contentBytes: a.contentBytes,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
      } else {
        setBody("");
        setAttachments([]);
        setJustSent(true);
        setTimeout(() => setJustSent(false), 2500);
        onSent();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="border-t border-gray-100 pt-3 space-y-2 shrink-0">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] text-red-700">
          {error}
        </div>
      )}
      {justSent && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-[11px] text-green-700 inline-flex items-center gap-1.5">
          <CheckCircle2 size={12} />
          Reply sent.
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((a, i) => (
            <div
              key={`${a.name}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-[11px] text-gray-700"
            >
              <Paperclip size={10} />
              <span className="truncate max-w-[160px]">{a.name}</span>
              <span className="text-gray-400">{formatBytes(a.size)}</span>
              <button
                onClick={() => removeAttachment(i)}
                className="text-gray-400 hover:text-red-500 transition"
                title="Remove"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          <div className="text-[10px] text-gray-400 self-center">
            {formatBytes(totalBytes)} / 3 MB total
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a reply… (Ctrl+Enter to send)"
          rows={2}
          className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
        />
        <div className="flex flex-col gap-1">
          <input
            ref={fileInput}
            type="file"
            multiple
            onChange={pickFiles}
            className="hidden"
          />
          <button
            onClick={() => fileInput.current?.click()}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition"
            title="Attach files"
          >
            <Paperclip size={14} />
          </button>
          <button
            onClick={send}
            disabled={!body.trim() || sending}
            className="p-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition disabled:opacity-40"
            title="Send (Ctrl+Enter)"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers (also exported for thread-list previews) ───────────────────── */

type DayGroup = { label: string; messages: MessageRow[] };

function groupByDay(messages: MessageRow[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const m of messages) {
    const ts = m.received_at || m.sent_at;
    const label = ts ? formatDay(new Date(ts)) : "";
    const last = out[out.length - 1];
    if (last && last.label === label) {
      last.messages.push(m);
    } else {
      out.push({ label, messages: [m] });
    }
  }
  return out;
}

function formatDay(d: Date): string {
  const today = new Date();
  const diffDays = Math.floor(
    (today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(s: string): string {
  return new Date(s).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatWhen(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diffMs < 7 * day) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function stripHtml(html: string | null): string {
  if (!html) return "";
  const cleaned = html
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(
      /<div[^>]*class=["'][^"']*gmail_quote[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
      "",
    );
  return cleaned
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function stripQuotedReply(text: string): string {
  if (!text) return text;
  const markers: RegExp[] = [
    /On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?\b[\s\S]{0,200}?wrote:/i,
    /On\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}[\s\S]{0,200}?wrote:/i,
    /_{3,}\s*From:\s+/i,
    /-+\s*Original Message\s*-+/i,
    /\bFrom:\s+[\s\S]{0,200}?Sent:\s+/i,
    /(?:^|\n)>\s*On\s+/,
  ];

  let earliest = -1;
  for (const re of markers) {
    const m = text.search(re);
    if (m >= 0 && (earliest === -1 || m < earliest)) earliest = m;
  }
  if (earliest < 0) return text.trim();
  return text.slice(0, earliest).replace(/[\s_]+$/, "").trim();
}

function base64FromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)) as unknown as number[],
    );
  }
  return btoa(binary);
}
