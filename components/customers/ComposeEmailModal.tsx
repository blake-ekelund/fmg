"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Mail,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ChevronDown,
  Save,
  Trash2,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Props = {
  open: boolean;
  onClose: () => void;
  selectedIds: Set<string>;
  customerType: "wholesale" | "d2c";
  /** Map of id → display name for selected customers. */
  customerNames: Record<string, string>;
  onComplete: () => void;
};

type SendResult = {
  total: number;
  sent: number;
  failed: number;
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
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outlook, setOutlook] = useState<OutlookStatus>({ state: "loading" });

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

  // Reset state when the modal closes.
  useEffect(() => {
    if (!open) {
      setSubject("");
      setBody("");
      setResult(null);
      setError(null);
      setSending(false);
      setTemplatesOpen(false);
      setSaveOpen(false);
      setSaveName("");
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

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: {
          ...(await authHeader()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipients: ids.map((id) => ({ customer_type: customerType, customer_ref: id })),
          subject_template: subject,
          body_template: body,
          body_format: "text",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Request failed (${res.status})`);
      } else {
        setResult({ total: json.total, sent: json.sent, failed: json.failed });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  function close() {
    if (result && result.sent > 0) onComplete();
    onClose();
  }

  const canSend =
    outlook.state === "connected" &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !sending &&
    !result;

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
              {outlook.state === "connected" && (
                <> · from <span className="font-medium text-gray-700">{outlook.email}</span></>
              )}
            </div>
          </div>
          <button onClick={close} className="text-gray-400 hover:text-gray-600 transition">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {outlook.state === "loading" && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Checking Outlook connection…
            </div>
          )}

          {outlook.state === "disconnected" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 inline-flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Your Outlook isn&apos;t connected.{" "}
                <a href="/company?tab=integrations" className="underline font-medium">
                  Connect it
                </a>{" "}
                to send emails from the portal.
              </span>
            </div>
          )}

          {result ? (
            <div
              className={
                "rounded-xl border px-4 py-3 text-sm " +
                (result.failed === 0
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-amber-200 bg-amber-50 text-amber-700")
              }
            >
              <div className="flex items-center gap-2 font-medium">
                {result.failed === 0 ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <AlertTriangle size={16} />
                )}
                Sent {result.sent} of {result.total}
              </div>
              {result.failed > 0 && (
                <div className="text-xs mt-1">
                  {result.failed} failed (no email on file, send error, or skipped).
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Templates */}
              <div className="flex items-center gap-2 relative">
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

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                    Message
                  </label>
                  <span className="text-[10px] text-gray-400">
                    Plain text. Line breaks preserved.
                  </span>
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  placeholder={
                    "Hi {{firstName}},\n\nWanted to check in on how things are going with {{customerName}}.\n\nBest,\nYour Name"
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y font-mono"
                />
                <div className="flex items-start justify-between mt-1 gap-3">
                  <div className="text-[10px] text-gray-400 leading-relaxed">
                    <span className="font-medium">Customer:</span>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{firstName}}"}</code>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{customerName}}"}</code>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{city}}"}</code>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{state}}"}</code>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{channel}}"}</code>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{lifetimeRevenue}}"}</code>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{lifetimeOrders}}"}</code>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{lastOrderDate}}"}</code>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{daysSinceLastOrder}}"}</code>
                    <br />
                    <span className="font-medium">Sender:</span>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{senderName}}"}</code>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{senderFirstName}}"}</code>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{senderEmail}}"}</code>
                    {" · "}
                    <span className="font-medium">Date:</span>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{currentYear}}"}</code>{" "}
                    <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{currentQuarter}}"}</code>
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
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          <span className="text-[11px] text-gray-400">
            Each customer gets their own email — recipients won&apos;t see each other.
          </span>
          <div className="flex gap-2">
            <button
              onClick={close}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition"
            >
              {result ? "Close" : "Cancel"}
            </button>
            {!result && (
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
                ) : (
                  <>
                    <Mail size={14} />
                    Send {ids.length} email{ids.length === 1 ? "" : "s"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
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
