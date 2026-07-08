"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  Mail,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { SalesRep } from "./reps";

type Props = {
  open: boolean;
  onClose: () => void;
  reps: SalesRep[];
};

type SendResult = {
  total: number;
  sent: number;
  failed: number;
  failures?: string[];
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

/** Preview-only merge for the first recipient. */
function previewFill(tpl: string, rep: SalesRep): string {
  const first = rep.name.trim().split(/\s+/)[0] ?? "";
  return tpl
    .replace(/\{\{\s*firstName\s*\}\}/g, first)
    .replace(/\{\{\s*repName\s*\}\}/g, rep.name)
    .replace(/\{\{\s*agency\s*\}\}/g, rep.agency)
    .replace(/\{\{\s*territory\s*\}\}/g, rep.territory)
    .replace(/\{\{\s*city\s*\}\}/g, rep.city)
    .replace(/\{\{\s*state\s*\}\}/g, rep.state);
}

export default function RepEmailModal({ open, onClose, reps }: Props) {
  const [subject, setSubject] = useState("");
  const [cc, setCc] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outlook, setOutlook] = useState<OutlookStatus>({ state: "loading" });

  // Only reps with a real email can actually be sent to.
  const sendable = useMemo(() => reps.filter((r) => r.email), [reps]);
  const noEmailCount = reps.length - sendable.length;

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
        if (res.ok && json?.connected) setOutlook({ state: "connected", email: json.email });
        else setOutlook({ state: "disconnected" });
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
      setCc("");
      setBody("");
      setResult(null);
      setError(null);
      setSending(false);
    }
  }, [open]);

  if (!open) return null;

  const preview = sendable[0] ?? null;

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/email/send-reps", {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: sendable.map((r) => ({
            name: r.name,
            email: r.email,
            agency: r.agency,
            territory: r.territory,
            city: r.city,
            state: r.state,
          })),
          subject_template: subject,
          body_template: body,
          cc: cc.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) setError(json?.error ?? `Request failed (${res.status})`);
      else setResult({ total: json.total, sent: json.sent, failed: json.failed, failures: json.failures });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const canSend =
    outlook.state === "connected" &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    sendable.length > 0 &&
    !sending &&
    !result;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <div className="text-sm font-semibold text-gray-900">Email Sales Reps</div>
            <div className="text-xs text-gray-500">
              {sendable.length} recipient{sendable.length === 1 ? "" : "s"}
              {noEmailCount > 0 && (
                <span className="text-amber-600"> · {noEmailCount} skipped (no email)</span>
              )}
              {outlook.state === "connected" && (
                <> · from <span className="font-medium text-gray-700">{outlook.email}</span></>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
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
                <a href="/settings?section=email-connection" className="underline font-medium">
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
                {result.failed === 0 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                Sent {result.sent} of {result.total}
              </div>
              {result.failed > 0 && result.failures && result.failures.length > 0 && (
                <ul className="text-xs mt-2 space-y-0.5 list-disc list-inside">
                  {result.failures.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
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
                  Separate multiple addresses with commas. CC&apos;d on every rep&apos;s copy.
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
                  placeholder="A quick update for the team, {{firstName}}"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                    Message
                  </label>
                  <span className="text-[10px] text-gray-400">Plain text. Line breaks preserved.</span>
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  placeholder={
                    "Hi {{firstName}},\n\nQuick update for the {{agency}} team covering {{territory}}.\n\nBest,\n{{senderName}}"
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y font-mono"
                />
                <div className="text-[10px] text-gray-400 leading-relaxed mt-1">
                  <span className="font-medium">Rep:</span>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{firstName}}"}</code>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{repName}}"}</code>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{agency}}"}</code>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{territory}}"}</code>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{city}}"}</code>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{state}}"}</code>
                  <br />
                  <span className="font-medium">Sender:</span>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{senderName}}"}</code>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{senderFirstName}}"}</code>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{senderEmail}}"}</code>
                </div>
              </div>

              {/* First-recipient preview */}
              {preview && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                    Preview · {preview.name}
                  </div>
                  <div className="text-xs text-gray-700 whitespace-pre-wrap">
                    <strong>Subject:</strong> {previewFill(subject, preview) || "(empty)"}
                    {"\n"}
                    {previewFill(body, preview) || "(empty)"}
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
            Each rep gets their own email — recipients won&apos;t see each other.
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
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
                    Send {sendable.length} email{sendable.length === 1 ? "" : "s"}
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
