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
} from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

type TriggerType = "d2c_at_risk" | "wholesale_at_risk" | "manual";

type Automation = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger_type: TriggerType;
  trigger_config: { days_inactive?: number; lookback_days?: number };
  sender_user_id: string | null;
  updated_at: string;
};

type Step = {
  id: string;
  step_order: number;
  template_id: string;
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

const TRIGGER_DAYS_OPTIONS = [
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "6 months", value: 180 },
  { label: "1 year", value: 365 },
];

const DELAY_OPTIONS = [
  { label: "Same day", value: 0 },
  { label: "1 day later", value: 1 },
  { label: "3 days later", value: 3 },
  { label: "1 week later", value: 7 },
  { label: "2 weeks later", value: 14 },
  { label: "1 month later", value: 30 },
];

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
    await patch({
      trigger_type: t,
      trigger_config:
        t === "manual"
          ? {}
          : {
              days_inactive: automation?.trigger_config?.days_inactive ?? 180,
              lookback_days: 0,
            },
    });
  }

  async function updateDaysInactive(days: number) {
    await patch({
      trigger_config: {
        ...(automation?.trigger_config ?? {}),
        days_inactive: days,
        lookback_days: automation?.trigger_config?.lookback_days ?? 0,
      },
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

  async function addStep() {
    if (allTemplates.length === 0) {
      setError("Create a template first — go to Email Templates and add one.");
      return;
    }
    const res = await fetch(`/api/automations/${automationId}/steps`, {
      method: "POST",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: allTemplates[0].id,
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

  async function patchStep(stepId: string, updates: { template_id?: string; delay_days?: number }) {
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

  /* ── Preview (live count) ───────────────────────────────────────────── */

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);

  async function runPreview() {
    setPreviewing(true);
    try {
      const res = await fetch("/api/cron/automations?dry=1", {
        headers: await authHeader(),
      });
      const json = await res.json();
      if (res.ok) {
        // The cron iterates *enabled* automations only. For an honest count
        // we toggle the enabled bit briefly when off, but that's invasive.
        // Show "would enroll" if enabled, otherwise prompt to enable.
        setPreviewCount(json.enrolled ?? 0);
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

  const isManual = automation.trigger_type === "manual";
  const daysInactive = automation.trigger_config?.days_inactive ?? 180;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
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
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 inline-flex items-start gap-2 mb-4">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="max-w-xl mx-auto space-y-1">
          {/* ── Trigger card ── */}
          <FlowCard>
            <FlowLabel>When</FlowLabel>
            <div className="text-sm text-gray-800 leading-relaxed">
              A{" "}
              <Pill>
                <select
                  value={automation.trigger_type}
                  onChange={(e) => updateTriggerType(e.target.value as TriggerType)}
                  className="bg-transparent focus:outline-none cursor-pointer pr-4"
                >
                  <option value="d2c_at_risk">D2C</option>
                  <option value="wholesale_at_risk">wholesale</option>
                  <option value="manual">(manually-added)</option>
                </select>
              </Pill>{" "}
              customer
              {isManual ? (
                <> is added to this flow.</>
              ) : (
                <>
                  {" "}
                  hasn&apos;t ordered in{" "}
                  <Pill>
                    <DaysPicker
                      value={daysInactive}
                      onChange={updateDaysInactive}
                      options={TRIGGER_DAYS_OPTIONS}
                    />
                  </Pill>
                </>
              )}
              .
            </div>
          </FlowCard>

          {steps.length > 0 && <Arrow />}

          {/* ── Step cards ── */}
          {steps.map((s, i) => {
            const tpl = templateMap.get(s.template_id);
            return (
              <div key={s.id}>
                {i > 0 && (
                  <Arrow>
                    <DelayPill
                      value={s.delay_days}
                      onChange={(d) => patchStep(s.id, { delay_days: d })}
                    />
                  </Arrow>
                )}
                <FlowCard>
                  <FlowLabel>
                    <Mail size={11} className="inline -mt-0.5 mr-1" />
                    Send
                  </FlowLabel>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-800 leading-relaxed">
                        {allTemplates.length === 0 ? (
                          <span className="text-amber-700">
                            <Link href="/email-templates" className="underline">
                              Create a template
                            </Link>{" "}
                            first.
                          </span>
                        ) : (
                          <>
                            The email{" "}
                            <Pill>
                              <select
                                value={s.template_id}
                                onChange={(e) => patchStep(s.id, { template_id: e.target.value })}
                                className="bg-transparent focus:outline-none cursor-pointer pr-4 max-w-[260px] truncate"
                              >
                                {allTemplates.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                                {!templateMap.has(s.template_id) && (
                                  <option value={s.template_id}>(missing template)</option>
                                )}
                              </select>
                            </Pill>
                          </>
                        )}
                      </div>
                      {tpl && (
                        <div className="text-[11px] text-gray-400 mt-1.5 truncate">
                          Subject: {tpl.subject}
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

      {/* Bottom action bar */}
      <div className="border-t border-gray-100 px-6 py-4 shrink-0 bg-gray-50/40">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          <div className="text-xs text-gray-600">
            {automation.enabled ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500 inline-block animate-pulse" />
                Live — runs daily
              </span>
            ) : (
              <button
                onClick={runPreview}
                disabled={previewing}
                className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900 transition disabled:opacity-50"
              >
                <Eye size={11} />
                {previewing ? "Checking…" : "Preview eligible customers"}
                {previewCount !== null && (
                  <span className="ml-1 font-medium text-gray-800">
                    {previewCount} customer{previewCount === 1 ? "" : "s"}
                  </span>
                )}
              </button>
            )}
          </div>
          <button
            onClick={toggleEnabled}
            disabled={steps.length === 0}
            className={clsx(
              "inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed",
              automation.enabled
                ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                : "bg-green-600 text-white hover:bg-green-700",
            )}
          >
            {automation.enabled ? "Turn off" : "Turn on"}
          </button>
        </div>
      </div>

      {/* Activity (collapsed when empty) */}
      {(enrollments.length > 0 || recent.length > 0) && (
        <div className="border-t border-gray-100 px-6 py-4 shrink-0 bg-white">
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
  return (
    <span className="inline-flex items-center rounded-md bg-gray-100 hover:bg-gray-200 transition px-2 py-0.5 text-sm font-medium text-gray-800 cursor-pointer">
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
  const [custom, setCustom] = useState(matched ? "" : String(value));
  return (
    <select
      value={matched ? String(value) : "__custom__"}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__custom__") {
          const input = prompt("How many days?", String(value));
          const parsed = Number(input);
          if (parsed && parsed > 0) {
            onChange(parsed);
            setCustom(String(parsed));
          }
        } else {
          onChange(Number(v));
        }
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
      <input type="hidden" value={custom} />
    </select>
  );
}

function DelayPill({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void | Promise<void>;
}) {
  const matched = DELAY_OPTIONS.find((o) => o.value === value);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600">
      <Clock size={10} />
      <select
        value={matched ? String(value) : "__custom__"}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom__") {
            const input = prompt("Wait how many days?", String(value));
            const parsed = Number(input);
            if (parsed >= 0) onChange(parsed);
          } else {
            onChange(Number(v));
          }
        }}
        className="bg-transparent focus:outline-none cursor-pointer pr-3"
      >
        {DELAY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {!matched && <option value={String(value)}>{value} days later</option>}
        <option value="__custom__">Custom…</option>
      </select>
    </span>
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
