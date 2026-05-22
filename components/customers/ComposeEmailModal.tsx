"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Mail, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
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

  // Reset state when the modal closes.
  useEffect(() => {
    if (!open) {
      setSubject("");
      setBody("");
      setResult(null);
      setError(null);
      setSending(false);
    }
  }, [open]);

  if (!open) return null;

  const previewName = ids[0] ? customerNames[ids[0]] ?? ids[0] : "";

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
                <div className="text-[10px] text-gray-400 mt-1">
                  Merge fields:{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{firstName}}"}</code>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{customerName}}"}</code>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{state}}"}</code>
                </div>
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
