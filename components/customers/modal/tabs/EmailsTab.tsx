"use client";

import { useEffect, useState } from "react";
import { Mail, MailOpen, ChevronRight, ChevronDown, Send, Inbox, Loader2 } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

type ThreadRow = {
  id: string;
  conversation_id: string;
  subject: string | null;
  last_message_at: string | null;
  last_direction: "sent" | "received" | null;
  last_preview: string | null;
  message_count: number;
  unread_count: number;
};

type MessageRow = {
  id: string;
  direction: "sent" | "received";
  from_address: string | null;
  from_name: string | null;
  to_addresses: Array<{ address: string; name?: string | null }>;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  body_preview: string | null;
  sent_at: string | null;
  received_at: string | null;
};

export default function EmailsTab({
  customerId,
  isD2C,
}: {
  customerId: string;
  isD2C: boolean;
}) {
  const customerType: "wholesale" | "d2c" = isD2C ? "d2c" : "wholesale";
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, MessageRow[]>>({});
  const [loadingMessages, setLoadingMessages] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("email_threads")
        .select(
          "id, conversation_id, subject, last_message_at, last_direction, last_preview, message_count, unread_count",
        )
        .eq("customer_type", customerType)
        .eq("customer_ref", customerId)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (!cancelled) {
        setThreads((data as ThreadRow[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, customerType]);

  async function toggleThread(threadId: string) {
    if (expanded === threadId) {
      setExpanded(null);
      return;
    }
    setExpanded(threadId);
    if (messages[threadId]) return; // already loaded

    setLoadingMessages(threadId);
    const { data } = await supabase
      .from("email_messages")
      .select(
        "id, direction, from_address, from_name, to_addresses, subject, body_text, body_html, body_preview, sent_at, received_at",
      )
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: true, nullsFirst: true })
      .order("received_at", { ascending: true });

    setMessages((prev) => ({ ...prev, [threadId]: (data as MessageRow[]) ?? [] }));

    // Mark any unread received messages as read on the server too.
    const unreadIds = ((data as MessageRow[] | null) ?? [])
      .filter((m) => m.direction === "received")
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      // The trigger we wrote (email_messages_after_update) will decrement unread_count.
      await supabase
        .from("email_messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds)
        .is("read_at", null);
    }
    setLoadingMessages(null);
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-gray-400 inline-flex items-center gap-2 justify-center w-full">
        <Loader2 size={14} className="animate-spin" />
        Loading email history…
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="py-12 text-center">
        <Mail size={28} className="mx-auto text-gray-300 mb-3" />
        <div className="text-sm font-medium text-gray-500">No emails yet</div>
        <p className="text-xs text-gray-400 mt-1">
          When you send an email to this customer from the portal, or they reply to one,
          it&apos;ll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {threads.map((t) => {
        const isOpen = expanded === t.id;
        const ts = t.last_message_at ? new Date(t.last_message_at) : null;
        return (
          <div
            key={t.id}
            className="rounded-xl border border-gray-200 bg-white overflow-hidden"
          >
            <button
              onClick={() => toggleThread(t.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-left"
            >
              <div className="shrink-0">
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
              <div className="shrink-0">
                {t.last_direction === "received" ? (
                  t.unread_count > 0 ? (
                    <Mail size={14} className="text-blue-600" />
                  ) : (
                    <Inbox size={14} className="text-gray-400" />
                  )
                ) : (
                  <Send size={14} className="text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div
                    className={clsx(
                      "text-sm truncate",
                      t.unread_count > 0 ? "font-semibold text-gray-900" : "font-medium text-gray-700",
                    )}
                  >
                    {t.subject || "(no subject)"}
                  </div>
                  {t.unread_count > 0 && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-medium">
                      {t.unread_count} new
                    </span>
                  )}
                </div>
                {t.last_preview && (
                  <div className="text-xs text-gray-500 truncate mt-0.5">{t.last_preview}</div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[11px] text-gray-400 tabular-nums">
                  {ts ? formatWhen(ts) : ""}
                </div>
                <div className="text-[10px] text-gray-400">
                  {t.message_count} message{t.message_count === 1 ? "" : "s"}
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 bg-gray-50/40">
                {loadingMessages === t.id ? (
                  <div className="px-4 py-6 text-xs text-gray-400 inline-flex items-center gap-2 justify-center w-full">
                    <Loader2 size={12} className="animate-spin" />
                    Loading messages…
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {(messages[t.id] ?? []).map((m) => (
                      <li key={m.id} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {m.direction === "received" ? (
                            <MailOpen size={12} className="text-gray-400" />
                          ) : (
                            <Send size={12} className="text-gray-400" />
                          )}
                          <span className="text-xs font-medium text-gray-700">
                            {m.from_name || m.from_address || "Unknown sender"}
                          </span>
                          <span className="text-[11px] text-gray-400 ml-auto tabular-nums">
                            {formatTimestamp(m.received_at || m.sent_at)}
                          </span>
                        </div>
                        <div className="mt-1.5 text-xs text-gray-700 whitespace-pre-wrap break-words">
                          {m.body_text || stripHtml(m.body_html) || m.body_preview || "(no body)"}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatWhen(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diffMs < 7 * day) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTimestamp(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
