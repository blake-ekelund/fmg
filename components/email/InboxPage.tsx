"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Search, Loader2, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ThreadChatView, {
  formatWhen,
  stripQuotedReply,
  type ThreadRow,
} from "./ThreadChatView";
import { useMyEmailAccountId } from "./useMyEmailAccountId";

type Filter = "all" | "unread" | "sent" | "received";
type AudienceFilter = "all" | "d2c" | "wholesale";

export default function InboxPage() {
  const account = useMyEmailAccountId();
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [audience, setAudience] = useState<AudienceFilter>("all");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (account.state !== "ready") return;
    let q = supabase
      .from("email_threads")
      .select(
        "id, conversation_id, subject, last_message_at, last_direction, last_preview, message_count, unread_count, customer_type, customer_ref, customer_name",
      )
      // Scope to the current user's mailbox even though they're owner/admin
      // (RLS includes an admin override that would otherwise leak everyone's).
      .eq("account_id", account.accountId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .range(0, 499);

    if (audience !== "all") q = q.eq("customer_type", audience);
    if (filter === "unread") q = q.gt("unread_count", 0);
    if (filter === "sent") q = q.eq("last_direction", "sent");
    if (filter === "received") q = q.eq("last_direction", "received");

    const { data } = await q;
    setThreads((data as ThreadRow[]) ?? []);
  }, [account, audience, filter]);

  useEffect(() => {
    if (account.state === "loading") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [account.state, reload]);

  // Client-side search across subject + customer name + preview. Server
  // round-trip per keystroke would be wasteful — we already have all rows.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const subject = (t.subject ?? "").toLowerCase();
      const name = (t.customer_name ?? "").toLowerCase();
      const preview = (t.last_preview ?? "").toLowerCase();
      return subject.includes(q) || name.includes(q) || preview.includes(q);
    });
  }, [threads, search]);

  const activeThread = filtered.find((t) => t.id === activeId) ?? null;
  const unreadTotal = threads.reduce((s, t) => s + (t.unread_count || 0), 0);

  return (
    <div className="px-4 md:px-8 py-4 md:py-5 space-y-3">
      {account.state === "no-account" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 inline-flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Connect your Outlook mailbox in{" "}
            <Link
              href="/settings?section=email-connection"
              className="underline font-medium hover:text-amber-900"
            >
              Settings → Email connection
            </Link>{" "}
            to see your customer email here.
          </span>
        </div>
      )}

      {/* Single toolbar row: search + audience + status filters + stats */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject, customer, preview…"
            className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        {/* Audience segmented */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
          <Pill
            label="All customers"
            active={audience === "all"}
            onClick={() => setAudience("all")}
          />
          <Pill
            label="D2C"
            active={audience === "d2c"}
            onClick={() => setAudience("d2c")}
          />
          <Pill
            label="Wholesale"
            active={audience === "wholesale"}
            onClick={() => setAudience("wholesale")}
          />
        </div>

        {/* Status segmented */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
          <Pill
            label="All"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <Pill
            label="Unread"
            active={filter === "unread"}
            onClick={() => setFilter("unread")}
          />
          <Pill
            label="Received"
            active={filter === "received"}
            onClick={() => setFilter("received")}
          />
          <Pill
            label="Sent"
            active={filter === "sent"}
            onClick={() => setFilter("sent")}
          />
        </div>

        {/* Stats */}
        {account.state === "ready" && (
          <div className="ml-auto text-xs text-gray-500 tabular-nums">
            {threads.length.toLocaleString()} thread
            {threads.length === 1 ? "" : "s"}
            {unreadTotal > 0 && (
              <>
                {" · "}
                <span className="text-blue-600 font-medium">
                  {unreadTotal} unread
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Two-pane layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 h-[calc(100vh-150px)] min-h-[500px]">
        {/* Thread list */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400 inline-flex items-center gap-2 justify-center w-full">
              <Loader2 size={14} className="animate-spin" />
              Loading threads…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400 px-4">
              {search ? "No threads match your search." : "No threads yet."}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((t) => {
                const isActive = activeId === t.id;
                const ts = t.last_message_at ? new Date(t.last_message_at) : null;
                const previewClean = stripQuotedReply(t.last_preview ?? "");
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setActiveId(t.id)}
                      className={clsx(
                        "w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-start gap-3",
                        isActive && "bg-gray-50",
                      )}
                    >
                      <div
                        className={clsx(
                          "shrink-0 mt-0.5 h-8 w-8 rounded-full flex items-center justify-center",
                          t.unread_count > 0
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-400",
                        )}
                      >
                        <Mail size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <div
                            className={clsx(
                              "text-sm truncate",
                              t.unread_count > 0
                                ? "font-semibold text-gray-900"
                                : "font-medium text-gray-800",
                            )}
                          >
                            {t.customer_name || "(no customer)"}
                          </div>
                          <div className="text-[10px] text-gray-400 tabular-nums shrink-0">
                            {ts ? formatWhen(ts) : ""}
                          </div>
                        </div>
                        <div className="text-xs text-gray-700 truncate mt-0.5">
                          {t.subject || "(no subject)"}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate mt-0.5">
                          {previewClean ||
                            (t.last_preview ? "(quoted reply only)" : "—")}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                          <span>
                            {t.message_count} msg{t.message_count === 1 ? "" : "s"}
                          </span>
                          {t.unread_count > 0 && (
                            <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 font-medium">
                              {t.unread_count} new
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right pane: chat view or empty state */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col min-h-0">
          {activeThread ? (
            <ThreadChatView
              thread={activeThread}
              showCustomer
              onSentReply={reload}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-center px-6">
              <div>
                <Mail size={28} className="mx-auto text-gray-300 mb-3" />
                <div className="text-sm font-medium text-gray-500">
                  Pick a thread on the left
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Or use search to jump to a customer or subject.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "px-3 py-1.5 rounded-md text-xs font-medium transition",
        active ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900",
      )}
    >
      {label}
    </button>
  );
}
