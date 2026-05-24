"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Loader2,
  Zap,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";
import AutomationEditor from "./AutomationEditor";

type Automation = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger_type: "status_change" | "order_event" | "date" | "manual";
  trigger_config: Record<string, unknown>;
  sender_user_id: string | null;
  step_count: number;
  enrollment_count: number;
  updated_at: string;
};

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/automations", { headers: await authHeader() });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setAutomations(json.automations as Automation[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // Auto-select the first automation once loaded.
  useEffect(() => {
    if (!activeId && automations.length > 0) {
      setActiveId(automations[0].id);
    }
  }, [activeId, automations]);

  async function createNew() {
    setError(null);
    const res = await fetch("/api/automations", {
      method: "POST",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New automation",
        trigger_type: "d2c_at_risk",
        trigger_config: { days_inactive: 180, lookback_days: 30 },
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error ?? `Create failed (${res.status})`);
      return;
    }
    await reload();
    setActiveId(json.automation.id);
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Triggered email sequences. Each step picks a saved template + delay.
            Runs daily at 14:00 UTC.
          </p>
        </div>
        <button
          onClick={createNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3.5 py-2 text-xs font-medium hover:bg-gray-800 transition"
        >
          <Plus size={13} />
          New automation
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 inline-flex items-start gap-2 mb-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {banner && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 inline-flex items-center gap-2 mb-3">
          <CheckCircle2 size={14} />
          {banner}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* List */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400 inline-flex items-center gap-2 justify-center w-full">
              <Loader2 size={14} className="animate-spin" />
              Loading…
            </div>
          ) : automations.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Zap size={24} className="mx-auto text-gray-300 mb-2" />
              <div className="text-sm font-medium text-gray-500">No automations yet</div>
              <p className="text-xs text-gray-400 mt-1">
                Click <span className="font-medium">New automation</span> to create one.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {automations.map((a) => {
                const isActive = activeId === a.id;
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => setActiveId(a.id)}
                      className={clsx(
                        "w-full text-left px-4 py-3 hover:bg-gray-50 transition",
                        isActive && "bg-gray-50",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-800 truncate flex-1">
                          {a.name}
                        </div>
                        <span
                          className={clsx(
                            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0",
                            a.enabled
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500",
                          )}
                        >
                          {a.enabled ? "Live" : "Paused"}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 truncate leading-relaxed">
                        {plainDescription(a)}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1">
                        {a.enrollment_count > 0
                          ? `${a.enrollment_count} customer${a.enrollment_count === 1 ? "" : "s"} in flow`
                          : "Nothing in flow yet"}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Editor */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col min-h-0">
          {activeId ? (
            <AutomationEditor
              key={activeId}
              automationId={activeId}
              onChanged={async () => {
                await reload();
              }}
              onDeleted={async () => {
                await reload();
                setActiveId(null);
                setBanner("Automation deleted.");
                setTimeout(() => setBanner(null), 2500);
              }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-center px-6 py-10">
              <div>
                <Zap size={28} className="mx-auto text-gray-300 mb-3" />
                <div className="text-sm font-medium text-gray-500">
                  Pick an automation on the left
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Or click <span className="font-medium">New automation</span> to create one.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function plainDescription(a: Automation): string {
  const steps = a.step_count;
  const stepPart =
    steps === 0 ? "no emails yet" : `${steps} email${steps === 1 ? "" : "s"}`;
  const cfg = a.trigger_config as Record<string, unknown> | undefined;
  const audienceLabel = audienceText((cfg?.audience as string) ?? "d2c");

  switch (a.trigger_type) {
    case "status_change": {
      const target = (cfg?.status_target as string) ?? "at_risk";
      const label = target === "churned" ? "Churned" : "At Risk";
      return `${audienceLabel} → becomes ${label} · ${stepPart}`;
    }
    case "order_event": {
      const subtype = (cfg?.order_event_type as string) ?? "first";
      const daysAfter = cfg?.days_after as number | undefined;
      const which = subtype === "last" ? "last order" : "first order";
      return `${audienceLabel} → ${prettyDays(daysAfter)} after ${which} · ${stepPart}`;
    }
    case "date": {
      const date = cfg?.scheduled_at as string | undefined;
      const recurring = (cfg?.recurring as string) ?? "none";
      const dateLabel = date
        ? new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "(no date set)";
      const recurLabel =
        recurring === "weekly"
          ? "weekly"
          : recurring === "monthly"
            ? "monthly"
            : recurring === "quarterly"
              ? "quarterly"
              : recurring === "annually"
                ? "yearly"
                : "one-time";
      return `${audienceLabel} → ${recurLabel}, starting ${dateLabel} · ${stepPart}`;
    }
    case "manual":
      return `${audienceLabel} → manually added · ${stepPart}`;
    default:
      return stepPart;
  }
}

function audienceText(aud: string): string {
  if (aud === "wholesale") return "Wholesale";
  if (aud === "both") return "All customers";
  return "D2C";
}

function prettyDays(d: number | undefined): string {
  if (!d) return "180 days";
  if (d === 365) return "1 year";
  if (d === 180) return "6 months";
  if (d === 90) return "3 months";
  if (d === 30) return "30 days";
  return `${d} days`;
}
