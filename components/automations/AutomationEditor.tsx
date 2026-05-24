"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Save,
  Trash2,
  Plus,
  Play,
  AlertTriangle,
  CheckCircle2,
  GripVertical,
  Mail,
} from "lucide-react";
import clsx from "clsx";
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
  next_step_order: number | null;
  next_send_at: string | null;
  customer_name: string | null;
  customer_email: string | null;
  enrolled_at: string;
  last_error: string | null;
};

type StepSend = {
  id: string;
  step_order: number;
  status: string;
  error_text: string | null;
  sent_at: string;
  automation_enrollments: {
    customer_name: string | null;
    customer_email: string | null;
  } | null;
};

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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [allTemplates, setAllTemplates] = useState<Template[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [recent, setRecent] = useState<StepSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  /* Editable fields */
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("d2c_at_risk");
  const [daysInactive, setDaysInactive] = useState(180);
  const [lookbackDays, setLookbackDays] = useState(30);

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
    setTemplates((detail.templates as Template[]) ?? []);
    setRecent((detail.recent as StepSend[]) ?? []);
    setEnrollments((detail.enrollments as Enrollment[]) ?? []);
    setAllTemplates((tplJson?.templates as Template[]) ?? []);
    const a = detail.automation as Automation;
    setName(a.name ?? "");
    setDescription(a.description ?? "");
    setTriggerType(a.trigger_type);
    setDaysInactive(a.trigger_config?.days_inactive ?? 180);
    setLookbackDays(a.trigger_config?.lookback_days ?? 30);
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

  /* Lookups for showing template name on each step row. */
  const templateMap = useMemo(() => {
    const map = new Map<string, Template>();
    for (const t of [...templates, ...allTemplates]) map.set(t.id, t);
    return map;
  }, [templates, allTemplates]);

  async function patch(updates: Partial<Automation> & { trigger_config?: Record<string, unknown> }) {
    setBusy(true);
    setError(null);
    try {
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
      await onChanged();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig() {
    const ok = await patch({
      name,
      description: description.trim() || null,
      trigger_type: triggerType,
      trigger_config:
        triggerType === "manual"
          ? {}
          : { days_inactive: daysInactive, lookback_days: lookbackDays },
    });
    if (ok) {
      setBanner("Saved.");
      setTimeout(() => setBanner(null), 2500);
    }
  }

  async function toggleEnabled() {
    if (!automation) return;
    if (!automation.enabled && steps.length === 0) {
      setError("Add at least one step before enabling.");
      return;
    }
    const ok = await patch({ enabled: !automation.enabled });
    if (ok) {
      setBanner(automation.enabled ? "Paused." : "Live.");
      setTimeout(() => setBanner(null), 2500);
    }
  }

  async function deleteAutomation() {
    if (!confirm(`Delete "${automation?.name}"? Enrollments and step send history are also removed.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/automations/${automationId}`, {
        method: "DELETE",
        headers: await authHeader(),
      });
      if (res.ok || res.status === 204) {
        await onDeleted();
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json?.error ?? `Delete failed (${res.status})`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function addStep() {
    if (allTemplates.length === 0) {
      setError("Create a template first on /email-templates.");
      return;
    }
    const firstTplId = allTemplates[0].id;
    const res = await fetch(`/api/automations/${automationId}/steps`, {
      method: "POST",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: firstTplId, delay_days: 0 }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error ?? `Add failed (${res.status})`);
      return;
    }
    await reload();
    await onChanged();
  }

  async function patchStep(stepId: string, updates: { template_id?: string; delay_days?: number }) {
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
  }

  async function deleteStep(stepId: string) {
    if (!confirm("Remove this step?")) return;
    const res = await fetch(`/api/automations/${automationId}/steps/${stepId}`, {
      method: "DELETE",
      headers: await authHeader(),
    });
    if (res.ok || res.status === 204) {
      await reload();
      await onChanged();
    }
  }

  /* Test / preview helpers */
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<null | {
    enrolled: number;
    due_now: number;
    sample_due: unknown[];
  }>(null);

  async function runPreview() {
    setPreviewing(true);
    try {
      const res = await fetch("/api/cron/automations?dry=1", {
        headers: await authHeader(),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Preview failed (${res.status})`);
      } else {
        setPreview(json);
      }
    } finally {
      setPreviewing(false);
    }
  }

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

  const hasUnsaved =
    name !== (automation.name ?? "") ||
    description !== (automation.description ?? "") ||
    triggerType !== automation.trigger_type ||
    (triggerType !== "manual" &&
      (daysInactive !== (automation.trigger_config?.days_inactive ?? 180) ||
        lookbackDays !== (automation.trigger_config?.lookback_days ?? 30)));

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">
            {automation.name}
          </div>
          <span
            className={clsx(
              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              automation.enabled
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-500",
            )}
          >
            {automation.enabled ? "Live" : "Paused"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleEnabled}
            disabled={busy}
            className={clsx(
              "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50",
              automation.enabled
                ? "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                : "bg-gray-900 text-white hover:bg-gray-800",
            )}
          >
            {automation.enabled ? "Pause" : "Enable"}
          </button>
          <button
            onClick={deleteAutomation}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-200 transition disabled:opacity-50"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 inline-flex items-start gap-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {banner && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 inline-flex items-center gap-1.5">
            <CheckCircle2 size={13} />
            {banner}
          </div>
        )}

        {/* Basic config */}
        <section className="space-y-3">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </Field>
          <Field label="Description" hint="Internal only.">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Trigger">
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <option value="d2c_at_risk">D2C at-risk (inactive N days)</option>
                <option value="wholesale_at_risk">Wholesale at-risk (inactive N days)</option>
                <option value="manual">Manual enrollment only</option>
              </select>
            </Field>
            {triggerType !== "manual" && (
              <>
                <Field label="Days inactive">
                  <input
                    type="number"
                    min={1}
                    max={730}
                    value={daysInactive}
                    onChange={(e) => setDaysInactive(Number(e.target.value) || 180)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </Field>
                <Field
                  label="Lookback cap (days)"
                  hint="0 = no cap (catch every at-risk customer)"
                >
                  <input
                    type="number"
                    min={0}
                    max={3650}
                    value={lookbackDays}
                    onChange={(e) => setLookbackDays(Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </Field>
              </>
            )}
          </div>

          <div className="flex items-center justify-end">
            <button
              onClick={saveConfig}
              disabled={busy || !hasUnsaved}
              className="inline-flex items-center gap-1 rounded-lg bg-gray-900 text-white px-3 py-2 text-xs font-medium hover:bg-gray-800 transition disabled:opacity-40"
            >
              <Save size={12} />
              {hasUnsaved ? "Save changes" : "Saved"}
            </button>
          </div>
        </section>

        {/* Steps */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-gray-700 uppercase tracking-wider">
              Sequence
            </div>
            <button
              onClick={addStep}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <Plus size={11} />
              Add step
            </button>
          </div>
          {steps.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/40 px-4 py-6 text-center text-xs text-gray-400">
              No steps yet. Add the first email in the sequence.
            </div>
          ) : (
            <ul className="space-y-2">
              {steps.map((s) => {
                const tpl = templateMap.get(s.template_id);
                return (
                  <li
                    key={s.id}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 flex items-center gap-3"
                  >
                    <div className="text-gray-300">
                      <GripVertical size={14} />
                    </div>
                    <div className="text-[10px] font-medium text-gray-500 w-12 shrink-0 tabular-nums">
                      Step {s.step_order}
                    </div>
                    <div className="flex-1 min-w-0 grid grid-cols-[1fr_120px] gap-2 items-center">
                      <select
                        value={s.template_id}
                        onChange={(e) => patchStep(s.id, { template_id: e.target.value })}
                        className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-gray-300"
                      >
                        {allTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                        {!templateMap.has(s.template_id) && (
                          <option value={s.template_id}>(template missing)</option>
                        )}
                      </select>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={365}
                          value={s.delay_days}
                          onChange={(e) =>
                            patchStep(s.id, { delay_days: Number(e.target.value) || 0 })
                          }
                          className="w-16 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-gray-300"
                        />
                        <span className="text-[10px] text-gray-500">
                          {s.step_order === 1 ? "days after trigger" : "days after prev."}
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-400 truncate max-w-[180px]">
                      {tpl?.subject ?? ""}
                    </div>
                    <button
                      onClick={() => deleteStep(s.id)}
                      className="text-gray-400 hover:text-red-500 transition"
                      title="Remove step"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Test / preview */}
        <section className="rounded-lg border border-gray-200 bg-gray-50/40 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-gray-600">
              <span className="font-medium">Preview eligible</span> · runs the cron
              in dry-run mode and reports who would be enrolled / sent right now.
            </div>
            <button
              onClick={runPreview}
              disabled={previewing}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            >
              {previewing ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
              Run preview
            </button>
          </div>
          {preview && (
            <div className="mt-2 text-xs text-gray-700">
              Would enroll{" "}
              <span className="font-medium text-gray-900">{preview.enrolled}</span> new
              customer{preview.enrolled === 1 ? "" : "s"} ·{" "}
              <span className="font-medium text-gray-900">{preview.due_now}</span> step
              send{preview.due_now === 1 ? "" : "s"} due right now.
            </div>
          )}
        </section>

        {/* Activity panels */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Recent sends" empty="No automated sends yet.">
            {recent.map((r) => (
              <li key={r.id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-700 truncate flex-1">
                    {r.automation_enrollments?.customer_name ?? "(no name)"}
                  </span>
                  <span
                    className={clsx(
                      "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      r.status === "sent"
                        ? "bg-green-100 text-green-700"
                        : r.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-500",
                    )}
                  >
                    step {r.step_order} · {r.status}
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {r.automation_enrollments?.customer_email} ·{" "}
                  {new Date(r.sent_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
                {r.error_text && (
                  <div className="text-[10px] text-red-600 mt-0.5">{r.error_text}</div>
                )}
              </li>
            ))}
          </Panel>

          <Panel title="Enrollments" empty="No customers enrolled yet.">
            {enrollments.map((e) => (
              <li key={e.id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <Mail size={11} className="text-gray-400 shrink-0" />
                  <span className="text-xs font-medium text-gray-700 truncate flex-1">
                    {e.customer_name ?? "(no name)"}
                  </span>
                  <span
                    className={clsx(
                      "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      e.status === "enrolled"
                        ? "bg-blue-100 text-blue-700"
                        : e.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : e.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {e.status}
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {e.customer_email}
                  {e.next_step_order != null && e.next_send_at && (
                    <>
                      {" · next: step {e.next_step_order} on "}
                      {new Date(e.next_send_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </>
                  )}
                </div>
              </li>
            ))}
          </Panel>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
        {label}
        {hint && <span className="ml-1 normal-case text-gray-300">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Panel({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasContent = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
        {title}
      </div>
      {hasContent ? (
        <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">{children}</ul>
      ) : (
        <div className="px-3 py-6 text-center text-xs text-gray-400">{empty}</div>
      )}
    </div>
  );
}
