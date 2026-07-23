"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Trash2,
  Plus,
  AlertTriangle,
  Mail,
  ArrowDown,
  Clock,
  Users,
  Eye,
  Pencil,
  Check,
  X,
  ChevronDown,
  ArrowUp,
  ArrowDown as ArrowDownIcon,
  Send,
  Layers,
  FlaskConical,
  Play,
} from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

type TriggerType = "status_change" | "order_event" | "date" | "manual";

/** Triggers both this editor and the cron runner understand. */
const KNOWN_TRIGGERS: string[] = ["status_change", "order_event", "date", "manual"];
type AudienceConfig = "d2c" | "wholesale" | "both";
type Recurring = "none" | "weekly" | "monthly" | "quarterly" | "annually";

type Automation = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger_type: TriggerType;
  trigger_config: {
    audience?: AudienceConfig;
    // status_change
    status_target?: "at_risk" | "churned";
    lookback_days?: number;
    // order_event
    order_event_type?: "first" | "last";
    days_after?: number;
    // date
    scheduled_at?: string;
    recurring?: Recurring;
    // filters
    min_spend?: number;
    /** Legacy single-value filters. Still honoured; superseded by the arrays. */
    channel?: string;
    state?: string;
    /** Multi-select filters — empty/absent means "any". */
    channels?: string[];
    states?: string[];
    status_filter?: "active" | "at_risk" | "churned";
    /** Exit rules — checked before every send. */
    exit_on_order?: boolean;
    exit_on_reply?: boolean;
    exit_on_active?: boolean;
    exit_after_days?: number;
    /** Batching — see the cron runner for the release semantics. */
    batch_mode?: "continuous" | "cohort";
    batch_weekday?: number;
    batch_label_prefix?: string;
    batch_start_number?: number;
    batch_size?: number;
    /** Test batch — real enrollments, all mail redirected to test_email. */
    test_mode?: boolean;
    test_email?: string;
  };
  sender_user_id: string | null;
  updated_at: string;
};

type Step = {
  id: string;
  step_order: number;
  /** null = "Add later" — the step exists but its email hasn't been written. */
  template_id: string | null;
  delay_days: number;
};

type Template = {
  id: string;
  name: string;
  subject: string;
};

type Enrollment = {
  id: string;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  next_send_at: string | null;
};

type StepSend = {
  id: string;
  step_order: number;
  status: string;
  sent_at: string;
  automation_enrollments: {
    customer_name: string | null;
    customer_email: string | null;
  } | null;
};

/** Used for "X days after [first|last] order" triggers. */
const AFTER_ORDER_DAYS_OPTIONS = [
  { label: "1 day", value: 1 },
  { label: "3 days", value: 3 },
  { label: "1 week", value: 7 },
  { label: "2 weeks", value: 14 },
  { label: "1 month", value: 30 },
  { label: "3 months", value: 90 },
];

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DELAY_OPTIONS = [
  { label: "Same day", value: 0 },
  { label: "1 day later", value: 1 },
  { label: "3 days later", value: 3 },
  { label: "1 week later", value: 7 },
  { label: "2 weeks later", value: 14 },
  { label: "1 month later", value: 30 },
];

/** Prefilled recipient for test sends — overwrite it in the field any time. */
const DEFAULT_TEST_EMAIL = "blakeekelund@gmail.com";

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AutomationEditor({
  automationId,
  onChanged,
  onDeleted,
}: {
  automationId: string;
  onChanged: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}) {
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [allTemplates, setAllTemplates] = useState<Template[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [recent, setRecent] = useState<StepSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [testEmail, setTestEmail] = useState(DEFAULT_TEST_EMAIL);
  /** "" = built-in sample; otherwise "<type>:<ref>" from the preview list. */
  const [testCustomer, setTestCustomer] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ ok: boolean; text: string } | null>(null);

  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }, []);

  const reload = useCallback(async () => {
    const [detailRes, templatesRes] = await Promise.all([
      fetch(`/api/automations/${automationId}`, { headers: await authHeader() }),
      fetch("/api/email/templates", { headers: await authHeader() }),
    ]);
    const detail = await detailRes.json();
    const tplJson = await templatesRes.json();
    if (!detailRes.ok) {
      setError(detail?.error ?? `Failed (${detailRes.status})`);
      return;
    }
    setAutomation(detail.automation as Automation);
    setSteps((detail.steps as Step[]) ?? []);
    setRecent((detail.recent as StepSend[]) ?? []);
    setEnrollments((detail.enrollments as Enrollment[]) ?? []);
    setCohorts((detail.cohorts as Cohort[]) ?? []);
    setAllTemplates((tplJson?.templates as Template[]) ?? []);
  }, [automationId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const templateMap = useMemo(() => {
    const map = new Map<string, Template>();
    for (const t of allTemplates) map.set(t.id, t);
    return map;
  }, [allTemplates]);

  /* ── Save helpers (auto-save on edit, no Save button) ────────────────── */

  async function patch(updates: Partial<Automation> & { trigger_config?: Record<string, unknown> }) {
    setError(null);
    const res = await fetch(`/api/automations/${automationId}`, {
      method: "PATCH",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error ?? `Save failed (${res.status})`);
      return false;
    }
    setAutomation(json.automation as Automation);
    flashSaved();
    await onChanged();
    return true;
  }

  async function updateName(name: string) {
    if (!automation || name === automation.name) return;
    await patch({ name: name.trim() || "Untitled automation" });
  }

  async function updateTriggerType(t: TriggerType) {
    // Reset trigger_config to the shape this trigger expects, but preserve
    // audience + filter values across trigger-type changes.
    const audience = automation?.trigger_config?.audience ?? "d2c";
    const preservedFilters = {
      min_spend: automation?.trigger_config?.min_spend,
      channel: automation?.trigger_config?.channel,
      state: automation?.trigger_config?.state,
      // Multi-select filters must survive a trigger change too, or switching
      // trigger type silently wipes the audience you just narrowed down.
      channels: automation?.trigger_config?.channels,
      states: automation?.trigger_config?.states,
    };
    let typeSpecific: Automation["trigger_config"] = {};
    if (t === "status_change") {
      typeSpecific = {
        status_target: automation?.trigger_config?.status_target ?? "at_risk",
        lookback_days: automation?.trigger_config?.lookback_days ?? 0,
      };
    } else if (t === "order_event") {
      typeSpecific = {
        order_event_type: automation?.trigger_config?.order_event_type ?? "first",
        days_after: automation?.trigger_config?.days_after ?? 7,
        lookback_days: automation?.trigger_config?.lookback_days ?? 30,
      };
    } else if (t === "date") {
      const inAWeek = new Date();
      inAWeek.setDate(inAWeek.getDate() + 7);
      typeSpecific = {
        scheduled_at:
          automation?.trigger_config?.scheduled_at ?? inAWeek.toISOString().slice(0, 10),
        recurring: automation?.trigger_config?.recurring ?? "none",
      };
    }
    const cfg: Automation["trigger_config"] = {
      audience,
      ...preservedFilters,
      ...typeSpecific,
    };
    await patch({ trigger_type: t, trigger_config: cfg });
  }

  async function updateTriggerConfig(updates: Partial<Automation["trigger_config"]>) {
    await patch({
      trigger_config: { ...(automation?.trigger_config ?? {}), ...updates },
    });
  }

  async function toggleEnabled() {
    if (!automation) return;
    if (!automation.enabled && steps.length === 0) {
      setError("Add at least one email before turning this on.");
      return;
    }
    if (!automation.enabled && allTemplatesEmpty()) {
      setError("Create a template on Email Templates first.");
      return;
    }
    await patch({ enabled: !automation.enabled });
  }

  function allTemplatesEmpty() {
    return allTemplates.length === 0;
  }

  async function deleteAutomation() {
    if (!confirm(`Delete "${automation?.name}"? This removes enrollments and history too.`)) {
      return;
    }
    const res = await fetch(`/api/automations/${automationId}`, {
      method: "DELETE",
      headers: await authHeader(),
    });
    if (res.ok || res.status === 204) {
      await onDeleted();
    }
  }

  /* ── Step CRUD ───────────────────────────────────────────────────────── */

  /* Send the whole sequence to one address, right now, ignoring the waits.
     Nothing is recorded against the automation — see the route for why. */
  async function sendTest() {
    const to = testEmail.trim();
    if (!to) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      /* The chosen customer supplies merge values only — delivery still goes
         to the address in the test field, never to the customer. */
      const picked = previewSample.find(
        (c) => `${c.customer_type}:${c.customer_ref}` === testCustomer,
      );
      const res = await fetch(`/api/automations/${automationId}/test`, {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({
          email: to,
          customerType: picked?.customer_type,
          customerRef: picked?.customer_ref,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestResult({ ok: false, text: json?.error ?? `Test failed (${res.status})` });
        return;
      }
      const failed = json.total - json.sent;
      const using = json.usedCustomer
        ? ` using ${json.usedCustomer}'s data`
        : " using sample data";
      setTestResult({
        ok: failed === 0,
        text:
          failed === 0
            ? `Sent ${json.sent} email${json.sent === 1 ? "" : "s"} to ${json.to}${using}.`
            : `Sent ${json.sent} of ${json.total} to ${json.to}${using} — ${failed} failed.`,
      });
    } catch (e) {
      setTestResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  /* Wipe test enrollments so the same audience can be rehearsed again —
     dedup would otherwise skip everyone used in the previous run. */
  async function clearTestEnrollments() {
    if (
      !confirm(
        "Delete this automation's test enrollments?\n\nOnly test data is removed — live enrollments and real send history are untouched.",
      )
    ) {
      return;
    }
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch(`/api/automations/${automationId}/test`, {
        method: "DELETE",
        headers: await authHeader(),
      });
      const json = await res.json().catch(() => ({}));
      setRunResult(
        res.ok
          ? { ok: true, text: `Cleared ${json.cleared ?? 0} test enrollment(s). Run again for a fresh batch.` }
          : { ok: false, text: json?.error ?? `Clear failed (${res.status})` },
      );
      await reload();
      await onChanged();
    } finally {
      setRunning(false);
    }
  }

  /* Trigger the scheduler immediately for THIS automation only.
     "Turn on" merely makes an automation eligible for the next daily pass at
     14:00 UTC, which reads as "nothing happened" — especially during a test
     batch, where you're standing by waiting for mail. */
  async function runNow() {
    if (!automation) return;
    const target = cfg.test_mode
      ? `everything to ${cfg.test_email}`
      : "REAL customers";
    if (
      !confirm(
        `Run "${automation.name}" now?\n\nThis enrolls eligible customers and sends the first step immediately — ${target}.`,
      )
    ) {
      return;
    }
    setRunning(true);
    setRunResult(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/cron/automations?automation=${encodeURIComponent(automationId)}`,
        { headers: await authHeader() },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRunResult({ ok: false, text: json?.error ?? `Run failed (${res.status})` });
        return;
      }
      const errs: string[] = json.errors ?? [];
      setRunResult({
        ok: errs.length === 0,
        text: errs.length
          ? `Enrolled ${json.enrolled ?? 0}, sent ${json.sent ?? 0}. Problems: ${errs.join("; ")}`
          : `Enrolled ${json.enrolled ?? 0} · sent ${json.sent ?? 0} · failed ${json.failed ?? 0}`,
      });
      await reload();
      await onChanged();
    } catch (e) {
      setRunResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  }

  /** Move a step one position up or down and persist the whole new order. */
  async function moveStep(stepId: string, dir: -1 | 1) {
    const idx = steps.findIndex((s) => s.id === stepId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= steps.length) return;

    const next = [...steps];
    [next[idx], next[target]] = [next[target], next[idx]];
    setSteps(next); // optimistic — the row moves under the cursor immediately

    setError(null);
    const res = await fetch(`/api/automations/${automationId}/steps/reorder`, {
      method: "POST",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((s) => s.id) }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error ?? `Reorder failed (${res.status})`);
      await reload(); // put it back the way the server sees it
      return;
    }
    flashSaved();
  }

  async function addStep() {
    /* No templates yet is no longer a dead end — the step is created empty and
       the user picks (or writes) the email later. */
    const res = await fetch(`/api/automations/${automationId}/steps`, {
      method: "POST",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: allTemplates[0]?.id ?? null,
        delay_days: steps.length === 0 ? 0 : 7,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error ?? `Add failed (${res.status})`);
      return;
    }
    await reload();
    await onChanged();
    flashSaved();
  }

  async function patchStep(
    stepId: string,
    updates: { template_id?: string | null; delay_days?: number },
  ) {
    setError(null);
    const res = await fetch(`/api/automations/${automationId}/steps/${stepId}`, {
      method: "PATCH",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error ?? `Update failed (${res.status})`);
      return;
    }
    await reload();
    flashSaved();
  }

  async function deleteStep(stepId: string) {
    const res = await fetch(`/api/automations/${automationId}/steps/${stepId}`, {
      method: "DELETE",
      headers: await authHeader(),
    });
    if (res.ok || res.status === 204) {
      await reload();
      await onChanged();
      flashSaved();
    }
  }

  /* ── Preview (live count + sample list) ─────────────────────────────── */

  type PreviewCandidate = {
    customer_type: "d2c" | "wholesale";
    customer_ref: string;
    name: string | null;
    email: string | null;
    extra_emails?: number;
    last_order_date: string | null;
    lifetime_revenue: number | null;
    warning: string | null;
  };
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewSample, setPreviewSample] = useState<PreviewCandidate[]>([]);
  const [invalidEmailCount, setInvalidEmailCount] = useState(0);
  const [suspectEmailCount, setSuspectEmailCount] = useState(0);
  const [showSample, setShowSample] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  type Cohort = {
    label: string;
    number: number;
    total: number;
    active: number;
    completed: number;
    exited: number;
  };
  const [cohorts, setCohorts] = useState<Cohort[]>([]);

  async function runPreview() {
    setPreviewing(true);
    try {
      const res = await fetch("/api/cron/automations?dry=1", {
        headers: await authHeader(),
      });
      const json = await res.json();
      if (res.ok) {
        setPreviewCount(json.enrolled ?? 0);
        setPreviewSample((json.sample_candidates as PreviewCandidate[]) ?? []);
        setInvalidEmailCount(json.invalid_emails ?? 0);
        setSuspectEmailCount(json.suspect_emails ?? 0);
        setShowSample(true);
      }
    } finally {
      setPreviewing(false);
    }
  }

  /* ── Render ─────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={16} className="animate-spin text-gray-400" />
      </div>
    );
  }
  if (!automation) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
        Couldn&apos;t load this automation.
      </div>
    );
  }

  const t = automation.trigger_type;
  const cfg = automation.trigger_config ?? {};

  /* The runner fires twice a day, at 7:45am and 3:45pm Eastern (see
     vercel.json — the schedule is UTC, the route enforces the Eastern hours).
     Rather than restate that as trivia, say when the next one lands. */
  function nextRunLabel(): string {
    const now = new Date();
    // Minutes since midnight, Eastern.
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    const nowMin = h * 60 + m;

    const slots = [7 * 60 + 45, 15 * 60 + 45];
    const next = slots.find((s) => s > nowMin);
    const minsAway = next !== undefined ? next - nowMin : 24 * 60 - nowMin + slots[0];

    if (minsAway <= 60) return `in ${minsAway}m`;
    const hrs = Math.round(minsAway / 60);
    return hrs < 24 ? `in ${hrs}h` : "tomorrow";
  }

  /* Why Turn on is unavailable, or null when it's fine. Turning OFF is always
     allowed — you must be able to stop a running automation regardless. */
  const stepsMissingTemplate = steps.filter((s) => !s.template_id).length;
  const blockedReason: string | null =
    steps.length === 0
      ? "Add at least one email first"
      : stepsMissingTemplate > 0
        ? `${stepsMissingTemplate} step${stepsMissingTemplate === 1 ? "" : "s"} still need${stepsMissingTemplate === 1 ? "s" : ""} an email`
        : null;

  /* Mirrors cohortPrefix() in the cron runner so the preview here matches the
     label the release will actually write. */
  const defaultBatchPrefix =
    t === "status_change"
      ? `${
          cfg.audience === "wholesale" ? "Wholesale" : cfg.audience === "both" ? "All" : "D2C"
        } ${cfg.status_target === "churned" ? "Churned" : "At Risk"}`
      : automation.name;

  const nextBatchNumber =
    cohorts.length > 0
      ? Math.max(...cohorts.map((c) => c.number)) + 1
      : cfg.batch_start_number ?? 1000;

  const lastSend = recent.find((r) => r.status === "sent");
  const lastSendLabel = lastSend
    ? new Date(lastSend.sent_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="flex flex-col">
      {/* Top bar — sticky so the name + delete stay reachable while scrolling */}
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 sticky top-0 z-10 bg-white">
        <InlineEditableTitle
          value={automation.name}
          onSave={updateName}
        />
        <div className="flex items-center gap-2 shrink-0">
          {savedFlash && (
            <span className="inline-flex items-center gap-1 text-[11px] text-green-600">
              <Check size={11} /> Saved
            </span>
          )}
          <button
            onClick={deleteAutomation}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 inline-flex items-start gap-2 mb-4">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="max-w-xl mx-auto space-y-1">
          {/* An automation saved with a trigger neither the editor nor the cron
              runner recognises can sit "Live" and enroll nobody, with no pill
              selected and a blank trigger sentence to explain why. Legacy rows
              are migrated, but say so plainly if one ever turns up again. */}
          {!KNOWN_TRIGGERS.includes(t) && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2 text-[11px] text-warning">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              <span>
                This automation has an unrecognized trigger (
                <code className="font-mono">{String(t)}</code>), so it will never
                enroll anyone. Pick one below to fix it.
              </span>
            </div>
          )}

          {/* ── 1. Audience ── */}
          <FlowCard>
            <FlowLabel>1 · Who is this for</FlowLabel>
            <div className="flex items-center gap-1 mt-1">
              <FilterPill
                active={(cfg.audience ?? "d2c") === "d2c"}
                onClick={() => updateTriggerConfig({ audience: "d2c" })}
              >
                D2C
              </FilterPill>
              <FilterPill
                active={cfg.audience === "wholesale"}
                onClick={() => updateTriggerConfig({ audience: "wholesale" })}
              >
                Wholesale
              </FilterPill>
              <FilterPill
                active={cfg.audience === "both"}
                onClick={() => updateTriggerConfig({ audience: "both" })}
              >
                Both
              </FilterPill>
            </div>
          </FlowCard>

          <Arrow />

          {/* ── 2. Trigger ── */}
          <FlowCard>
            <FlowLabel>2 · When to enroll</FlowLabel>
            <div className="text-sm text-gray-800 leading-relaxed space-y-3 mt-1">
              <div className="flex items-center gap-1 flex-wrap">
                <FilterPill
                  active={t === "status_change"}
                  onClick={() => updateTriggerType("status_change")}
                >
                  Status change
                </FilterPill>
                <FilterPill
                  active={t === "order_event"}
                  onClick={() => updateTriggerType("order_event")}
                >
                  Order event
                </FilterPill>
                <FilterPill
                  active={t === "date"}
                  onClick={() => updateTriggerType("date")}
                >
                  Date
                </FilterPill>
                <FilterPill
                  active={t === "manual"}
                  onClick={() => updateTriggerType("manual")}
                >
                  Manual
                </FilterPill>
              </div>
              <div>{renderTriggerSentence(t, cfg, updateTriggerConfig)}</div>
            </div>
          </FlowCard>

          <Arrow />

          {/* ── 3. Filters ── */}
          <FlowCard>
            <FlowLabel>3 · Narrow it down (optional)</FlowLabel>
            <div className="mt-1">
              <FiltersRow cfg={cfg} patchCfg={updateTriggerConfig} />
            </div>
          </FlowCard>

          {/* ── 3b. Batching — status-change trickles by nature, so this is
                 where cohorts matter most. ── */}
          {t === "status_change" && (
            <>
              <Arrow />
              <FlowCard>
                <FlowLabel>
                  <Layers size={11} className="inline -mt-0.5 mr-1" />
                  How to release them
                </FlowLabel>
                <div className="mt-1 space-y-2">
                  <div className="flex items-center gap-1 flex-wrap">
                    <FilterPill
                      active={(cfg.batch_mode ?? "continuous") === "continuous"}
                      onClick={() => updateTriggerConfig({ batch_mode: "continuous" })}
                    >
                      As they qualify
                    </FilterPill>
                    <FilterPill
                      active={cfg.batch_mode === "cohort"}
                      onClick={() => updateTriggerConfig({ batch_mode: "cohort" })}
                    >
                      Weekly batches
                    </FilterPill>
                  </div>

                  {cfg.batch_mode === "cohort" ? (
                    <div className="space-y-2 text-sm text-gray-800">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>Release every</span>
                        <Pill>
                          <select
                            value={String(cfg.batch_weekday ?? 1)}
                            onChange={(e) =>
                              updateTriggerConfig({ batch_weekday: Number(e.target.value) })
                            }
                            className="bg-transparent focus:outline-none cursor-pointer pr-4"
                          >
                            {WEEKDAYS.map((d, i) => (
                              <option key={d} value={i}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </Pill>
                        <span>, up to</span>
                        <Pill>
                          <select
                            value={String(cfg.batch_size ?? 0)}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              updateTriggerConfig({ batch_size: v > 0 ? v : undefined });
                            }}
                            className="bg-transparent focus:outline-none cursor-pointer pr-4"
                          >
                            <option value="0">everyone waiting</option>
                            <option value="25">25 customers</option>
                            <option value="50">50 customers</option>
                            <option value="100">100 customers</option>
                            <option value="200">200 customers</option>
                          </select>
                        </Pill>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-gray-500">Batch name</span>
                        <input
                          value={cfg.batch_label_prefix ?? ""}
                          onChange={(e) =>
                            updateTriggerConfig({
                              batch_label_prefix: e.target.value || undefined,
                            })
                          }
                          placeholder={defaultBatchPrefix}
                          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-gray-400 focus:outline-none sm:flex-none sm:w-48"
                        />
                        <span className="text-[11px] text-gray-500">starting at</span>
                        <input
                          type="number"
                          value={String(cfg.batch_start_number ?? 1000)}
                          onChange={(e) =>
                            updateTriggerConfig({
                              batch_start_number: Number(e.target.value) || undefined,
                            })
                          }
                          className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-xs tabular-nums focus:border-gray-400 focus:outline-none"
                        />
                      </div>

                      <p className="text-[10px] text-gray-400">
                        Next batch:{" "}
                        <span className="font-medium text-gray-600">
                          {(cfg.batch_label_prefix?.trim() || defaultBatchPrefix)}{" "}
                          {nextBatchNumber}
                        </span>
                        . Customers who qualify meanwhile wait for the next
                        release — nobody is skipped.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-[10px] text-gray-400">
                        Customers are enrolled the day they qualify — one today,
                        three tomorrow. Simple, but no two recipients share
                        conditions, so results are hard to compare.
                      </p>
                      {/* This mode writes no cohort, so the results page has
                          nothing to group by — say so here rather than leaving
                          someone staring at an empty page after a run. */}
                      <p className="inline-flex items-start gap-1 text-[10px] text-amber-700">
                        <AlertTriangle size={10} className="mt-px shrink-0" />
                        <span>
                          Runs in this mode aren&apos;t numbered batches, so they
                          won&apos;t appear on{" "}
                          <Link href="/automations/cohorts" className="underline">
                            Cohort Results
                          </Link>
                          . Switch to weekly batches to compare releases.
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </FlowCard>
            </>
          )}

          <Arrow />

          {/* ── 3c. Test batch ── */}
          <div
            className={clsx(
              "rounded-2xl border px-5 py-4 transition-colors",
              cfg.test_mode
                ? "border-amber-300 bg-amber-50"
                : "border-gray-200 bg-white shadow-sm",
            )}
          >
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={!!cfg.test_mode}
                onChange={(e) =>
                  updateTriggerConfig({
                    test_mode: e.target.checked || undefined,
                    // Prefill so enabling it can't leave the address blank.
                    test_email: e.target.checked
                      ? cfg.test_email || DEFAULT_TEST_EMAIL
                      : cfg.test_email,
                  })
                }
                className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-gray-300 accent-amber-600"
              />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-gray-800">
                  Run this as a test batch
                </span>
                <span className="block text-[11px] text-gray-500">
                  Real customers are selected and the full sequence runs on
                  schedule — but every email is delivered to you instead of them.
                </span>
              </span>
            </label>

            {cfg.test_mode && (
              <div className="mt-3 space-y-2 border-t border-amber-200 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium text-amber-900">
                    Deliver everything to
                  </span>
                  <input
                    type="email"
                    value={cfg.test_email ?? ""}
                    onChange={(e) =>
                      updateTriggerConfig({ test_email: e.target.value || undefined })
                    }
                    placeholder={DEFAULT_TEST_EMAIL}
                    className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] text-gray-800 focus:border-amber-400 focus:outline-none sm:flex-none sm:w-64"
                  />
                </div>
                <button
                  onClick={clearTestEnrollments}
                  disabled={running}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  <Trash2 size={11} />
                  Clear test enrollments &amp; start over
                </button>

                <p className="text-[10px] leading-relaxed text-amber-800">
                  Subjects arrive tagged{" "}
                  <span className="font-mono">[TEST → customer name]</span> so you
                  can tell whose data produced each one. Test enrollments are kept
                  separate, so every customer used here is still available for the
                  real campaign. Turn this off when you&apos;re ready to go live.
                </p>
              </div>
            )}
          </div>

          <Arrow />

          {/* ── 4. Exit rules ── */}
          <FlowCard>
            <FlowLabel>4 · Remove customer if</FlowLabel>
            <div className="mt-1 space-y-1.5">
              <ExitToggle
                checked={!!cfg.exit_on_order}
                onChange={(v) => updateTriggerConfig({ exit_on_order: v || undefined })}
                label="They place an order"
                hint="Stops win-back mail the moment it works."
              />
              <ExitToggle
                checked={!!cfg.exit_on_reply}
                onChange={(v) => updateTriggerConfig({ exit_on_reply: v || undefined })}
                label="They reply to any of our emails"
                hint="A real conversation has started — hand it to a human."
              />
              <ExitToggle
                checked={!!cfg.exit_on_active}
                onChange={(v) => updateTriggerConfig({ exit_on_active: v || undefined })}
                label="They're an active customer again"
                hint="Ordered within the last 180 days."
              />

              <div className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={!!cfg.exit_after_days}
                  onChange={(e) =>
                    updateTriggerConfig({ exit_after_days: e.target.checked ? 30 : undefined })
                  }
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-gray-300 accent-gray-900"
                />
                <span className="text-xs text-gray-700">No reply after</span>
                <select
                  value={String(cfg.exit_after_days ?? 30)}
                  disabled={!cfg.exit_after_days}
                  onChange={(e) =>
                    updateTriggerConfig({ exit_after_days: Number(e.target.value) })
                  }
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none disabled:opacity-40"
                >
                  <option value="14">2 weeks</option>
                  <option value="30">1 month</option>
                  <option value="60">2 months</option>
                  <option value="90">3 months</option>
                </select>
              </div>

              <p className="px-2 pt-0.5 text-[10px] text-gray-400">
                Checked before every send. Customers who opt out are always
                removed, whatever these say.
              </p>
            </div>
          </FlowCard>

          {/* No separator here: each step block below opens with its own
              <Arrow><WaitRow/></Arrow>, which already draws the connector on
              both sides of the wait. One here too gave two stacked arrows
              between "Narrow it down" and the first email. */}

          {/* ── Step cards ── */}
          {steps.map((s, i) => {
            const tpl = s.template_id ? templateMap.get(s.template_id) : undefined;
            return (
              <div key={s.id}>
                {/* Wait step — its own row rather than a setting buried on the
                    email below it. Maps to that email's delay_days, so the
                    runner is unchanged; this is the same data made visible. */}
                <Arrow>
                  <WaitRow
                    value={s.delay_days}
                    isFirst={i === 0}
                    onChange={(d) => patchStep(s.id, { delay_days: d })}
                  />
                </Arrow>
                <FlowCard>
                  <div className="flex items-start justify-between gap-2">
                    <FlowLabel>
                      <Mail size={11} className="inline -mt-0.5 mr-1" />
                      Send · step {i + 1} of {steps.length}
                    </FlowLabel>
                    {steps.length > 1 && (
                      <div className="flex items-center gap-0.5 shrink-0 -mt-1">
                        <button
                          onClick={() => moveStep(s.id, -1)}
                          disabled={i === 0}
                          title="Move earlier"
                          className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-25 disabled:hover:bg-transparent"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          onClick={() => moveStep(s.id, 1)}
                          disabled={i === steps.length - 1}
                          title="Move later"
                          className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-25 disabled:hover:bg-transparent"
                        >
                          <ArrowDownIcon size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-800 leading-relaxed">
                        The email{" "}
                        <Pill>
                          {/* "" = Add later. A step can be sketched now and its
                              email written afterwards; Turn on stays blocked
                              until every step has one. */}
                          <select
                            value={s.template_id ?? ""}
                            onChange={(e) =>
                              patchStep(s.id, { template_id: e.target.value || null })
                            }
                            className="bg-transparent focus:outline-none cursor-pointer pr-4 max-w-[260px] truncate"
                          >
                            <option value="">— Add later —</option>
                            {allTemplates.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                            {s.template_id && !templateMap.has(s.template_id) && (
                              <option value={s.template_id}>(missing template)</option>
                            )}
                          </select>
                        </Pill>
                      </div>
                      {tpl ? (
                        <div className="text-[11px] text-gray-400 mt-1.5 truncate">
                          Subject: {tpl.subject}
                        </div>
                      ) : (
                        <div className="mt-1.5 text-[11px] text-amber-700 inline-flex items-center gap-1 flex-wrap">
                          <AlertTriangle size={10} className="shrink-0" />
                          No email chosen yet —{" "}
                          {allTemplates.length === 0 ? (
                            <Link href="/email-templates" className="underline">
                              create a template
                            </Link>
                          ) : (
                            "pick one above"
                          )}{" "}
                          before turning this on.
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => deleteStep(s.id)}
                      className="shrink-0 text-gray-300 hover:text-red-500 transition p-1"
                      title="Remove this email"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </FlowCard>
              </div>
            );
          })}

          {/* Add step */}
          <div className="pt-3 flex justify-center">
            <button
              onClick={addStep}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition"
            >
              <Plus size={12} />
              {steps.length === 0 ? "Add an email" : "Add another email"}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom action bar — sticky so Turn On is always reachable */}
      <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/95 backdrop-blur-sm sticky bottom-0 z-10">
        {/* Preview sample list */}
        {showSample && previewSample.length > 0 && (
          <div className="max-w-xl mx-auto mb-3 rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <div className="text-[11px] font-medium text-gray-600 flex items-center gap-2 flex-wrap">
                <span>
                  Preview ·{" "}
                  <span className="text-gray-900">
                    {previewCount} customer{previewCount === 1 ? "" : "s"}
                  </span>{" "}
                  eligible
                  {previewSample.length < (previewCount ?? 0) && (
                    <span className="text-gray-400">
                      {" "}
                      (showing first {previewSample.length})
                    </span>
                  )}
                </span>
                {invalidEmailCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 text-[10px]">
                    <AlertTriangle size={9} />
                    {invalidEmailCount} bad email{invalidEmailCount === 1 ? "" : "s"}
                  </span>
                )}
                {suspectEmailCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 text-[10px]">
                    <AlertTriangle size={9} />
                    {suspectEmailCount} flagged
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowSample(false)}
                className="text-gray-400 hover:text-gray-600 transition"
                title="Hide list"
              >
                <X size={12} />
              </button>
            </div>
            <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {previewSample.map((c) => {
                const warn = c.warning;
                const isBad =
                  !!warn &&
                  (warn === "Missing" ||
                    warn === "Invalid format" ||
                    warn.startsWith("Possible typo"));
                return (
                  <li
                    key={`${c.customer_type}:${c.customer_ref}`}
                    className="px-3 py-1.5 flex items-center gap-2 text-xs"
                  >
                    <span className="font-medium text-gray-800 truncate flex-1">
                      {c.name ?? "(no name)"}
                    </span>
                    <span
                      className={clsx(
                        "truncate max-w-[200px]",
                        isBad ? "text-red-600" : "text-gray-500",
                      )}
                    >
                      {c.email}
                      {c.extra_emails && c.extra_emails > 0 ? (
                        <span className="ml-1 text-[10px] text-gray-400">
                          +{c.extra_emails}
                        </span>
                      ) : null}
                    </span>
                    {warn && (
                      <span
                        className={clsx(
                          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0",
                          isBad
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200",
                        )}
                        title={warn}
                      >
                        <AlertTriangle size={8} />
                        {warn.length > 22 ? warn.slice(0, 20) + "…" : warn}
                      </span>
                    )}
                    {c.lifetime_revenue != null && (
                      <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
                        ${Math.round(c.lifetime_revenue).toLocaleString()}
                      </span>
                    )}
                    {c.last_order_date && (
                      <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
                        {new Date(c.last_order_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Test send — sits above the live controls so it reads as the thing
            you do *before* turning anything on. */}
        <div className="max-w-xl mx-auto mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="test-email"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500"
            >
              <Send size={11} className="text-gray-400" />
              Send a test to
            </label>
            <input
              id="test-email"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !testing && steps.length > 0) sendTest();
              }}
              placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] text-gray-800 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none sm:flex-none sm:w-56"
            />
            <button
              onClick={sendTest}
              disabled={testing || !testEmail.trim() || steps.length === 0}
              title={
                steps.length === 0
                  ? "Add an email to the sequence first"
                  : "Send every step to this address now, ignoring the waits"
              }
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testing ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              {testing ? "Sending…" : "Send test"}
            </button>
          </div>

          {/* Whose data fills the merge fields. Sourced from the eligibility
              preview, so the options are customers this automation would
              genuinely enroll. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label
              htmlFor="test-customer"
              className="text-[11px] font-medium text-gray-500"
            >
              Using data from
            </label>
            <select
              id="test-customer"
              value={testCustomer}
              onChange={(e) => setTestCustomer(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-800 focus:border-gray-400 focus:outline-none sm:flex-none sm:w-64"
            >
              <option value="">Sample customer (made up)</option>
              {previewSample.map((c) => (
                <option
                  key={`${c.customer_type}:${c.customer_ref}`}
                  value={`${c.customer_type}:${c.customer_ref}`}
                >
                  {c.name ?? c.customer_ref} · {c.customer_type === "d2c" ? "D2C" : "Wholesale"}
                </option>
              ))}
            </select>
            {previewSample.length === 0 && (
              <button
                onClick={runPreview}
                disabled={previewing}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {previewing ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Users size={11} />
                )}
                Load real customers
              </button>
            )}
          </div>

          <p className="mt-1 text-[10px] text-gray-400">
            Every step is sent at once, to the address above — the selected
            customer only supplies the merge-field values, and is never
            emailed. Nothing is recorded against this automation.
          </p>

          {runResult && (
            <div
              className={clsx(
                "mt-2 flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px]",
                runResult.ok
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-amber-200 bg-amber-50 text-amber-800",
              )}
            >
              {runResult.ok ? (
                <Check size={12} className="mt-px shrink-0" />
              ) : (
                <AlertTriangle size={12} className="mt-px shrink-0" />
              )}
              <span className="min-w-0">{runResult.text}</span>
            </div>
          )}

          {testResult && (
            <div
              className={clsx(
                "mt-2 flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px]",
                testResult.ok
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700",
              )}
            >
              {testResult.ok ? (
                <Check size={12} className="mt-px shrink-0" />
              ) : (
                <AlertTriangle size={12} className="mt-px shrink-0" />
              )}
              <span className="min-w-0">{testResult.text}</span>
            </div>
          )}
        </div>

        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          <div className="text-xs text-gray-600 inline-flex items-center gap-3 flex-wrap">
            {automation.enabled && cfg.test_mode && (
              /* "Live" would be dangerously misleading here — it is running,
                 but nothing reaches customers. */
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                <FlaskConical size={11} />
                Test batch → {cfg.test_email} · next run {nextRunLabel()}
              </span>
            )}
            {automation.enabled && !cfg.test_mode && (
              <span
                className="inline-flex items-center gap-1"
                title={`Next run ${nextRunLabel()}`}
              >
                <span className="h-2 w-2 rounded-full bg-green-500 inline-block animate-pulse" />
                Live — next run {nextRunLabel()}
              </span>
            )}
            {/* Closes the feedback loop: "is this thing actually doing
                anything?" was previously unanswerable without reading the DB. */}
            {lastSendLabel && (
              <span className="text-gray-400">Last sent {lastSendLabel}</span>
            )}
            <button
              onClick={runPreview}
              disabled={previewing}
              className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900 transition disabled:opacity-50"
            >
              <Eye size={11} />
              {previewing
                ? "Checking…"
                : previewCount !== null
                  ? `${previewCount} eligible`
                  : "Preview eligible customers"}
            </button>
            {previewCount !== null && previewSample.length > 0 && !showSample && (
              <button
                onClick={() => setShowSample(true)}
                className="text-blue-600 hover:text-blue-800 transition"
              >
                View list
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Without this, an enabled automation does nothing visible until
                the next 14:00 UTC pass — indistinguishable from broken. */}
            {automation.enabled && (
              <button
                onClick={runNow}
                disabled={running}
                title="Enroll and send the first step immediately, without waiting for the daily run"
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {running ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Play size={12} />
                )}
                {running ? "Running…" : "Run now"}
              </button>
            )}
            {/* The button used to just go grey with no explanation. */}
            {blockedReason && !automation.enabled && (
              <span className="text-[11px] text-amber-700 text-right max-w-[180px]">
                {blockedReason}
              </span>
            )}
            <button
              onClick={toggleEnabled}
              disabled={!automation.enabled && !!blockedReason}
              title={blockedReason ?? undefined}
              className={clsx(
                "inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed",
                automation.enabled
                  ? "border border-line bg-surface text-ink-secondary hover:bg-surface-muted"
                  : "bg-brand-700 text-white hover:bg-brand-800",
              )}
            >
              {automation.enabled ? "Turn off" : "Turn on"}
            </button>
          </div>
        </div>
      </div>

      {/* Cohort comparison — the payoff of batching: one row per release, so
          you can read whether batch 1001 outperformed 1000. */}
      {cohorts.length > 0 && (
        <div className="border-t border-gray-100 px-6 py-4 bg-white">
          <div className="max-w-xl mx-auto">
            <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              <Layers size={11} />
              Batches
            </h3>
            <div className="overflow-hidden rounded-lg border border-gray-100">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="px-2.5 py-1.5 font-medium">Batch</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Size</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">In flow</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Finished</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Exited</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cohorts.map((c) => (
                    <tr key={c.number}>
                      <td className="px-2.5 py-1.5 font-medium text-gray-800">{c.label}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-gray-700">
                        {c.total}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-gray-500">
                        {c.active}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-gray-500">
                        {c.completed}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-gray-500">
                        {c.exited}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[10px] text-gray-400">
              &ldquo;Exited&rdquo; counts customers removed by a rule above —
              usually because they ordered or replied, which is the outcome you
              want. A higher exit rate is a better-performing batch.
            </p>
          </div>
        </div>
      )}

      {/* Activity (collapsed when empty) */}
      {(enrollments.length > 0 || recent.length > 0) && (
        <div className="border-t border-gray-100 px-6 py-4 bg-white">
          <div className="max-w-xl mx-auto grid grid-cols-2 gap-4">
            <ActivityPanel
              icon={<Users size={11} />}
              title="Currently in flow"
              count={enrollments.filter((e) => e.status === "enrolled").length}
              detail={`${enrollments.filter((e) => e.status === "completed").length} completed`}
            />
            <ActivityPanel
              icon={<Mail size={11} />}
              title="Sent in last 30 days"
              count={recent.filter((r) => r.status === "sent").length}
              detail={
                recent.length > 0
                  ? `Latest: ${new Date(recent[0].sent_at).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric" },
                    )}`
                  : ""
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Small UI pieces ──────────────────────────────────────────────────── */

function InlineEditableTitle({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onSave(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") inputRef.current?.blur();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="text-lg font-semibold text-gray-900 bg-transparent border-b border-gray-300 focus:outline-none focus:border-gray-900"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="text-lg font-semibold text-gray-900 hover:bg-gray-50 rounded px-1 -mx-1 transition inline-flex items-center gap-1 group"
    >
      {value}
      <Pencil size={12} className="text-gray-300 group-hover:text-gray-500 transition" />
    </button>
  );
}

function FlowCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm px-5 py-4 space-y-1.5">
      {children}
    </div>
  );
}

function FlowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  // Visual matches the /customers + /customers/d2c filter dropdowns:
  // white background, gray border, rounded-lg, same padding + text size.
  return (
    <span className="inline-flex items-center rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 transition px-3 py-1.5 text-xs font-medium text-gray-700 cursor-pointer">
      {children}
    </span>
  );
}

function Arrow({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center py-1">
      <ArrowDown size={14} className="text-gray-300" />
      {children && <div className="my-1">{children}</div>}
      {children && <ArrowDown size={14} className="text-gray-300" />}
    </div>
  );
}

/**
 * Custom-duration modal. Replaces window.prompt(), which couldn't express
 * weeks, gave no validation, and is blocked outright in some browsers.
 */
function CustomDurationModal({
  title,
  initialDays,
  minDays,
  onCancel,
  onSave,
}: {
  title: string;
  initialDays: number;
  minDays: number;
  onCancel: () => void;
  onSave: (days: number) => void;
}) {
  /* Mounted only while open (callers gate on state), so the initial value can
     be derived once here instead of synced from an effect. Seeded in weeks
     when it divides evenly — 14 reads better as "2 weeks" than "14 days". */
  const useWeeks = initialDays > 0 && initialDays % 7 === 0;
  const [amount, setAmount] = useState(() =>
    String(useWeeks ? initialDays / 7 : initialDays),
  );
  const [unit, setUnit] = useState<"days" | "weeks">(useWeeks ? "weeks" : "days");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const parsed = Number(amount);
  const days = unit === "weeks" ? parsed * 7 : parsed;
  const valid = Number.isFinite(days) && Number.isInteger(days) && days >= minDays;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-xs rounded-2xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <button
            onClick={onCancel}
            className="text-gray-400 transition hover:text-gray-600"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid) onSave(days);
              }}
              className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm tabular-nums focus:border-gray-400 focus:outline-none"
            />
            <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5">
              {(["days", "weeks"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={clsx(
                    "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition",
                    unit === u
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700",
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-gray-500">
            {valid ? (
              <>
                = <span className="font-medium text-gray-700">{days} day{days === 1 ? "" : "s"}</span>
                {unit === "weeks" && " total"}
              </>
            ) : (
              <span className="text-amber-700">
                Enter a whole number of {minDays > 0 ? `at least ${minDays}` : "0 or more"}.
              </span>
            )}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(days)}
            disabled={!valid}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function DaysPicker({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (v: number) => void | Promise<void>;
  options: { label: string; value: number }[];
}) {
  const matched = options.find((o) => o.value === value);
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <>
    {modalOpen && (
      <CustomDurationModal
        title="Custom timeframe"
        initialDays={value}
        minDays={1}
        onCancel={() => setModalOpen(false)}
        onSave={(d) => {
          setModalOpen(false);
          onChange(d);
        }}
      />
    )}
    <select
      value={matched ? String(value) : "__custom__"}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__custom__") setModalOpen(true);
        else onChange(Number(v));
      }}
      className="bg-transparent focus:outline-none cursor-pointer pr-4"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {!matched && (
        <option value={String(value)}>{value} days</option>
      )}
      <option value="__custom__">Custom…</option>
    </select>
    </>
  );
}

/**
 * A wait between steps, rendered as a step in its own right.
 *
 * It writes to the *following* email's delay_days — the schema attaches the
 * delay to the email it precedes — so the runner needs no changes. The first
 * one measures from enrollment, which the old delay pill never exposed at all:
 * step 1 was hard-coded to 0 and uneditable.
 */
function WaitRow({
  value,
  isFirst,
  onChange,
}: {
  value: number;
  isFirst: boolean;
  onChange: (v: number) => void | Promise<void>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const label =
    value === 0
      ? isFirst
        ? "Immediately on enrolling"
        : "Immediately after"
      : value % 7 === 0
        ? `Wait ${value / 7} week${value / 7 === 1 ? "" : "s"}`
        : `Wait ${value} day${value === 1 ? "" : "s"}`;

  return (
    <div className="w-full rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2">
      {modalOpen && (
        <CustomDurationModal
          title={isFirst ? "Wait how long after enrolling?" : "Wait how long?"}
          initialDays={value}
          minDays={0}
          onCancel={() => setModalOpen(false)}
          onSave={(d) => {
            setModalOpen(false);
            onChange(d);
          }}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-800">
          <Clock size={11} className="shrink-0" />
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <select
            value={DELAY_OPTIONS.some((o) => o.value === value) ? String(value) : "__custom__"}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__custom__") setModalOpen(true);
              else onChange(Number(v));
            }}
            className="rounded-md border border-amber-200 bg-white px-1.5 py-1 text-[11px] text-amber-900 focus:outline-none cursor-pointer"
          >
            {DELAY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {!DELAY_OPTIONS.some((o) => o.value === value) && (
              <option value={String(value)}>{value} days later</option>
            )}
            <option value="__custom__">Custom…</option>
          </select>
        </div>
      </div>
    </div>
  );
}


/**
 * Render the trigger-specific portion of the section 2 card.
 * Audience picker lives in section 1; this just configures the trigger event.
 */
function renderTriggerSentence(
  type: TriggerType,
  cfg: Automation["trigger_config"],
  patchCfg: (u: Partial<Automation["trigger_config"]>) => void | Promise<void>,
): React.ReactNode {
  if (type === "status_change") {
    const target = cfg.status_target ?? "at_risk";
    return (
      <>
        When a customer becomes{" "}
        <Pill>
          <select
            value={target}
            onChange={(e) =>
              patchCfg({ status_target: e.target.value as "at_risk" | "churned" })
            }
            className="bg-transparent focus:outline-none cursor-pointer pr-4"
          >
            <option value="at_risk">At Risk (180 days inactive)</option>
            <option value="churned">Churned (365 days inactive)</option>
          </select>
        </Pill>
        .
      </>
    );
  }

  if (type === "order_event") {
    const subtype = cfg.order_event_type ?? "first";
    const daysAfter = cfg.days_after ?? 7;
    return (
      <>
        <Pill>
          <DaysPicker
            value={daysAfter}
            onChange={(v) => patchCfg({ days_after: v })}
            options={AFTER_ORDER_DAYS_OPTIONS}
          />
        </Pill>{" "}
        after a customer&apos;s{" "}
        <Pill>
          <select
            value={subtype}
            onChange={(e) =>
              patchCfg({ order_event_type: e.target.value as "first" | "last" })
            }
            className="bg-transparent focus:outline-none cursor-pointer pr-4"
          >
            <option value="first">first order</option>
            <option value="last">most recent order</option>
          </select>
        </Pill>
        .
      </>
    );
  }

  if (type === "date") {
    const date = cfg.scheduled_at ?? "";
    const recurring: Recurring = cfg.recurring ?? "none";
    return (
      <>
        <Pill>
          <input
            type="date"
            value={date}
            onChange={(e) => patchCfg({ scheduled_at: e.target.value })}
            className="bg-transparent focus:outline-none cursor-pointer"
          />
        </Pill>{" "}
        — repeat:{" "}
        <Pill>
          <select
            value={recurring}
            onChange={(e) => patchCfg({ recurring: e.target.value as Recurring })}
            className="bg-transparent focus:outline-none cursor-pointer pr-4"
          >
            <option value="none">Never (one-time)</option>
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
            <option value="quarterly">Every 3 months</option>
            <option value="annually">Every year</option>
          </select>
        </Pill>
        .
      </>
    );
  }

  // manual
  return <>Customers are added by hand — no automatic enrollment.</>;
}

/**
 * Section 3 filters row. Total Spend, Channel (wholesale only), State, and
 * Status (only meaningful for Date triggers — for status_change it's already
 * the trigger). We render them all but disable Status outside Date triggers.
 */
function FiltersRow({
  cfg,
  patchCfg,
}: {
  cfg: Automation["trigger_config"];
  patchCfg: (u: Partial<Automation["trigger_config"]>) => void | Promise<void>;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Total Spend */}
      <select
        value={String(cfg.min_spend ?? 0)}
        onChange={(e) => {
          const v = Number(e.target.value);
          patchCfg({ min_spend: v > 0 ? v : undefined });
        }}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
        title="Minimum lifetime spend"
      >
        <option value="0">Any total spend</option>
        <option value="50">$50+</option>
        <option value="100">$100+</option>
        <option value="250">$250+</option>
        <option value="500">$500+</option>
        <option value="1000">$1,000+</option>
        <option value="5000">$5,000+</option>
        <option value="10000">$10,000+</option>
        <option value="25000">$25,000+</option>
        <option value="100000">$100,000+</option>
      </select>

      {/* State — multi-select. A legacy single `state` is folded in as a
          one-item selection and cleared on the next change, so old configs
          keep working without a data migration. */}
      <MultiSelect
        values={cfg.states ?? (cfg.state ? [cfg.state] : [])}
        options={STATE_OPTIONS}
        searchable
        anyLabel="Any state"
        noun="states"
        title="Filter by billing state"
        onChange={(next) =>
          patchCfg({ states: next.length ? next : undefined, state: undefined })
        }
      />

      {/* Channel — only meaningful for wholesale */}
      {(cfg.audience === "wholesale" || cfg.audience === "both") && (
        <MultiSelect
          values={cfg.channels ?? (cfg.channel ? [cfg.channel] : [])}
          options={CHANNEL_OPTIONS}
          anyLabel="Any channel"
          noun="channels"
          title="Filter by wholesale channel"
          onChange={(next) =>
            patchCfg({ channels: next.length ? next : undefined, channel: undefined })
          }
        />
      )}
    </div>
  );
}

/* Wholesale channels, matching the set the Sales Hub reports on. */
const CHANNEL_OPTIONS = [
  "GIFT",
  "SALON/SPA",
  "PHARMACY",
  "NAT/GROCERY",
  "HOSPITAL",
  "DISTRIBUTOR",
  "HARDWARE",
  "WEB",
  "FLOWER",
  "CASINOS",
  "SOCIAL SELLER",
];

const STATE_OPTIONS = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

/**
 * Checkbox dropdown. Closes on outside click / Escape; the trigger summarises
 * the selection so the closed state still reads as a sentence ("3 states").
 */
function MultiSelect({
  values,
  options,
  onChange,
  anyLabel,
  noun,
  title,
  searchable,
}: {
  values: string[];
  options: string[];
  onChange: (next: string[]) => void | Promise<void>;
  anyLabel: string;
  noun: string;
  title?: string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label =
    values.length === 0
      ? anyLabel
      : values.length <= 2
        ? values.join(", ")
        : `${values.length} ${noun}`;

  const shown = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function toggle(opt: string) {
    onChange(
      values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt],
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition",
          values.length > 0
            ? "border-gray-300 bg-gray-50 text-gray-800"
            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
        )}
      >
        <span className="max-w-[150px] truncate">{label}</span>
        <ChevronDown size={12} className="shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg">
          {searchable && (
            <div className="border-b border-gray-100 p-1.5">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-gray-400 focus:outline-none"
              />
            </div>
          )}

          <div className="max-h-56 overflow-y-auto p-1">
            {shown.map((opt) => {
              const on = values.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                >
                  <span
                    className={clsx(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                      on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300",
                    )}
                  >
                    {on && <Check size={9} />}
                  </span>
                  <span className="truncate">{opt}</span>
                </button>
              );
            })}
            {shown.length === 0 && (
              <div className="px-2 py-3 text-center text-[11px] text-gray-400">
                No matches
              </div>
            )}
          </div>

          {values.length > 0 && (
            <div className="border-t border-gray-100 p-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExitToggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-gray-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-gray-300 accent-gray-900"
      />
      <span className="min-w-0">
        <span className="block text-xs text-gray-700">{label}</span>
        <span className="block text-[10px] text-gray-400">{hint}</span>
      </span>
    </label>
  );
}

function FilterPill({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: "green" | "amber" | "gray";
  children: React.ReactNode;
}) {
  let activeClasses = "bg-gray-900 text-white border-gray-900";
  if (color === "green") activeClasses = "bg-green-50 text-green-700 border-green-200";
  if (color === "amber") activeClasses = "bg-amber-50 text-amber-700 border-amber-200";
  if (color === "gray") activeClasses = "bg-gray-100 text-gray-600 border-gray-300";
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-lg px-3 py-2 text-xs font-medium border transition",
        active
          ? activeClasses
          : "bg-white text-gray-500 border-gray-200 hover:border-gray-300",
      )}
    >
      {children}
    </button>
  );
}

function ActivityPanel({
  icon,
  title,
  count,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-2.5">
      <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider inline-flex items-center gap-1">
        {icon}
        {title}
      </div>
      <div className="text-xl font-semibold text-gray-900 tabular-nums mt-0.5">{count}</div>
      {detail && <div className="text-[10px] text-gray-400">{detail}</div>}
    </div>
  );
}
