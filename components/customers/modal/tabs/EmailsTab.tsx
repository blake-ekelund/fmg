"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import ThreadChatView, {
  formatWhen,
  stripQuotedReply,
  type ThreadRow,
} from "@/components/email/ThreadChatView";

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
  const [activeThread, setActiveThread] = useState<ThreadRow | null>(null);

  const reloadThreads = useCallback(async () => {
    const { data } = await supabase
      .from("email_threads")
      .select(
        "id, conversation_id, subject, last_message_at, last_direction, last_preview, message_count, unread_count",
      )
      .eq("customer_type", customerType)
      .eq("customer_ref", customerId)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    setThreads((data as ThreadRow[]) ?? []);
  }, [customerId, customerType]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await reloadThreads();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadThreads]);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-gray-400 inline-flex items-center gap-2 justify-center w-full">
        <Loader2 size={14} className="animate-spin" />
        Loading email history…
      </div>
    );
  }

  if (activeThread) {
    return (
      <div className="h-[60vh] min-h-[400px]">
        <ThreadChatView
          thread={activeThread}
          onBack={async () => {
            await reloadThreads();
            setActiveThread(null);
          }}
          onSentReply={() => reloadThreads()}
        />
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
      {threads.map((t) => (
        <button
          key={t.id}
          onClick={() => setActiveThread(t)}
          className="w-full flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50 transition text-left"
        >
          <div
            className={clsx(
              "shrink-0 mt-0.5 h-8 w-8 rounded-full flex items-center justify-center",
              t.unread_count > 0
                ? "bg-blue-100 text-blue-700"
                : t.last_direction === "received"
                ? "bg-gray-100 text-gray-500"
                : "bg-gray-100 text-gray-400",
            )}
          >
            <Mail size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div
                className={clsx(
                  "text-sm truncate",
                  t.unread_count > 0 ? "font-semibold text-gray-900" : "font-medium text-gray-800",
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
            {t.last_preview && (() => {
              const cleaned = stripQuotedReply(t.last_preview);
              return cleaned ? (
                <div className="text-xs text-gray-500 truncate mt-0.5">{cleaned}</div>
              ) : (
                <div className="text-xs text-gray-300 italic mt-0.5">(quoted reply only)</div>
              );
            })()}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] text-gray-400 tabular-nums">
              {t.last_message_at ? formatWhen(new Date(t.last_message_at)) : ""}
            </div>
            <div className="text-[10px] text-gray-400">
              {t.message_count} message{t.message_count === 1 ? "" : "s"}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
