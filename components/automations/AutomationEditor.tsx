"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Trash2,
  Plus,
  AlertTriangle,
  Mail,
  Clock,
  Users,
  Eye,
  Pencil,
  Check,
  X,
  ChevronDown,
  Send,
  Layers,
  FlaskConical,
  Play,
  Calendar,
  Zap,
  LogOut,
} from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { JourneyStrip, EmailInspector, type StepResult } from "./Journey";
import { flowKind, flowPriority, PRIORITY_OPTIONS } from "@/lib/automations/overlap";

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
    exit_on_click?: boolean;
    /** Legacy name, honoured for configs saved before mail went outbound-only. */
    exit_on_reply?: boolean;
    /** Needs live inbound ingestion; gated by /api/email/inbound-health. */
    exit_on_reply_inbound?: boolean;
    exit_on_active?: boolean;
    exit_after_days?: number;
    /** D2C only: limit to buyers of this brand (see the cron runner). */
    brand?: string;
    /** order_event only: a customer who orders again restarts at step 1. */
    reenroll_on_new_order?: boolean;
    /** Overlap: "journey" = one at a time, won by priority (1 = highest);
     *  "one_off" may overlap other flows. See lib/automations/overlap.ts. */
    flow_kind?: "journey" | "one_off";
    priority?: number;
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
  /** When set (YYYY-MM-DD), the step is pinned to this exact date rather than
   *  waiting delay_days. This is what a dated "Schedule" campaign uses. */
  send_date?: string | null;
};

type Template = {
  id: string;
  name: string;
  subject: string;
  /** "text" plain-text, or a designed template ("blocks" builder / "html" upload). */
  source?: "text" | "blocks" | "html";
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
  const [, setEnrollments] = useState<Enrollment[]>([]);
  const [recent, setRecent] = useState<StepSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [testEmail, setTestEmail] = useState(DEFAULT_TEST_EMAIL);
  /** "" = built-in sample; otherwise "<type>:<ref>" from the preview list. */
  const [testCustomer, setTestCustomer] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  /* Guard rail: reply rules are only offered when inbound mail is genuinely
     flowing. Otherwise "exit on reply" silently never fires, and "no reply
     after N days" exits everyone. */
  const [inbound, setInbound] = useState<{
    healthy: boolean;
    everReceived: boolean;
    reason: string | null;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ ok: boolean; text: string } | null>(null);

  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }, []);

  const reload = useCallback(async () => {
    const [detailRes, templatesRes] = await Promise.all([
      fetch(`/api/automations/${automationId}`, { headers: await authHeader() }),
      fetch("/api/email/templates?include=designed", { headers: await authHeader() }),
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

    // Non-blocking: a failure here just leaves the reply rule disabled.
    fetch("/api/email/inbound-health", { headers: await authHeader() })
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => h && setInbound(h))
      .catch(() => {});
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
      brand: automation?.trigger_config?.brand,
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
        reenroll_on_new_order: automation?.trigger_config?.reenroll_on_new_order,
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
    const created = await res.json().catch(() => null);
    await reload();
    if (created?.step?.id) setSelectedStepId(created.step.id);
    await onChanged();
    flashSaved();
  }

  async function patchStep(
    stepId: string,
    updates: { template_id?: string | null; delay_days?: number; send_date?: string | null },
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
  /** Qualify, but already in an equal-or-higher-priority journey. */
  const [heldCount, setHeldCount] = useState(0);

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
      // Scoped to this automation — unscoped, the dry run sums every flow.
      const res = await fetch(`/api/cron/automations?dry=1&automation=${encodeURIComponent(automationId)}`, {
        headers: await authHeader(),
      });
      const json = await res.json();
      if (res.ok) {
        setPreviewCount(json.enrolled ?? 0);
        setPreviewSample((json.sample_candidates as PreviewCandidate[]) ?? []);
        setInvalidEmailCount(json.invalid_emails ?? 0);
        setSuspectEmailCount(json.suspect_emails ?? 0);
        setHeldCount(json.held_by_other_flow ?? 0);
        setShowSample(true);
      }
    } finally {
      setPreviewing(false);
    }
  }

  /* ── Journey state: per-email results, the selected email, open panels ── */

  const [results, setResults] = useState<Map<number, StepResult>>(new Map());
  const [resultTotals, setResultTotals] = useState({ enrolled: 0, delivered: 0, orders: 0, revenue: 0 });
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  /** Which setup panel is expanded under the Who / Starts / Stops strip. */
  const [openPanel, setOpenPanel] = useState<"who" | "starts" | "stops" | null>(null);
  const [showTestSend, setShowTestSend] = useState(false);

  // Results are keyed by step order, so refetch whenever the steps change.
  const stepsKey = steps.map((s) => `${s.id}:${s.step_order}:${s.template_id}`).join("|");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/automations/${automationId}/performance`, { headers: await authHeader() });
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as { enrolled: number; steps: StepResult[] };
      const map = new Map(json.steps.map((s) => [s.step_order, s]));
      setResults(map);
      setResultTotals({
        enrolled: json.enrolled,
        delivered: json.steps.reduce((a, s) => a + s.delivered, 0),
        orders: json.steps.reduce((a, s) => a + s.orders, 0),
        revenue: json.steps.reduce((a, s) => a + s.revenue, 0),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [automationId, stepsKey]);

  // Keep a valid selection: the first email by default, and never a deleted one.
  useEffect(() => {
    if (steps.length === 0) setSelectedStepId(null);
    else if (!steps.some((s) => s.id === selectedStepId)) setSelectedStepId(steps[0].id);
  }, [steps, selectedStepId]);

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

  /* ── Journey derived values ── */
  const kind = flowKind(t, cfg);
  const priority = flowPriority(cfg);
  const baseDay = t === "order_event" ? cfg.days_after ?? 7 : 0;
  const stepDays: number[] = [];
  steps.forEach((s, i) => stepDays.push((i === 0 ? baseDay : stepDays[i - 1]) + s.delay_days));
  const selectedIndex = steps.findIndex((s) => s.id === selectedStepId);
  const selectedStep = selectedIndex >= 0 ? steps[selectedIndex] : null;

  const whoSummary = [
    cfg.audience === "wholesale" ? "Wholesale accounts" : cfg.audience === "both" ? "All customers" : "D2C shoppers",
    cfg.audience !== "wholesale" && cfg.brand ? `who bought ${cfg.brand}` : null,
    cfg.min_spend ? `$${cfg.min_spend.toLocaleString()}+ lifetime` : null,
    (cfg.states?.length ?? 0) > 0 ? `in ${cfg.states!.length <= 2 ? cfg.states!.join(", ") : `${cfg.states!.length} states`}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const startsSummary = triggerSummaryText(t, cfg);
  const stopRules = [
    cfg.exit_on_order ? (cfg.reenroll_on_new_order ? "They order (then restart)" : "They order") : null,
    cfg.exit_on_click ?? cfg.exit_on_reply ? "They click" : null,
    cfg.exit_on_reply_inbound ? "They reply" : null,
    cfg.exit_on_active ? "They're active again" : null,
    cfg.exit_after_days ? `No clicks in ${cfg.exit_after_days}d` : null,
    "They unsubscribe",
  ].filter(Boolean) as string[];
  const money0 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="flex flex-col bg-surface-muted">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 border-b border-line bg-surface/95 px-6 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <InlineEditableTitle value={automation.name} onSave={updateName} />
            <span
              className={clsx(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                automation.enabled && cfg.test_mode
                  ? "bg-warning-soft text-warning"
                  : automation.enabled
                    ? "bg-positive-soft text-positive"
                    : "bg-surface-sunken text-ink-muted",
              )}
              title={automation.enabled ? `Next run ${nextRunLabel()}` : undefined}
            >
              <span
                className={clsx(
                  "h-1.5 w-1.5 rounded-full",
                  automation.enabled ? (cfg.test_mode ? "bg-warning" : "animate-pulse bg-positive") : "bg-ink-subtle",
                )}
              />
              {automation.enabled ? (cfg.test_mode ? "Test batch" : "Live") : "Off"}
            </span>
            <span
              className="inline-flex shrink-0 items-center rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-ink-muted"
              title={kind === "journey" ? "One journey at a time; the higher priority wins. Change under Starts." : "Can overlap other flows. Change under Starts."}
            >
              {kind === "journey" ? `Journey · Priority ${priority}` : "One-off"}
            </span>
            {savedFlash && (
              <span className="inline-flex items-center gap-1 text-[11px] text-positive">
                <Check size={11} /> Saved
              </span>
            )}
          </div>

          <dl className="flex items-center gap-5 text-right">
            <HeaderStat label="Enrolled" value={resultTotals.enrolled.toLocaleString()} />
            <HeaderStat label="Sent" value={resultTotals.delivered.toLocaleString()} />
            <HeaderStat label="Orders" value={resultTotals.orders.toLocaleString()} />
            <HeaderStat label="Revenue" value={money0(resultTotals.revenue)} />
          </dl>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowTestSend((v) => !v)}
              aria-expanded={showTestSend}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-secondary transition hover:bg-surface-muted"
            >
              <Send size={13} /> Send test
            </button>
            {automation.enabled && (
              <button
                onClick={runNow}
                disabled={running}
                title="Enroll and send the first step now, without waiting for the scheduled run"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-secondary transition hover:bg-surface-muted disabled:opacity-50"
              >
                {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                Run now
              </button>
            )}
            <button
              onClick={toggleEnabled}
              disabled={!automation.enabled && !!blockedReason}
              title={blockedReason ?? undefined}
              className={clsx(
                "rounded-lg px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                automation.enabled
                  ? "border border-line bg-surface text-ink-secondary hover:bg-surface-muted"
                  : "bg-brand-700 text-white hover:bg-brand-800",
              )}
            >
              {automation.enabled ? "Turn off" : "Turn on"}
            </button>
            <button
              onClick={deleteAutomation}
              title="Delete automation"
              aria-label="Delete automation"
              className="rounded-lg p-2 text-ink-subtle transition hover:bg-critical-soft hover:text-critical"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {blockedReason && !automation.enabled && (
          <p className="mt-2 text-right text-[11px] text-warning">{blockedReason} before this can turn on.</p>
        )}

        {/* Send test — every email at once, to one address */}
        {showTestSend && (
          <div className="mt-3 rounded-xl border border-line bg-surface-muted p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !testing && steps.length > 0) sendTest();
                }}
                placeholder="you@example.com"
                aria-label="Send the test to"
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-brand-400 focus:outline-none sm:max-w-xs"
              />
              <select
                value={testCustomer}
                onChange={(e) => setTestCustomer(e.target.value)}
                aria-label="Fill merge fields with"
                className="min-w-0 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-ink focus:border-brand-400 focus:outline-none sm:max-w-xs"
              >
                <option value="">Sample customer data</option>
                {previewSample.map((c) => (
                  <option key={`${c.customer_type}:${c.customer_ref}`} value={`${c.customer_type}:${c.customer_ref}`}>
                    {c.name ?? c.customer_ref}&apos;s data · {c.customer_type === "d2c" ? "D2C" : "Wholesale"}
                  </option>
                ))}
              </select>
              {previewSample.length === 0 && (
                <button
                  onClick={runPreview}
                  disabled={previewing}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium text-brand-600 hover:text-brand-800 disabled:opacity-50"
                >
                  {previewing ? <Loader2 size={11} className="animate-spin" /> : <Users size={11} />}
                  Use a real customer&apos;s data
                </button>
              )}
              <button
                onClick={sendTest}
                disabled={testing || !testEmail.trim() || steps.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:opacity-40"
              >
                {testing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {testing ? "Sending…" : `Send all ${steps.length} email${steps.length === 1 ? "" : "s"}`}
              </button>
            </div>
            <p className="mt-2 text-[10px] text-ink-muted">
              Every email goes to this address now, ignoring the waits. A real customer only lends their merge-field
              values and is never emailed. Nothing is recorded against the automation.
            </p>
          </div>
        )}

        {[testResult, runResult].map(
          (r, i) =>
            r && (
              <div
                key={i}
                className={clsx(
                  "mt-3 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11px]",
                  r.ok ? "bg-positive-soft text-positive" : "bg-critical-soft text-critical",
                )}
              >
                {r.ok ? <Check size={12} className="mt-px shrink-0" /> : <AlertTriangle size={12} className="mt-px shrink-0" />}
                <span className="min-w-0">{r.text}</span>
              </div>
            ),
        )}
        {error && (
          <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-critical-soft px-3 py-2 text-[11px] text-critical">
            <AlertTriangle size={12} className="mt-px shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {cfg.test_mode && (
        <div className="flex items-center gap-2 border-b border-warning/20 bg-warning-soft px-6 py-2 text-[11px] text-warning">
          <FlaskConical size={12} />
          Test batch: real customers are picked and the full sequence runs on schedule, but every email goes to{" "}
          <span className="font-semibold">{cfg.test_email}</span>.
        </div>
      )}

      {!KNOWN_TRIGGERS.includes(t) && (
        <div className="flex items-center gap-2 border-b border-warning/20 bg-warning-soft px-6 py-2 text-[11px] text-warning">
          <AlertTriangle size={12} />
          This automation has an unrecognized trigger ({String(t)}), so it will never enroll anyone. Pick one under Starts.
        </div>
      )}

      <div className="space-y-6 px-6 py-6">
        {/* ── Setup: who, when it starts, when it stops ── */}
        <section>
          <div className="grid gap-3 md:grid-cols-3">
            <SetupCard
              icon={<Users size={14} />}
              label="Who"
              summary={whoSummary}
              open={openPanel === "who"}
              onClick={() => setOpenPanel(openPanel === "who" ? null : "who")}
            />
            <SetupCard
              icon={<Zap size={14} />}
              label="Starts"
              summary={startsSummary}
              open={openPanel === "starts"}
              onClick={() => setOpenPanel(openPanel === "starts" ? null : "starts")}
            />
            <SetupCard
              icon={<LogOut size={14} />}
              label="Stops when"
              summary={stopRules.join(" · ")}
              open={openPanel === "stops"}
              onClick={() => setOpenPanel(openPanel === "stops" ? null : "stops")}
            />
          </div>

          {openPanel && (
            <div className="mt-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
              {openPanel === "who" && (
                <div className="space-y-4">
                  <PanelRow label="Audience">
                    <div className="flex flex-wrap items-center gap-1">
                      <FilterPill active={(cfg.audience ?? "d2c") === "d2c"} onClick={() => updateTriggerConfig({ audience: "d2c" })}>D2C</FilterPill>
                      <FilterPill active={cfg.audience === "wholesale"} onClick={() => updateTriggerConfig({ audience: "wholesale" })}>Wholesale</FilterPill>
                      <FilterPill active={cfg.audience === "both"} onClick={() => updateTriggerConfig({ audience: "both" })}>Both</FilterPill>
                    </div>
                  </PanelRow>
                  {(cfg.audience ?? "d2c") !== "wholesale" && (
                    <PanelRow label="D2C buyers of">
                      <div className="flex flex-wrap items-center gap-1">
                        <FilterPill active={!cfg.brand} onClick={() => updateTriggerConfig({ brand: undefined })}>Any brand</FilterPill>
                        <FilterPill active={cfg.brand === "Sassy"} onClick={() => updateTriggerConfig({ brand: "Sassy" })}>Sassy</FilterPill>
                        <FilterPill active={cfg.brand === "NI"} onClick={() => updateTriggerConfig({ brand: "NI" })}>NI</FilterPill>
                      </div>
                    </PanelRow>
                  )}
                  <PanelRow label="Narrow it down">
                    <FiltersRow cfg={cfg} patchCfg={updateTriggerConfig} />
                  </PanelRow>
                  <PanelRow label="Who qualifies now">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <button
                        onClick={runPreview}
                        disabled={previewing}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 font-medium text-ink-secondary transition hover:bg-surface-muted disabled:opacity-50"
                      >
                        {previewing ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                        {previewCount !== null ? "Check again" : "Check eligible customers"}
                      </button>
                      {previewCount !== null && (
                        <span className="text-ink-secondary">
                          <b className="font-semibold text-ink">{previewCount}</b> eligible
                          {invalidEmailCount > 0 && <span className="ml-2 text-critical">{invalidEmailCount} bad email{invalidEmailCount === 1 ? "" : "s"}</span>}
                          {suspectEmailCount > 0 && <span className="ml-2 text-warning">{suspectEmailCount} flagged</span>}
                          {heldCount > 0 && (
                            <span className="ml-2 text-ink-muted">
                              + {heldCount} waiting on a higher-priority flow
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    {showSample && previewSample.length > 0 && (
                      <ul className="mt-3 max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                        {previewSample.map((c) => (
                          <li key={`${c.customer_type}:${c.customer_ref}`} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                            <span className="min-w-0 flex-1 truncate font-medium text-ink">{c.name ?? "(no name)"}</span>
                            <span className={clsx("max-w-[220px] truncate", c.warning ? "text-warning" : "text-ink-muted")} title={c.warning ?? undefined}>
                              {c.email}
                            </span>
                            {c.last_order_date && (
                              <span className="shrink-0 tabular-nums text-[10px] text-ink-subtle">
                                {new Date(c.last_order_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </PanelRow>
                </div>
              )}

              {openPanel === "starts" && (
                <div className="space-y-4">
                  <PanelRow label="Trigger">
                    <div className="flex flex-wrap items-center gap-1">
                      <FilterPill active={t === "status_change"} onClick={() => updateTriggerType("status_change")}>Status change</FilterPill>
                      <FilterPill active={t === "order_event"} onClick={() => updateTriggerType("order_event")}>Order event</FilterPill>
                      <FilterPill active={t === "date"} onClick={() => updateTriggerType("date")}>Date</FilterPill>
                      <FilterPill active={t === "manual"} onClick={() => updateTriggerType("manual")}>Manual</FilterPill>
                    </div>
                  </PanelRow>
                  <PanelRow label="Rule">
                    <div className="text-sm leading-relaxed text-ink">{renderTriggerSentence(t, cfg, updateTriggerConfig)}</div>
                  </PanelRow>

                  {t === "status_change" && (
                    <PanelRow label="Release">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <FilterPill active={(cfg.batch_mode ?? "continuous") === "continuous"} onClick={() => updateTriggerConfig({ batch_mode: "continuous" })}>As they qualify</FilterPill>
                          <FilterPill active={cfg.batch_mode === "cohort"} onClick={() => updateTriggerConfig({ batch_mode: "cohort" })}>Weekly batches</FilterPill>
                        </div>
                        {cfg.batch_mode === "cohort" && (
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-secondary">
                            <span>Every</span>
                            <select
                              value={String(cfg.batch_weekday ?? 1)}
                              onChange={(e) => updateTriggerConfig({ batch_weekday: Number(e.target.value) })}
                              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
                            >
                              {WEEKDAYS.map((d, i) => (
                                <option key={d} value={i}>{d}</option>
                              ))}
                            </select>
                            <span>up to</span>
                            <select
                              value={String(cfg.batch_size ?? 0)}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                updateTriggerConfig({ batch_size: v > 0 ? v : undefined });
                              }}
                              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
                            >
                              <option value="0">everyone waiting</option>
                              <option value="25">25 customers</option>
                              <option value="50">50 customers</option>
                              <option value="100">100 customers</option>
                              <option value="200">200 customers</option>
                            </select>
                            <span>named</span>
                            <input
                              value={cfg.batch_label_prefix ?? ""}
                              onChange={(e) => updateTriggerConfig({ batch_label_prefix: e.target.value || undefined })}
                              placeholder={defaultBatchPrefix}
                              className="w-44 rounded-lg border border-line px-2 py-1.5 text-xs"
                            />
                            <input
                              type="number"
                              value={String(cfg.batch_start_number ?? 1000)}
                              onChange={(e) => updateTriggerConfig({ batch_start_number: Number(e.target.value) || undefined })}
                              aria-label="Starting batch number"
                              className="w-20 rounded-lg border border-line px-2 py-1.5 text-xs tabular-nums"
                            />
                            <span className="text-[11px] text-ink-muted">
                              Next: {(cfg.batch_label_prefix?.trim() || defaultBatchPrefix)} {nextBatchNumber}
                            </span>
                          </div>
                        )}
                      </div>
                    </PanelRow>
                  )}

                  <PanelRow label="Overlap">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <FilterPill active={kind === "journey"} onClick={() => updateTriggerConfig({ flow_kind: "journey" })}>
                          Journey: one at a time
                        </FilterPill>
                        <FilterPill active={kind === "one_off"} onClick={() => updateTriggerConfig({ flow_kind: "one_off" })}>
                          One-off: can overlap
                        </FilterPill>
                      </div>
                      {kind === "journey" ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
                          <span>Priority</span>
                          <select
                            value={String(priority)}
                            onChange={(e) => updateTriggerConfig({ priority: Number(e.target.value) })}
                            aria-label="Priority"
                            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
                          >
                            {PRIORITY_OPTIONS.map((p) => (
                              <option key={p} value={p}>{p}{p === 1 ? " (highest)" : ""}</option>
                            ))}
                          </select>
                          <span className="text-[11px] text-ink-muted">
                            A customer is in one journey at a time. A higher-priority journey pauses this one until
                            it&apos;s done; an equal or lower one waits.
                          </span>
                        </div>
                      ) : (
                        <p className="text-[11px] text-ink-muted">
                          Sends even if the customer is mid-journey elsewhere. The sending limits still apply.
                        </p>
                      )}
                    </div>
                  </PanelRow>

                  <PanelRow label="Test batch">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={!!cfg.test_mode}
                        onChange={(e) =>
                          updateTriggerConfig({
                            test_mode: e.target.checked || undefined,
                            test_email: e.target.checked ? cfg.test_email || DEFAULT_TEST_EMAIL : cfg.test_email,
                          })
                        }
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-amber-600"
                      />
                      <span className="text-xs text-ink-secondary">
                        Run on real customers and the real schedule, but deliver every email to a tester.
                      </span>
                    </label>
                    {cfg.test_mode && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          type="email"
                          value={cfg.test_email ?? ""}
                          onChange={(e) => updateTriggerConfig({ test_email: e.target.value || undefined })}
                          placeholder={DEFAULT_TEST_EMAIL}
                          aria-label="Test batch address"
                          className="w-64 rounded-lg border border-line px-2.5 py-1.5 text-xs"
                        />
                        <button
                          onClick={clearTestEnrollments}
                          disabled={running}
                          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink-secondary hover:bg-surface-muted disabled:opacity-50"
                        >
                          <Trash2 size={11} /> Clear test enrollments
                        </button>
                      </div>
                    )}
                  </PanelRow>
                </div>
              )}

              {openPanel === "stops" && (
                <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                  <ExitToggle checked={!!cfg.exit_on_order} onChange={(v) => updateTriggerConfig({ exit_on_order: v || undefined })} label="They place an order" hint="Stops the sequence the moment it works." />
                  {t === "order_event" && (
                    <ExitToggle
                      checked={!!cfg.reenroll_on_new_order}
                      onChange={(v) => updateTriggerConfig({ reenroll_on_new_order: v || undefined })}
                      label="…and restart them at email 1"
                      hint="Every new order resets the customer to Day 1."
                    />
                  )}
                  <ExitToggle
                    checked={!!(cfg.exit_on_click ?? cfg.exit_on_reply)}
                    onChange={(v) => updateTriggerConfig({ exit_on_click: v || undefined, exit_on_reply: undefined })}
                    label="They click a link"
                    hint="They're engaged. Let a person follow up."
                  />
                  <ExitToggle
                    checked={!!cfg.exit_on_reply_inbound}
                    disabled={!inbound?.healthy}
                    onChange={(v) => updateTriggerConfig({ exit_on_reply_inbound: v || undefined })}
                    label="They reply"
                    hint={
                      inbound === null
                        ? "Checking whether inbound mail is syncing…"
                        : inbound.healthy
                          ? "A real conversation has started."
                          : inbound.reason ?? "Unavailable: inbound mail isn't syncing, so replies can't be detected."
                    }
                  />
                  <ExitToggle checked={!!cfg.exit_on_active} onChange={(v) => updateTriggerConfig({ exit_on_active: v || undefined })} label="They're active again" hint="Ordered within the last 180 days." />
                  <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={!!cfg.exit_after_days}
                      onChange={(e) => updateTriggerConfig({ exit_after_days: e.target.checked ? 30 : undefined })}
                      aria-label="Exit after no clicks"
                      className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-gray-900"
                    />
                    <span className="text-xs text-ink-secondary">No clicks after</span>
                    <select
                      value={String(cfg.exit_after_days ?? 30)}
                      disabled={!cfg.exit_after_days}
                      onChange={(e) => updateTriggerConfig({ exit_after_days: Number(e.target.value) })}
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-xs disabled:opacity-40"
                    >
                      <option value="14">2 weeks</option>
                      <option value="30">1 month</option>
                      <option value="60">2 months</option>
                      <option value="90">3 months</option>
                    </select>
                  </div>
                  <p className="px-2 pt-1 text-[10px] text-ink-muted md:col-span-2">
                    Checked before every send. Anyone who unsubscribes is always removed.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Journey ── */}
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Journey</h3>
            {steps.length > 0 && (
              <span className="text-[11px] text-ink-muted">
                {steps.length} email{steps.length === 1 ? "" : "s"} over {stepDays[stepDays.length - 1] ?? 0} days
                {lastSendLabel && <> · last sent {lastSendLabel}</>}
              </span>
            )}
          </div>
          <JourneyStrip
            steps={steps}
            days={stepDays}
            templates={templateMap}
            results={results}
            triggerSummary={startsSummary}
            selectedId={selectedStepId}
            onSelect={setSelectedStepId}
            onAdd={addStep}
          />
        </section>

        {/* ── The selected email ── */}
        {selectedStep ? (
          <EmailInspector
            key={selectedStep.id}
            step={selectedStep}
            index={selectedIndex}
            count={steps.length}
            day={stepDays[selectedIndex]}
            templates={allTemplates}
            result={results.get(selectedStep.step_order)}
            timingControl={
              <WaitRow
                value={selectedStep.delay_days}
                sendDate={selectedStep.send_date ?? null}
                isFirst={selectedIndex === 0}
                onChange={(d) => patchStep(selectedStep.id, { delay_days: d, send_date: null })}
                onSetDate={(date) => patchStep(selectedStep.id, { send_date: date })}
              />
            }
            onTemplateChange={(id) => patchStep(selectedStep.id, { template_id: id })}
            onMove={(dir) => moveStep(selectedStep.id, dir)}
            onDelete={() => {
              if (confirm(`Remove email ${selectedIndex + 1} from this automation?`)) deleteStep(selectedStep.id);
            }}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <Mail size={20} className="mx-auto text-ink-subtle" />
            <p className="mt-2 text-sm font-medium text-ink">Add the first email</p>
            <p className="mt-1 text-[11px] text-ink-muted">Pick a template now, or add the step and write the email later.</p>
            <button
              onClick={addStep}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-800"
            >
              <Plus size={13} /> Add email
            </button>
          </div>
        )}

        {/* ── Batches (only once there are any) ── */}
        {cohorts.length > 0 && (
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Layers size={14} className="text-ink-muted" /> Batches
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-ink-subtle">
                  <th className="pb-2 font-medium">Batch</th>
                  <th className="pb-2 text-right font-medium">Size</th>
                  <th className="pb-2 text-right font-medium">In flow</th>
                  <th className="pb-2 text-right font-medium">Finished</th>
                  <th className="pb-2 text-right font-medium">Exited</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cohorts.map((c) => (
                  <tr key={c.number}>
                    <td className="py-1.5 font-medium text-ink">{c.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.total}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink-muted">{c.active}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink-muted">{c.completed}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink-muted">{c.exited}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-ink-muted">
              Exited counts customers a stop rule removed, usually because they ordered. More exits is the outcome you want.{" "}
              <Link href="/automations/cohorts" className="text-brand-600 hover:text-brand-800">Compare batches</Link>
            </p>
          </section>
        )}
      </div>
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



function Pill({ children }: { children: React.ReactNode }) {
  // Visual matches the /customers + /customers/d2c filter dropdowns:
  // white background, gray border, rounded-lg, same padding + text size.
  return (
    <span className="inline-flex items-center rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 transition px-3 py-1.5 text-xs font-medium text-gray-700 cursor-pointer">
      {children}
    </span>
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
 * The timing before a step, rendered as its own row. Two mutually-exclusive
 * modes:
 *
 *  · Wait — a relative offset written to the *following* email's delay_days
 *    (the schema attaches the delay to the email it precedes). The first one
 *    measures from enrollment; step 1 used to be hard-coded to 0 and uneditable.
 *
 *  · On date — the step is pinned to an exact calendar date (send_date). This
 *    is what a dated "Schedule" campaign uses: "Email #1 on May 1, Email #2 on
 *    May 8" instead of "+7 days". Switching to Wait clears the pin.
 */
function WaitRow({
  value,
  sendDate,
  isFirst,
  onChange,
  onSetDate,
}: {
  value: number;
  sendDate: string | null;
  isFirst: boolean;
  onChange: (v: number) => void | Promise<void>;
  onSetDate: (date: string) => void | Promise<void>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const pinned = !!sendDate;

  const relativeLabel =
    value === 0
      ? isFirst
        ? "Immediately on enrolling"
        : "Immediately after"
      : value % 7 === 0
        ? `Wait ${value / 7} week${value / 7 === 1 ? "" : "s"}`
        : `Wait ${value} day${value === 1 ? "" : "s"}`;

  const dateLabel = sendDate
    ? new Date(sendDate + "T00:00:00Z").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Pick a date";

  return (
    <div className="w-full rounded-xl border border-line bg-surface-muted px-3 py-2.5">
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
          {pinned ? (
            <Calendar size={11} className="shrink-0" />
          ) : (
            <Clock size={11} className="shrink-0" />
          )}
          {pinned ? `On ${dateLabel}` : relativeLabel}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {/* Mode toggle — Wait (relative) vs On date (pinned). */}
          <div className="flex rounded-md bg-surface-sunken p-0.5">
            <button
              type="button"
              onClick={() => {
                // Back to relative: clear the pin, keep the current delay.
                if (pinned) onChange(value);
              }}
              className={clsx(
                "rounded px-2 py-0.5 text-[10px] font-medium transition",
                !pinned ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
              )}
            >
              Wait
            </button>
            <button
              type="button"
              onClick={() => {
                // Switch to a pinned date; default to a week out if none yet.
                if (!pinned) {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  onSetDate(d.toISOString().slice(0, 10));
                }
              }}
              className={clsx(
                "rounded px-2 py-0.5 text-[10px] font-medium transition",
                pinned ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
              )}
            >
              On date
            </button>
          </div>

          {pinned ? (
            <input
              type="date"
              value={sendDate ?? ""}
              onChange={(e) => {
                if (e.target.value) onSetDate(e.target.value);
              }}
              className="rounded-md border border-line bg-surface px-1.5 py-1 text-[11px] text-ink focus:border-brand-400 focus:outline-none cursor-pointer"
            />
          ) : (
            <select
              // A non-preset wait has its own "N days later" option below, so the
              // select can show it directly instead of reading "Custom…".
              value={String(value)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom__") setModalOpen(true);
                else onChange(Number(v));
              }}
              className="rounded-md border border-line bg-surface px-1.5 py-1 text-[11px] text-ink focus:border-brand-400 focus:outline-none cursor-pointer"
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
          )}
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
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={clsx(
        "flex items-start gap-2 rounded-lg px-2 py-1.5 transition",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-gray-50",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-gray-300 accent-gray-900 disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        <span className="block text-xs text-gray-700">{label}</span>
        <span
          className={clsx(
            "block text-[10px]",
            disabled ? "text-amber-700" : "text-gray-400",
          )}
        >
          {hint}
        </span>
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


/* ─── Journey layout pieces ────────────────────────────────────────────── */

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <dt className="text-[10px] uppercase tracking-wider text-ink-subtle">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/** One of the Who / Starts / Stops summary cards; opens its settings below. */
function SetupCard({
  icon,
  label,
  summary,
  open,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  summary: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={clsx(
        "flex items-start gap-3 rounded-2xl border bg-surface p-4 text-left shadow-card transition",
        open ? "border-brand-500 ring-4 ring-brand-100" : "border-line hover:border-line-strong",
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">{label}</span>
        <span className="mt-0.5 block text-[13px] font-medium leading-snug text-ink">{summary}</span>
      </span>
      <ChevronDown size={14} className={clsx("mt-1 shrink-0 text-ink-subtle transition-transform", open && "rotate-180")} />
    </button>
  );
}

function PanelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
      <div className="pt-2 text-[11px] font-medium text-ink-muted">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** The trigger as one plain sentence, for the Starts card and the journey's first node. */
function triggerSummaryText(type: TriggerType, cfg: Automation["trigger_config"]): string {
  if (type === "order_event") {
    const d = cfg.days_after ?? 7;
    const when = d === 0 ? "The day of" : `${d} day${d === 1 ? "" : "s"} after`;
    return `${when} their ${cfg.order_event_type === "last" ? "latest" : "first"}${cfg.brand ? ` ${cfg.brand}` : ""} order`;
  }
  if (type === "status_change") return `When they become ${cfg.status_target === "churned" ? "Churned (365 days)" : "At Risk (180 days)"}`;
  if (type === "date") {
    const date = cfg.scheduled_at
      ? new Date(`${cfg.scheduled_at}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
      : "a date to pick";
    const every: Record<string, string> = { weekly: ", then weekly", monthly: ", then monthly", quarterly: ", then quarterly", annually: ", then yearly" };
    return `On ${date}${every[cfg.recurring ?? "none"] ?? ""}`;
  }
  if (type === "manual") return "When added by hand";
  return "No trigger set";
}
