"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ListTodo, Boxes, ShoppingBag, Star, Loader2 } from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Top-bar notification bell. Aggregates live "needs you" items from
 * /api/notifications — the user's due/overdue tasks, understock/overstock asks,
 * recent orders, and reviews awaiting moderation (each toggled in Settings →
 * Notifications). The badge counts new orders + reviews since the bell was last
 * opened; opening it marks them seen.
 */

type NotifType = "task" | "inventory" | "order" | "review";

type NotificationItem = {
  id: string;
  type: NotifType;
  title: string;
  subtitle: string;
  href: string;
  ts: string | null;
  unread: boolean;
};

type Payload = { items: NotificationItem[]; unreadCount: number };

const POLL_MS = 60_000;

const ICON: Record<NotifType, React.ReactNode> = {
  task: <ListTodo size={15} />,
  inventory: <Boxes size={15} />,
  order: <ShoppingBag size={15} />,
  review: <Star size={15} />,
};

const TONE: Record<NotifType, string> = {
  task: "bg-amber-50 text-amber-600",
  inventory: "bg-violet-50 text-violet-600",
  order: "bg-blue-50 text-blue-600",
  review: "bg-emerald-50 text-emerald-600",
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** "2:14 PM", "Yesterday", "Mon", "Oct 3", or "" for standing items. */
function when(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const days = Math.floor(
    (new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000,
  );
  if (days <= 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { headers: await authHeader(), cache: "no-store" });
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const j = (await res.json()) as Payload;
      setData(j);
    } catch {
      /* the bell is best-effort — stay quiet on failure */
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling while mounted.
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    // Opening marks the current new items as seen — clear the badge optimistically.
    if (next && data && data.unreadCount > 0) {
      setData({ ...data, unreadCount: 0 });
      try {
        await fetch("/api/notifications", { method: "PATCH", headers: await authHeader() });
      } catch {
        /* ignore — next poll reconciles */
      }
    }
  }

  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition"
        aria-label={unread > 0 ? `Notifications — ${unread} new` : "Notifications"}
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-surface">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-overlay z-40">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {loading && <Loader2 size={13} className="animate-spin text-ink-subtle" />}
          </div>

          <div className="max-h-[22rem] overflow-y-auto py-1">
            {items.length === 0 ? (
              <div className="px-3.5 py-8 text-center text-xs text-ink-muted">
                {loading ? "Loading…" : "You're all caught up."}
              </div>
            ) : (
              items.map((it) => (
                <Link
                  key={it.id}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-3.5 py-2.5 transition hover:bg-surface-muted"
                >
                  <span
                    className={clsx(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      TONE[it.type],
                    )}
                  >
                    {ICON[it.type]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-ink">{it.title}</span>
                      {it.unread && it.type !== "inventory" && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-600" />
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-ink-muted">{it.subtitle}</span>
                  </span>
                  {when(it.ts) && (
                    <span className="mt-0.5 shrink-0 text-[10.5px] text-ink-subtle">{when(it.ts)}</span>
                  )}
                </Link>
              ))
            )}
          </div>

          <Link
            href="/settings?section=notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-3.5 py-2 text-center text-[11px] font-medium text-ink-muted transition hover:bg-surface-muted hover:text-ink"
          >
            Notification settings
          </Link>
        </div>
      )}
    </div>
  );
}
