"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Loader2,
  Zap,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
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
  /** Enrollments still moving through the sequence. */
  active_count: number;
  /** Enrollments that reached the end. */
  completed_count: number;
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
  const [query, setQuery] = useState("");

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

  /* No auto-select: cards start collapsed so the page opens on the full
     roster and its stats. The old two-pane layout had to auto-pick something
     or the right pane sat empty. */

  async function createNew() {
    setError(null);
    const res = await fetch("/api/automations", {
      method: "POST",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify({
        /* Must be one of the trigger types the editor and the cron runner both
           understand. This previously created 'd2c_at_risk' — a leftover from
           automations_v2 — which no trigger pill matched, rendered a blank
           "when to enroll" sentence, and made findTriggerCandidates() return
           zero candidates, so a brand-new automation could be switched Live and
           silently enroll nobody. */
        name: "New automation",
        trigger_type: "status_change",
        trigger_config: {
          audience: "wholesale",
          status_target: "at_risk",
          lookback_days: 30,
        },
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error ?? `Create failed (${res.status})`);
      return;
    }
    await reload();
    setActiveId(json.automation.id); // expand the new card straight away
  }

  const filtered = automations.filter((a) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${a.name} ${plainDescription(a)}`.toLowerCase().includes(q);
  });

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1000px] mx-auto">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Automations</h1>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Triggered email sequences. Each step picks a saved template + delay.
            Runs twice daily, 7:45am and 3:45pm Eastern.
          </p>
        </div>
        <button
          onClick={createNew}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-700 text-white px-3 py-2 text-[11px] font-medium hover:bg-brand-800 transition"
        >
          <Plus size={13} />
          New automation
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[11px] text-critical inline-flex items-start gap-2 mb-3">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {banner && (
        <div className="rounded-lg border border-positive/20 bg-positive-soft px-3 py-2 text-[11px] text-positive inline-flex items-center gap-2 mb-3">
          <CheckCircle2 size={13} />
          {banner}
        </div>
      )}

      {automations.length > 3 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search automations"
          className="mb-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[11px] text-ink placeholder:text-ink-subtle focus:border-brand-400 focus:outline-none sm:w-72"
        />
      )}

      {/* One card per automation, expanding in place. Replaces the list +
          detail split: every automation stays visible with its own stats, and
          there is no separate mobile master/detail mode to maintain. */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[11px] text-ink-muted">
          <Loader2 size={14} className="animate-spin" />
          Loading…
        </div>
      ) : automations.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-14 text-center shadow-card">
          <Zap size={24} className="mx-auto text-ink-subtle mb-2" />
          <div className="text-xs font-medium text-ink-secondary">No automations yet</div>
          <p className="text-[11px] text-ink-muted mt-1">
            Click <span className="font-medium">New automation</span> to create one.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const open = activeId === a.id;
            const inert = a.enabled && a.step_count === 0;
            return (
              <div
                key={a.id}
                className={clsx(
                  "rounded-xl border bg-surface shadow-card overflow-hidden transition-colors",
                  open ? "border-brand-300" : "border-line",
                )}
              >
                {/* Card head — always visible summary */}
                <button
                  onClick={() => setActiveId(open ? null : a.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-surface-muted"
                >
                  <span
                    className={clsx(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      a.enabled ? "bg-positive-soft text-positive" : "bg-surface-sunken text-ink-muted",
                    )}
                  >
                    <Zap size={13} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium text-ink">{a.name}</span>
                      <span
                        className={clsx(
                          "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          a.enabled
                            ? "bg-positive-soft text-positive"
                            : "bg-surface-sunken text-ink-muted",
                        )}
                      >
                        {a.enabled ? "Live" : "Paused"}
                      </span>
                      {inert && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-warning-soft px-1 py-0.5 text-[10px] font-medium text-warning">
                          <AlertTriangle size={8} /> No emails
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                      {plainDescription(a)}
                    </span>
                  </span>

                  {/* Stats — the workflows cards had these, but hardcoded to
                      zero. These are the real enrollment numbers. */}
                  <span className="hidden shrink-0 items-center gap-4 sm:flex">
                    <Stat label="In flow" value={a.active_count} />
                    <Stat label="Completed" value={a.completed_count} />
                    <Stat label="Steps" value={a.step_count} />
                  </span>

                  <ChevronDown
                    size={14}
                    className={clsx(
                      "shrink-0 text-ink-subtle transition-transform",
                      open && "rotate-180",
                    )}
                  />
                </button>

                {open && (
                  <div className="border-t border-line">
                    <AutomationEditor
                      key={a.id}
                      automationId={a.id}
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
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-[11px] text-ink-muted shadow-card">
              No automations match “{query.trim()}”.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="text-xs font-semibold tabular-nums text-ink">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-ink-subtle">{label}</span>
    </span>
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
