"use client";

import { useEffect, useState } from "react";
import { MessageSquare, CheckCircle2, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Slack integration card for /integrations. Shows whether the Slack connection
 * and the assistant's LLM key are configured, plus a little recent-activity
 * summary. Read-only — connecting Slack is an env-var + Slack-app setup task,
 * so the card just reports status and points at what's missing.
 */

export type SlackStatus = {
  connected: boolean;
  assistantReady: boolean;
  lastActivityAt: string | null;
  answeredCount: number | null;
};

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function SlackCard() {
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/integrations/slack", { headers: await authHeader() });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error ?? `Failed (${res.status})`);
          return;
        }
        setStatus(json as SlackStatus);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const ready = !!status?.connected && !!status?.assistantReady;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <MessageSquare size={22} />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-gray-900">Slack</div>
            <div className="text-xs text-gray-500">AI assistant for FMG staff</div>
          </div>
        </div>
        <ConnectionPill configured={ready} />
      </div>

      <div className="px-5 py-4">
        <p className="text-sm text-gray-600">
          FMG employees can <span className="font-medium text-gray-900">@mention</span> the bot in
          Slack (or DM it) to ask about inventory, sales, customers, and reps. Only Slack users whose
          email matches an internal FMG profile get answers.
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
            Couldn’t load status: {error}
          </div>
        ) : !status ? (
          <div className="mt-4 text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            {/* Requirement checklist */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
              <Tile label="Slack connection">
                <Requirement met={status.connected}>
                  {status.connected ? "Connected" : "Not connected"}
                </Requirement>
              </Tile>
              <Tile label="Assistant (Claude)">
                <Requirement met={status.assistantReady}>
                  {status.assistantReady ? "Ready" : "No API key"}
                </Requirement>
              </Tile>
              <Tile label="Questions answered">
                <div className="text-[15px] font-semibold text-gray-900">
                  {status.answeredCount != null ? status.answeredCount.toLocaleString() : "—"}
                </div>
                {status.lastActivityAt && (
                  <div className="text-xs text-gray-500 mt-0.5">last {timeAgo(status.lastActivityAt)}</div>
                )}
              </Tile>
            </div>

            {!ready && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
                <div className="font-medium">To finish connecting:</div>
                {!status.connected && (
                  <div>
                    Set <code className="font-mono">SLACK_SIGNING_SECRET</code> and{" "}
                    <code className="font-mono">SLACK_BOT_TOKEN</code> from your Slack app.
                  </div>
                )}
                {!status.assistantReady && (
                  <div>
                    Set <code className="font-mono">ANTHROPIC_API_KEY</code> so the assistant can answer.
                  </div>
                )}
                <div>
                  Point the Slack app’s Event Subscriptions Request URL at{" "}
                  <code className="font-mono">/api/slack/events</code>.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Requirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <div
      className={clsx(
        "inline-flex items-center gap-1.5 text-[15px] font-semibold",
        met ? "text-green-700" : "text-amber-700",
      )}
    >
      {met ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
      {children}
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
      {configured ? "Connected" : "Setup needed"}
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
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
