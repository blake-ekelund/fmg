"use client";

import {
  Boxes,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  CalendarClock,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import { nextSyncLabel } from "@/lib/integrations";

export type Feed = {
  key: "sales" | "inventory";
  title: string;
  scheduleLabel: string;
  frequency: string;
  hoursEt: number[];
  syncPath: string;
  lastSync: {
    at: string;
    status: "complete" | "processing" | "failed";
    error: string | null;
    summary: string;
  } | null;
  lastSuccessAt: string | null;
};

export type FishbowlStatus = {
  configured: boolean;
  feeds: Feed[];
};

export type SyncMessage = { key: string; kind: "ok" | "error"; text: string };

const FEED_ICON: Record<Feed["key"], LucideIcon> = {
  sales: ShoppingCart,
  inventory: Boxes,
};

export default function FishbowlCard({
  status,
  syncingKey,
  onSync,
  syncMessage,
}: {
  status: FishbowlStatus;
  syncingKey: string | null;
  onSync: (feed: Feed) => void;
  syncMessage: SyncMessage | null;
}) {
  const { configured, feeds } = status;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Integration header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Boxes size={22} />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-gray-900">Fishbowl</div>
            <div className="text-xs text-gray-500">Inventory &amp; ERP</div>
          </div>
        </div>
        <ConnectionPill configured={configured} />
      </div>

      {/* One block per data feed */}
      <div className="divide-y divide-gray-100">
        {feeds.map((feed) => (
          <FeedBlock
            key={feed.key}
            feed={feed}
            configured={configured}
            syncing={syncingKey === feed.key}
            syncDisabled={syncingKey != null}
            onSync={() => onSync(feed)}
            message={syncMessage?.key === feed.key ? syncMessage : null}
          />
        ))}
      </div>

      {!configured && (
        <div className="mx-5 my-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Not connected — set <code className="font-mono">FISHBOWL_API_URL</code>,{" "}
          <code className="font-mono">FISHBOWL_USER</code> and{" "}
          <code className="font-mono">FISHBOWL_PASS</code> in the environment.
        </div>
      )}
    </div>
  );
}

function FeedBlock({
  feed,
  configured,
  syncing,
  syncDisabled,
  onSync,
  message,
}: {
  feed: Feed;
  configured: boolean;
  syncing: boolean;
  syncDisabled: boolean;
  onSync: () => void;
  message: SyncMessage | null;
}) {
  const { lastSync, lastSuccessAt } = feed;
  const failed = lastSync?.status === "failed";
  const processing = lastSync?.status === "processing" || syncing;
  const Icon = FEED_ICON[feed.key];
  const next = nextSyncLabel(feed.hoursEt);

  return (
    <div className="px-5 py-4">
      {/* Feed title */}
      <div className="flex items-center gap-2 mb-1">
        <Icon size={15} className="text-gray-400" />
        <span className="text-sm font-semibold text-gray-900">{feed.title}</span>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 mt-2.5">
        <Tile label="Last pull">
          {lastSync ? (
            <>
              <div className="text-[15px] font-semibold text-gray-900">{timeAgo(lastSync.at)}</div>
              <div className="text-xs text-gray-500 mt-0.5">{fmtDateTime(lastSync.at)}</div>
            </>
          ) : (
            <div className="text-[15px] font-semibold text-gray-400">Never</div>
          )}
        </Tile>

        <Tile label="Status">
          {!lastSync ? (
            <div className="text-[15px] font-semibold text-gray-400">—</div>
          ) : processing ? (
            <StatusLine tone="gray" icon={<Loader2 size={15} className="animate-spin" />}>
              Syncing…
            </StatusLine>
          ) : failed ? (
            <>
              <StatusLine tone="red" icon={<AlertTriangle size={15} />}>
                Failed
              </StatusLine>
              {lastSuccessAt && (
                <div className="text-xs text-gray-500 mt-1">Last good: {timeAgo(lastSuccessAt)}</div>
              )}
            </>
          ) : (
            <StatusLine tone="green" icon={<CheckCircle2 size={15} />}>
              Success
            </StatusLine>
          )}
        </Tile>

        <Tile label="What we pulled">
          <div className="text-[15px] font-semibold text-gray-900">
            {lastSync ? lastSync.summary : "—"}
          </div>
        </Tile>
      </div>

      {failed && lastSync?.error && (
        <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {lastSync.error}
        </div>
      )}

      {message && (
        <div
          className={clsx(
            "mt-3 rounded-lg border px-3 py-2 text-xs",
            message.kind === "ok"
              ? "border-green-100 bg-green-50 text-green-700"
              : "border-red-100 bg-red-50 text-red-700",
          )}
        >
          {message.text}
        </div>
      )}

      {/* Schedule + Sync now */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3.5">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <CalendarClock size={14} className="text-gray-400 shrink-0" />
          <span>
            Syncs automatically {feed.frequency} · {feed.scheduleLabel}.{" "}
            <span className="text-gray-400">Next {next.label}.</span>
          </span>
        </div>
        <button
          onClick={onSync}
          disabled={!configured || syncDisabled}
          className={clsx(
            "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition shrink-0",
            "bg-gray-900 text-white hover:bg-gray-800",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
          title={configured ? `Pull ${feed.title.toLowerCase()} now` : "Connect Fishbowl first"}
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>
    </div>
  );
}

function ConnectionPill({ configured }: { configured: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium shrink-0",
        configured ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500",
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", configured ? "bg-green-500" : "bg-gray-400")} />
      {configured ? "Connected" : "Not connected"}
    </span>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function StatusLine({
  tone,
  icon,
  children,
}: {
  tone: "green" | "red" | "gray";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 text-[15px] font-semibold",
        tone === "green" && "text-green-700",
        tone === "red" && "text-red-700",
        tone === "gray" && "text-gray-600",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/* ---- small date helpers ---- */

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "—";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
