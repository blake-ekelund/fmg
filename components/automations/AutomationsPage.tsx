"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Play,
  AlertTriangle,
  CheckCircle2,
  Mail,
  Save,
  Eye,
  Send,
} from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Settings = {
  name: string;
  enabled: boolean;
  sender_user_id: string | null;
  config: {
    trigger_days?: number;
    lookback_days?: number;
    discount_code?: string;
    subject?: string;
    body?: string;
  };
  updated_at: string;
};

type SendRow = {
  id: string;
  person_key: string;
  customer_name: string | null;
  customer_email: string | null;
  status: "sent" | "failed" | "skipped";
  error_text: string | null;
  sent_at: string;
  discount_code: string | null;
};

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AutomationsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [recent, setRecent] = useState<SendRow[]>([]);
  const [totalSent, setTotalSent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  /* Local form state for the editable bits. */
  const [triggerDays, setTriggerDays] = useState(180);
  const [lookbackDays, setLookbackDays] = useState(30);
  const [discountCode, setDiscountCode] = useState("WELCOMEBACK15");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const reload = useCallback(async () => {
    const res = await fetch("/api/automations/d2c-reengagement", {
      headers: await authHeader(),
    });
    if (!res.ok) {
      setError(`Could not load settings (${res.status})`);
      setLoading(false);
      return;
    }
    const json = await res.json();
    setSettings(json.settings as Settings);
    setRecent((json.recent as SendRow[]) ?? []);
    setTotalSent(json.totalSent ?? 0);
    setLoading(false);
    if (json.settings?.config) {
      setTriggerDays(json.settings.config.trigger_days ?? 180);
      setLookbackDays(json.settings.config.lookback_days ?? 30);
      setDiscountCode(json.settings.config.discount_code ?? "WELCOMEBACK15");
      setSubject(json.settings.config.subject ?? "");
      setBody(json.settings.config.body ?? "");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await reload();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function toggleEnabled() {
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/automations/d2c-reengagement", {
        method: "PATCH",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !settings.enabled }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
      } else {
        setSettings(json.settings);
        setBanner(json.settings.enabled ? "Automation enabled." : "Automation paused.");
        setTimeout(() => setBanner(null), 3000);
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/automations/d2c-reengagement", {
        method: "PATCH",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            trigger_days: triggerDays,
            lookback_days: lookbackDays,
            discount_code: discountCode,
            subject,
            body,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
      } else {
        setSettings(json.settings);
        setBanner("Settings saved.");
        setTimeout(() => setBanner(null), 3000);
      }
    } finally {
      setBusy(false);
    }
  }

  /* Preview the eligible list without sending. Hits the cron route in dry mode. */
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<
    | null
    | {
        window: { from: string; to: string };
        eligible: number;
        sample: Array<{ person_key: string; name: string | null; email: string | null; last_order_date: string | null }>;
      }
  >(null);

  async function runPreview() {
    setPreviewing(true);
    setError(null);
    try {
      const res = await fetch("/api/cron/d2c-reengagement?dry=1");
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
      } else {
        setPreview(json);
      }
    } finally {
      setPreviewing(false);
    }
  }

  /* Test-send to a single email. */
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  async function runTestSend() {
    if (!testEmail.trim()) return;
    setTesting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cron/d2c-reengagement?test=${encodeURIComponent(testEmail.trim())}`,
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Test failed (${res.status})`);
      } else if (json.sent > 0) {
        setBanner(`Test sent to ${testEmail.trim()}.`);
        setTimeout(() => setBanner(null), 3000);
      } else {
        setError(`Test attempt didn't send. ${json.failed ? "Failed " + json.failed : ""}`);
      }
    } finally {
      setTesting(false);
    }
  }

  const enabled = settings?.enabled ?? false;
  const hasUnsavedConfig = useMemo(() => {
    if (!settings) return false;
    const c = settings.config ?? {};
    return (
      triggerDays !== (c.trigger_days ?? 180) ||
      lookbackDays !== (c.lookback_days ?? 30) ||
      discountCode !== (c.discount_code ?? "WELCOMEBACK15") ||
      subject !== (c.subject ?? "") ||
      body !== (c.body ?? "")
    );
  }, [settings, triggerDays, lookbackDays, discountCode, subject, body]);

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1100px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Automated emails that fire on a schedule based on customer behavior.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 inline-flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {banner && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 inline-flex items-center gap-2">
          <CheckCircle2 size={14} />
          {banner}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400 inline-flex items-center gap-2 justify-center w-full">
          <Loader2 size={14} className="animate-spin" />
          Loading…
        </div>
      ) : (
        <>
          {/* Automation card */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100">
              <div className="flex items-start gap-3 min-w-0">
                <div className="shrink-0 mt-0.5 h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Mail size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-gray-900">
                      D2C re-engagement
                    </div>
                    <span
                      className={clsx(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                        enabled
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500",
                      )}
                    >
                      {enabled ? "Live" : "Paused"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 max-w-md">
                    Sends a 15%-off reorder nudge to D2C customers who just
                    crossed the {triggerDays}-day inactivity mark. Each customer
                    only gets this once. Total sent so far:{" "}
                    <span className="font-medium text-gray-700">{totalSent}</span>
                    .
                  </p>
                </div>
              </div>
              <button
                onClick={toggleEnabled}
                disabled={busy}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition disabled:opacity-50",
                  enabled
                    ? "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    : "bg-gray-900 text-white hover:bg-gray-800",
                )}
              >
                {enabled ? "Pause" : "Enable"}
              </button>
            </div>

            {/* Config */}
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Trigger after (days)">
                  <input
                    type="number"
                    min={30}
                    max={365}
                    value={triggerDays}
                    onChange={(e) => setTriggerDays(Number(e.target.value) || 180)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </Field>
                <Field label="Lookback (days)" hint="catches misses if cron skipped a day">
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={lookbackDays}
                    onChange={(e) => setLookbackDays(Number(e.target.value) || 30)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </Field>
                <Field label="Discount code" hint="must exist in Shopify">
                  <input
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </Field>
              </div>

              <Field label="Subject">
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="We miss you, {{firstName}} — 15% off your next order"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </Field>

              <Field label="Body" hint="Plain text. Same merge fields as the compose modal.">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y"
                />
              </Field>

              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={saveConfig}
                  disabled={busy || !hasUnsavedConfig}
                  className="inline-flex items-center gap-1 rounded-lg bg-gray-900 text-white px-3 py-2 text-xs font-medium hover:bg-gray-800 transition disabled:opacity-40"
                >
                  <Save size={12} />
                  {hasUnsavedConfig ? "Save changes" : "Saved"}
                </button>
              </div>
            </div>

            {/* Test + preview tools */}
            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/40 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs text-gray-600">
                  <span className="font-medium">Test &amp; preview</span> · these
                  run against the cron route without flipping the automation on.
                </div>
                <button
                  onClick={runPreview}
                  disabled={previewing}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  {previewing ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
                  Preview eligible
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="Test send to (your email)"
                  className="flex-1 max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <button
                  onClick={runTestSend}
                  disabled={!testEmail.trim() || testing}
                  className="inline-flex items-center gap-1 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-gray-800 transition disabled:opacity-40"
                >
                  {testing ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                  Send test
                </button>
              </div>

              {preview && (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
                  <div className="text-gray-600">
                    Window {preview.window.from} → {preview.window.to} ·{" "}
                    <span className="font-medium text-gray-900">
                      {preview.eligible} eligible
                    </span>{" "}
                    (after deduping against past sends)
                  </div>
                  {preview.sample.length > 0 && (
                    <ul className="mt-2 divide-y divide-gray-100 max-h-48 overflow-y-auto">
                      {preview.sample.map((s) => (
                        <li key={s.person_key} className="py-1.5 flex items-center gap-2">
                          <span className="font-medium text-gray-700 truncate">
                            {s.name ?? "(no name)"}
                          </span>
                          <span className="text-gray-400">{s.email}</span>
                          <span className="text-[10px] text-gray-400 ml-auto">
                            last order: {s.last_order_date ?? "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Recent sends */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">
                Recent automated sends
              </div>
              <div className="text-[11px] text-gray-400">
                Showing latest 50 · total {totalSent}
              </div>
            </div>
            {recent.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-gray-400">
                Nothing sent yet. Enable above and the cron will start picking up
                eligible customers.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recent.map((r) => (
                  <li key={r.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {r.customer_name ?? "(no name)"}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {r.customer_email}
                        {r.discount_code && (
                          <>
                            {" · "}
                            <span className="font-mono">{r.discount_code}</span>
                          </>
                        )}
                      </div>
                      {r.error_text && (
                        <div className="text-[10px] text-red-600 truncate">
                          {r.error_text}
                        </div>
                      )}
                    </div>
                    <span
                      className={clsx(
                        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        r.status === "sent"
                          ? "bg-green-100 text-green-700"
                          : r.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-500",
                      )}
                    >
                      {r.status}
                    </span>
                    <div className="text-[10px] text-gray-400 tabular-nums shrink-0">
                      {new Date(r.sent_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] text-gray-400">
            The shared discount code must exist in Shopify before enabling.
            See <Link href="/email-templates" className="underline">Email Templates</Link>{" "}
            for one-off sends, or the customer detail page → Emails tab to view
            individual conversations.
          </p>
        </>
      )}
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
