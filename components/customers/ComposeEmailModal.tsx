"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Mail,
  Loader2,
  AlertTriangle,
  FileText,
  ChevronDown,
  Save,
  Trash2,
  LayoutTemplate,
  Eye,
} from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { mergeGroupsFor } from "@/lib/email/mergeFields";
import { trackSendJob } from "@/lib/email/trackSendJob";
import MergeFieldTextarea from "@/components/email/MergeFieldTextarea";

type Props = {
  open: boolean;
  onClose: () => void;
  selectedIds: Set<string>;
  customerType: "wholesale" | "d2c";
  /** Map of id → display name for selected customers. */
  customerNames: Record<string, string>;
  onComplete: () => void;
};

/** Enqueue response for a queued (Resend) bulk job. */
type BulkJob = {
  job_id: string;
  total: number;
  queued: number;
  skipped_no_email: number;
  skipped_unsubscribed: number;
  skipped_duplicate: number;
  /** Set when this is a test run — every copy delivers here. */
  test_email: string | null;
};

type OutlookStatus =
  | { state: "loading" }
  | { state: "disconnected" }
  | { state: "connected"; email: string };

type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
  updated_at: string;
};

/** A designed template from /templates (rendered server-side): either the
    block builder or an uploaded HTML file. */
type BlockTemplate = {
  id: string;
  name: string;
  subject: string | null;
  preview_text: string | null;
  brand: string | null;
  channel: string | null;
  status: string | null;
  updated_at: string;
  source: "blocks" | "html";
  block_count: number;
};

async function authHeader(): Promise<Record<string, string>> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ComposeEmailModal({
  open,
  onClose,
  selectedIds,
  customerType,
  customerNames,
  onComplete,
}: Props) {
  const [subject, setSubject] = useState("");
  const [cc, setCc] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outlook, setOutlook] = useState<OutlookStatus>({ state: "loading" });

  /* Compose mode. "text" is the typed plain-text body; "block" sends a
     designed template from /templates, rendered to HTML server-side. */
  const [mode, setMode] = useState<"text" | "block">("text");
  const [blockTemplates, setBlockTemplates] = useState<BlockTemplate[]>([]);
  const [blockTemplateId, setBlockTemplateId] = useState<string | null>(null);
  const [blockTemplatesLoading, setBlockTemplatesLoading] = useState(false);

  /* Test run: deliver every selected customer's copy to this address instead
     of the customer. Merge fields still use each customer's real data. */
  const [testMode, setTestMode] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  /* Designed-template preview. The preview API authenticates via the
     Authorization header, so it must be fetched — a plain link in a new tab
     carries no session and just 401s. */
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function openPreview(templateId: string) {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/email/block-templates/${templateId}/preview`, {
        headers: await authHeader(),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Preview failed (${res.status})`);
      }
      setPreviewHtml(await res.text());
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }

  /* Template state */
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/email/templates", {
        headers: await authHeader(),
      });
      if (!res.ok) return;
      const json = await res.json();
      setTemplates((json.templates as Template[]) ?? []);
    } catch {
      /* non-critical */
    }
  }, []);

  const ids = useMemo(() => Array.from(selectedIds), [selectedIds]);

  // Check Outlook connection when the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setOutlook({ state: "loading" });
      try {
        const res = await fetch("/api/email/outlook/status", { headers: await authHeader() });
        const json = await res.json();
        if (cancelled) return;
        if (res.ok && json?.connected) {
          setOutlook({ state: "connected", email: json.email });
          // A sensible default for the test-run address.
          setTestEmail((cur) => cur || (json.email as string));
        } else {
          setOutlook({ state: "disconnected" });
        }
      } catch {
        if (!cancelled) setOutlook({ state: "disconnected" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Load templates when the modal opens.
  useEffect(() => {
    if (!open) return;
    loadTemplates();
  }, [open, loadTemplates]);

  // Designed block templates — loaded lazily the first time the user switches
  // to that mode, since most sends are plain text.
  useEffect(() => {
    if (!open || mode !== "block" || blockTemplates.length > 0) return;
    let cancelled = false;
    (async () => {
      setBlockTemplatesLoading(true);
      try {
        const res = await fetch("/api/email/block-templates", {
          headers: await authHeader(),
        });
        const json = await res.json();
        if (!cancelled && res.ok) {
          setBlockTemplates((json.templates as BlockTemplate[]) ?? []);
        }
      } catch {
        /* non-critical — the empty state explains what to do */
      } finally {
        if (!cancelled) setBlockTemplatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, blockTemplates.length]);

  const selectedBlockTemplate = blockTemplates.find((t) => t.id === blockTemplateId) ?? null;

  // Reset state when the modal closes.
  useEffect(() => {
    if (!open) {
      setSubject("");
      setCc("");
      setBody("");
      setError(null);
      setSending(false);
      setTemplatesOpen(false);
      setSaveOpen(false);
      setSaveName("");
      setPreviewHtml(null);
      setPreviewError(null);
      setPreviewLoading(false);
      setTestMode(false);
      setTestEmail("");
    }
  }, [open]);

  if (!open) return null;

  const previewName = ids[0] ? customerNames[ids[0]] ?? ids[0] : "";

  async function applyTemplate(t: Template) {
    setSubject(t.subject);
    setBody(t.body);
    setTemplatesOpen(false);
    // Fire-and-forget: bump last_used_at so MRU sorting works.
    fetch(`/api/email/templates/${t.id}`, {
      method: "POST",
      headers: await authHeader(),
    }).catch(() => {});
  }

  async function deleteTemplate(t: Template) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    const res = await fetch(`/api/email/templates/${t.id}`, {
      method: "DELETE",
      headers: await authHeader(),
    });
    if (res.ok || res.status === 204) {
      setTemplates((cur) => cur.filter((x) => x.id !== t.id));
    }
  }

  async function saveAsTemplate() {
    const name = saveName.trim();
    if (!name) return;
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/email/templates", {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject, body }),
      });
      if (res.ok) {
        await loadTemplates();
        setSaveOpen(false);
        setSaveName("");
      } else {
        const json = await res.json().catch(() => ({}));
        setError(`Couldn't save template: ${json?.error ?? res.status}`);
      }
    } finally {
      setSavingTemplate(false);
    }
  }

  /** The send is now a server-side job: follow it from a toast and get out of the way. */
  function handOff(jobId: string, subjectLine: string, total: number, test: string | null) {
    trackSendJob({ jobId, subject: subjectLine, total, testEmail: test });
    onComplete();
    onClose();
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const recipients = ids.map((id) => ({ customer_type: customerType, customer_ref: id }));

      if (mode === "block") {
        // Designed templates queue a background job sent via Resend from the
        // brand's verified domain — no size cap, survives closing the modal.
        const res = await fetch("/api/email/bulk-send", {
          method: "POST",
          headers: { ...(await authHeader()), "Content-Type": "application/json" },
          body: JSON.stringify({
            recipients,
            subject_template: subject,
            block_template_id: blockTemplateId,
            cc: cc.trim() || undefined,
            test_email: testMode ? testEmail.trim() : undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error ?? `Request failed (${res.status})`);
        } else {
          const job = json as BulkJob;
          handOff(
            job.job_id,
            subject.trim() || selectedBlockTemplate?.subject || selectedBlockTemplate?.name || "",
            job.total,
            job.test_email,
          );
        }
        return;
      }

      // Typed mail goes out through the sender's Outlook, server-side after
      // the request returns.
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: {
          ...(await authHeader()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipients,
          subject_template: subject,
          body_template: body,
          body_format: "text",
          cc: cc.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Request failed (${res.status})`);
      } else {
        handOff(json.job_id, subject, json.total, null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  function close() {
    onClose();
  }

  const TEST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const canSend =
    !sending &&
    (mode === "block"
      ? // Queued Resend sends don't need Outlook; the template's own subject
        // is the fallback when none is typed.
        !!blockTemplateId && (!testMode || TEST_EMAIL_RE.test(testEmail.trim()))
      : outlook.state === "connected" && subject.trim().length > 0 && body.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <div className="text-sm font-semibold text-gray-900">Send Email</div>
            <div className="text-xs text-gray-500">
              {ids.length} recipient{ids.length === 1 ? "" : "s"}
              {mode === "block" ? (
                <> · sent from your <span className="font-medium text-gray-700">brand domain</span> via Resend</>
              ) : (
                outlook.state === "connected" && (
                  <> · from <span className="font-medium text-gray-700">{outlook.email}</span></>
                )
              )}
            </div>
          </div>
          <button onClick={close} className="text-gray-400 hover:text-gray-600 transition">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {outlook.state === "loading" && mode === "text" && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Checking Outlook connection…
            </div>
          )}

          {outlook.state === "disconnected" && mode === "text" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 inline-flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Your Outlook isn&apos;t connected.{" "}
                <a href="/settings?section=email-connection" className="underline font-medium">
                  Connect it
                </a>{" "}
                to send emails from the portal.
              </span>
            </div>
          )}

            <>
              {/* Compose mode */}
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
                <button
                  onClick={() => setMode("text")}
                  className={clsx(
                    "rounded-md px-3 py-1.5 font-medium transition",
                    mode === "text" ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900",
                  )}
                >
                  Write a message
                </button>
                <button
                  onClick={() => setMode("block")}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition",
                    mode === "block" ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900",
                  )}
                >
                  <LayoutTemplate size={12} />
                  Designed template
                </button>
              </div>

              {/* Templates (plain-text mode only) */}
              <div className={clsx("flex items-center gap-2 relative", mode !== "text" && "hidden")}>
                <button
                  onClick={() => setTemplatesOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  <FileText size={12} />
                  Templates
                  {templates.length > 0 && (
                    <span className="text-gray-400">({templates.length})</span>
                  )}
                  <ChevronDown size={12} />
                </button>
                <span className="text-[10px] text-gray-400">
                  Load a saved subject + body, or save the current draft below.
                </span>

                {templatesOpen && (
                  <div className="absolute top-full mt-1 left-0 z-20 w-80 rounded-xl border border-gray-200 bg-white shadow-lg max-h-72 overflow-y-auto">
                    {templates.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-gray-400 text-center">
                        No templates yet. Type a subject + body and use{" "}
                        <span className="font-medium text-gray-600">Save as template</span>{" "}
                        below.
                      </div>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {templates.map((t) => (
                          <li key={t.id} className="group flex items-start hover:bg-gray-50">
                            <button
                              onClick={() => applyTemplate(t)}
                              className="flex-1 text-left px-3 py-2 min-w-0"
                            >
                              <div className="text-xs font-medium text-gray-800 truncate">
                                {t.name}
                              </div>
                              <div className="text-[11px] text-gray-500 truncate">
                                {t.subject || "(no subject)"}
                              </div>
                            </button>
                            <button
                              onClick={() => deleteTemplate(t)}
                              className="opacity-0 group-hover:opacity-100 px-2 py-2 text-gray-400 hover:text-red-500 transition"
                              title="Delete template"
                            >
                              <Trash2 size={12} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Cc */}
              <div>
                <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Cc <span className="lowercase tracking-normal text-gray-400">(optional)</span>
                </label>
                <input
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="manager@example.com, teammate@example.com"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <div className="text-[10px] text-gray-400 mt-1">
                  Separate multiple addresses with commas. CC&apos;d on every
                  recipient&apos;s copy.
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Subject
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="A quick question, {{firstName}}"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>

              {/* Designed template picker */}
              {mode === "block" && (
                <div>
                  <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                    Template
                  </label>

                  {blockTemplatesLoading ? (
                    <div className="rounded-lg border border-gray-200 py-6 text-center text-xs text-gray-400">
                      Loading templates…
                    </div>
                  ) : blockTemplates.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center">
                      <div className="text-xs font-medium text-gray-600">
                        No designed templates yet
                      </div>
                      <p className="mt-1 text-[11px] text-gray-400">
                        Build one in Email → Templates, or generate one with AI.
                      </p>
                    </div>
                  ) : (
                    <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                      {blockTemplates.map((t) => {
                        const active = blockTemplateId === t.id;
                        return (
                          <li key={t.id}>
                            <button
                              onClick={() => {
                                setBlockTemplateId(t.id);
                                // Adopt the template's subject unless the user
                                // already typed one of their own.
                                if (!subject.trim() && t.subject) setSubject(t.subject);
                              }}
                              className={clsx(
                                "flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50",
                                active && "bg-gray-50",
                              )}
                            >
                              <span
                                className={clsx(
                                  "h-3.5 w-3.5 shrink-0 rounded-full border",
                                  active ? "border-[5px] border-gray-900" : "border-gray-300",
                                )}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium text-gray-800">
                                  {t.name}
                                </span>
                                <span className="block truncate text-[11px] text-gray-500">
                                  {t.subject || "(no subject)"}
                                </span>
                              </span>
                              <span className="shrink-0 text-[10px] tabular-nums text-gray-400">
                                {t.source === "html"
                                  ? "HTML"
                                  : `${t.block_count} block${t.block_count === 1 ? "" : "s"}`}
                                {t.status && t.status !== "active" ? ` · ${t.status}` : ""}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {selectedBlockTemplate && (
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-[10px] leading-relaxed text-gray-400">
                        Rendered to email HTML when you send. Merge fields in the
                        template are filled per recipient.
                      </p>
                      <button
                        onClick={() => openPreview(selectedBlockTemplate.id)}
                        disabled={previewLoading}
                        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                      >
                        {previewLoading ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Eye size={12} />
                        )}
                        Preview
                      </button>
                    </div>
                  )}

                  {previewError && (
                    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {previewError}
                    </div>
                  )}

                  {/* Test run */}
                  <div
                    className={clsx(
                      "mt-3 rounded-lg border px-3 py-2.5",
                      testMode ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50",
                    )}
                  >
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={testMode}
                        onChange={(e) => setTestMode(e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 accent-gray-900"
                      />
                      <span className="min-w-0">
                        <span className={clsx("block text-xs font-medium", testMode ? "text-amber-800" : "text-gray-700")}>
                          Test run — send every copy to me instead
                        </span>
                        <span className={clsx("block text-[11px] leading-relaxed", testMode ? "text-amber-700" : "text-gray-400")}>
                          Each selected customer&apos;s email is rendered with their real
                          data, but all copies deliver to your address. Customers get
                          nothing.
                        </span>
                      </span>
                    </label>
                    {testMode && (
                      <input
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Body */}
              <div className={clsx(mode !== "text" && "hidden")}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                    Message
                  </label>
                  <span className="text-[10px] text-gray-400">
                    Plain text · type “/” for merge fields
                  </span>
                </div>
                <MergeFieldTextarea
                  value={body}
                  onValueChange={setBody}
                  channel={customerType}
                  rows={10}
                  placeholder={
                    "Hi {{firstName}},\n\nWanted to check in on how things are going with {{customerName}}.\n\nBest,\nYour Name"
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y font-mono"
                />
                <div className="flex items-start justify-between mt-1 gap-3">
                  <div className="text-[10px] text-gray-400 leading-relaxed">
                    {mergeGroupsFor(customerType).map(({ group, fields }, i) => (
                      <span key={group}>
                        {i > 0 && <br />}
                        <span className="font-medium">{group}:</span>{" "}
                        {fields.map((f) => (
                          <span key={f.key}>
                            <code className="px-1 py-0.5 bg-gray-100 rounded">{`{{${f.key}}}`}</code>{" "}
                          </span>
                        ))}
                      </span>
                    ))}
                  </div>
                  {!saveOpen ? (
                    <button
                      onClick={() => setSaveOpen(true)}
                      disabled={!subject.trim() && !body.trim()}
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-900 transition disabled:opacity-40"
                    >
                      <Save size={11} />
                      Save as template
                    </button>
                  ) : null}
                </div>

                {saveOpen && (
                  <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2 flex items-center gap-2">
                    <input
                      autoFocus
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveAsTemplate();
                        if (e.key === "Escape") {
                          setSaveOpen(false);
                          setSaveName("");
                        }
                      }}
                      placeholder="Template name (e.g. Quarterly check-in)"
                      className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                    <button
                      onClick={saveAsTemplate}
                      disabled={!saveName.trim() || savingTemplate}
                      className="inline-flex items-center gap-1 rounded-md bg-gray-900 text-white px-2 py-1 text-[11px] font-medium hover:bg-gray-800 transition disabled:opacity-40"
                    >
                      {savingTemplate ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setSaveOpen(false);
                        setSaveName("");
                      }}
                      className="text-[11px] text-gray-500 hover:text-gray-700 px-1"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* First-recipient preview */}
              {previewName && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                    Preview · {previewName}
                  </div>
                  <div className="text-xs text-gray-700 whitespace-pre-wrap">
                    <strong>Subject:</strong> {previewFill(subject, previewName) || "(empty)"}
                    {"\n"}
                    {previewFill(body, previewName) || "(empty)"}
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
            </>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          <span className="text-[11px] text-gray-400">
            Each customer gets their own email. Sending runs in the background — you can keep working.
          </span>
          <div className="flex gap-2">
            <button
              onClick={close}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
              <button
                onClick={send}
                disabled={!canSend}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40"
              >
                {sending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Sending…
                  </>
                ) : mode === "block" && testMode ? (
                  <>
                    <Mail size={14} />
                    Send {ids.length} test cop{ids.length === 1 ? "y" : "ies"} to me
                  </>
                ) : (
                  <>
                    <Mail size={14} />
                    Send {ids.length} email{ids.length === 1 ? "" : "s"}
                  </>
                )}
              </button>
          </div>
        </div>
      </div>

      {/* Designed-template preview overlay */}
      {previewHtml !== null && (
        <div className="absolute inset-0 z-10 flex flex-col bg-gray-900/60 backdrop-blur-sm">
          <div className="flex shrink-0 items-center justify-between bg-white px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2 min-w-0">
              <Eye size={14} className="text-gray-400 shrink-0" />
              <span className="text-sm font-semibold text-gray-800 truncate">
                {selectedBlockTemplate?.name ?? "Template preview"}
              </span>
              <span className="hidden sm:inline text-[11px] text-gray-400">
                Sample merge values — each recipient gets their own.
              </span>
            </div>
            <button
              onClick={() => setPreviewHtml(null)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
              aria-label="Close preview"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 min-h-0 bg-gray-100 p-4">
            <iframe
              title="Template preview"
              srcDoc={previewHtml}
              sandbox=""
              className="h-full w-full rounded-lg border border-gray-200 bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Simple preview-only merge: just replaces firstName + customerName from the recipient name. */
function previewFill(tpl: string, name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return tpl
    .replace(/\{\{\s*firstName\s*\}\}/g, first)
    .replace(/\{\{\s*customerName\s*\}\}/g, name);
}
