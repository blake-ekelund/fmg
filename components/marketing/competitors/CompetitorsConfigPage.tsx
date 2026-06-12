"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Sparkles,
  Play,
  RefreshCw,
  AlertTriangle,
  Download,
  Clock,
  Terminal,
  Copy as CopyIcon,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import type { Competitor, ScrapeRun } from "./types";

type RunResult =
  | {
      kind: "success";
      runId: string;
      uniqueStores: number;
      totalRequests: number;
      matchedCustomers: number;
      status: string;
    }
  | { kind: "error"; message: string }
  | { kind: "info"; message: string };

function cliCommandFor(c: Competitor): string {
  return `npm run scrape:competitors -- --competitor "${c.name}"`;
}

function isSingleCall(c: Competitor): boolean {
  return c.request_config.singleCall === true;
}

export default function CompetitorsConfigPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [runsByCompetitor, setRunsByCompetitor] = useState<Map<string, ScrapeRun[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, RunResult>>({});

  async function load() {
    setLoading(true);
    const [{ data: cData }, { data: rData }] = await Promise.all([
      supabase.from("competitors").select("*").order("name"),
      supabase
        .from("scrape_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(200),
    ]);
    setCompetitors((cData ?? []) as Competitor[]);

    const byCompetitor = new Map<string, ScrapeRun[]>();
    for (const r of (rData ?? []) as ScrapeRun[]) {
      const list = byCompetitor.get(r.competitor_id) ?? [];
      list.push(r);
      byCompetitor.set(r.competitor_id, list);
    }
    setRunsByCompetitor(byCompetitor);

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Poll every 5s while any run is in 'running' state so users see live
  // progress (grid points completed) without a manual refresh.
  useEffect(() => {
    const anyRunning = Array.from(runsByCompetitor.values())
      .some((runs) => runs.some((r) => r.status === "running"));
    if (!anyRunning) return;
    const t = setInterval(() => {
      supabase
        .from("scrape_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(200)
        .then(({ data }) => {
          if (!data) return;
          const byCompetitor = new Map<string, ScrapeRun[]>();
          for (const r of data as ScrapeRun[]) {
            const list = byCompetitor.get(r.competitor_id) ?? [];
            list.push(r);
            byCompetitor.set(r.competitor_id, list);
          }
          setRunsByCompetitor(byCompetitor);
        });
    }, 5000);
    return () => clearInterval(t);
  }, [runsByCompetitor]);

  async function toggleEnabled(c: Competitor) {
    await supabase
      .from("competitors")
      .update({ enabled: !c.enabled, updated_at: new Date().toISOString() })
      .eq("id", c.id);
    await load();
  }

  async function remove(id: string) {
    await supabase.from("competitors").delete().eq("id", id);
    setConfirmDelete(null);
    await load();
  }

  async function copyCliCommand(c: Competitor) {
    const cmd = cliCommandFor(c);
    try {
      await navigator.clipboard.writeText(cmd);
      setResults((r) => ({
        ...r,
        [c.id]: {
          kind: "info",
          message: `Copied to clipboard: ${cmd}  —  run this from a terminal in your project directory.`,
        },
      }));
    } catch {
      setResults((r) => ({
        ...r,
        [c.id]: { kind: "info", message: `Run this in your terminal: ${cmd}` },
      }));
    }
  }

  async function runNow(c: Competitor) {
    setRunning(c.id);
    setResults((r) => {
      const next = { ...r };
      delete next[c.id];
      return next;
    });
    try {
      const res = await fetch(`/api/competitors/${c.id}/scrape`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setResults((r) => ({
          ...r,
          [c.id]: { kind: "error", message: data.error ?? `HTTP ${res.status}` },
        }));
      } else {
        setResults((r) => ({
          ...r,
          [c.id]: {
            kind: "success",
            runId: data.runId,
            uniqueStores: data.uniqueStores,
            totalRequests: data.totalRequests,
            matchedCustomers: data.matchedCustomers ?? 0,
            status: data.status,
          },
        }));
        triggerCsvDownload(data.runId);
        await load();
      }
    } catch (e) {
      setResults((r) => ({ ...r, [c.id]: { kind: "error", message: String(e) } }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Competitors</h1>
          <p className="text-sm text-gray-500 mt-1">
            Scrape competitor store locators to generate a retailer prospect list.
          </p>
        </div>
        <Link
          href="/marketing/competitors/config/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition shadow-sm"
        >
          <Plus size={16} /> New Competitor
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
        </div>
      ) : competitors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed border-gray-200 bg-white/60">
          <h3 className="text-sm font-medium text-gray-700 mb-2">No competitors configured</h3>
          <Link
            href="/marketing/competitors/config/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition"
          >
            <Plus size={14} /> Add your first
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {competitors.map((c) => {
            const runs = runsByCompetitor.get(c.id) ?? [];
            const recent = runs.slice(0, 5);
            const banner = results[c.id];
            return (
              <div key={c.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4 space-y-3">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => toggleEnabled(c)}
                    className={clsx(
                      "w-9 h-9 rounded-lg flex items-center justify-center transition",
                      c.enabled ? "bg-green-100 hover:bg-green-200" : "bg-gray-100 hover:bg-gray-200",
                    )}
                    title={c.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                  >
                    {c.enabled
                      ? <CheckCircle2 size={18} className="text-green-600" />
                      : <XCircle size={18} className="text-gray-400" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-gray-900">{c.name}</div>
                      {inferPlatform(c) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-medium border border-violet-100 capitalize">
                          <Sparkles size={9} /> {inferPlatform(c)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 font-mono truncate">
                      {locatorUrl(c)}
                    </div>
                    {c.notes && <div className="text-xs text-gray-500 mt-1">{c.notes}</div>}
                  </div>

                  <div className="flex items-center gap-2">
                    {isSingleCall(c) ? (
                      <button
                        onClick={() => runNow(c)}
                        disabled={!!running}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-medium border border-violet-200 hover:bg-violet-100 transition disabled:opacity-50"
                      >
                        {running === c.id ? (
                          <>
                            <RefreshCw size={12} className="animate-spin" /> Running…
                          </>
                        ) : (
                          <>
                            <Play size={12} /> Run
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => copyCliCommand(c)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200 hover:bg-amber-100 transition"
                        title="This competitor requires a grid sweep that won't fit in a web request."
                      >
                        <Terminal size={12} /> Copy CLI cmd
                      </button>
                    )}
                    <Link
                      href={`/marketing/competitors/config/${c.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 transition"
                    >
                      <Pencil size={12} /> Edit
                    </Link>
                    {confirmDelete === c.id ? (
                      <button
                        onClick={() => remove(c.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-xs text-red-700 border border-red-200 font-medium hover:bg-red-100 transition"
                      >
                        <Trash2 size={12} /> Confirm
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(c.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-red-500 hover:bg-red-50 transition"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                </div>

                {banner && banner.kind === "success" && (
                  <div className="inline-flex items-center gap-2 flex-wrap px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs border border-green-100">
                    <CheckCircle2 size={12} />
                    <span>
                      {prospectsOf(banner)} prospects · {banner.matchedCustomers} existing customers
                      (of {banner.uniqueStores} total).
                    </span>
                    <span>CSV downloaded.</span>
                    <button
                      type="button"
                      onClick={() => triggerCsvDownload(banner.runId)}
                      className="underline font-medium hover:text-green-900"
                    >
                      Re-download
                    </button>
                  </div>
                )}
                {banner && banner.kind === "error" && (
                  <div className="inline-flex items-start gap-2 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs border border-red-100">
                    <AlertTriangle size={12} className="mt-0.5" />
                    {banner.message}
                  </div>
                )}
                {banner && banner.kind === "info" && (
                  <div className="inline-flex items-start gap-2 flex-wrap px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs border border-amber-100">
                    <CopyIcon size={12} className="mt-0.5" />
                    <span className="font-mono break-all">{banner.message}</span>
                  </div>
                )}

                {recent.length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1.5 flex items-center gap-1">
                      <Clock size={10} /> Recent runs
                    </div>
                    <div className="divide-y divide-gray-100">
                      {recent.map((r) => (
                        <RunRow key={r.id} run={r} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RunRow({ run }: { run: ScrapeRun }) {
  const cls = STATUS_STYLES[run.status] ?? STATUS_STYLES.completed;
  const isRunning = run.status === "running";
  const prospects =
    !isRunning
      ? Math.max(0, run.unique_stores - (run.matched_customers ?? 0))
      : 0;
  const canDownload = run.status !== "failed" && run.unique_stores > 0;
  const pct =
    run.grid_points > 0
      ? Math.min(100, Math.round((run.total_requests / run.grid_points) * 100))
      : 0;
  return (
    <div className="py-1.5 flex items-center gap-3 text-sm">
      <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-medium capitalize", cls.bg, cls.text)}>
        {run.status}
      </span>
      <span className="text-xs text-gray-500 w-40">{formatDate(run.started_at)}</span>
      {isRunning ? (
        <span className="flex-1 flex items-center gap-2 text-xs text-gray-600">
          <span className="w-28 tabular-nums">
            {run.total_requests.toLocaleString()} / {run.grid_points.toLocaleString()}
          </span>
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-10 text-right text-gray-400 tabular-nums">{pct}%</span>
        </span>
      ) : (
        <span className="flex-1 text-xs text-gray-600">
          <strong className="text-gray-900">{prospects}</strong> prospects ·
          {" "}
          {run.matched_customers ?? 0} existing customers
          {" "}
          <span className="text-gray-400">
            ({run.unique_stores} total, {run.total_requests} requests
            {run.error_count ? `, ${run.error_count} errors` : ""})
          </span>
        </span>
      )}
      {canDownload ? (
        <button
          type="button"
          onClick={() => triggerCsvDownload(run.id)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-gray-200 text-[11px] text-gray-700 hover:bg-gray-50 transition"
        >
          <Download size={11} /> CSV
        </button>
      ) : (
        <span className="text-[11px] text-gray-300">—</span>
      )}
    </div>
  );
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  running:   { bg: "bg-blue-100",   text: "text-blue-700" },
  completed: { bg: "bg-green-100",  text: "text-green-700" },
  failed:    { bg: "bg-red-100",    text: "text-red-700" },
  aborted:   { bg: "bg-orange-100", text: "text-orange-700" },
};

function triggerCsvDownload(runId: string) {
  const a = document.createElement("a");
  a.href = `/api/competitors/runs/${runId}/csv`;
  a.rel = "noopener";
  a.click();
}

function prospectsOf(b: { uniqueStores: number; matchedCustomers: number }): number {
  return Math.max(0, b.uniqueStores - b.matchedCustomers);
}

function inferPlatform(c: Competitor): string | null {
  const req = c.request_config as { platform?: string; latParam?: string; radiusParam?: string };
  if (req?.platform) return req.platform;
  if (req?.latParam === "lat" && req?.radiusParam === "r") return "stockist";
  return null;
}

function locatorUrl(c: Competitor): string {
  const original =
    (c.request_config as { originalLocatorUrl?: string } | null)?.originalLocatorUrl;
  return original ?? `${c.base_url}${c.endpoint_path}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
