"use client";

import { useEffect, useState } from "react";
import { X, Send, Loader2, CheckCircle2, Search, User } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { EmailTemplate } from "./types";

/**
 * Send a real test email of the current template to any address, through the
 * signed-in user's connected mailbox. Optionally pick a real customer so the
 * merge fields resolve to that account's actual data — the email still goes to
 * the tester's own address, so you see exactly how it looks with real values.
 *
 * Saves first (so the server renders what's on screen), then POSTs to
 * /api/email/block-templates/[id]/test (renders by source; not a campaign).
 */
type Props = {
  open: boolean;
  onClose: () => void;
  templateId: string | null;
  onRequestSave: () => Promise<EmailTemplate | null>;
};

type CustomerHit = {
  customer_type: "wholesale" | "d2c";
  customer_ref: string;
  name: string;
  email: string | null;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SendTestModal({ open, onClose, templateId, onRequestSave }: Props) {
  const [to, setTo] = useState("");
  const [state, setState] = useState<
    { s: "idle" } | { s: "sending" } | { s: "ok"; to: string; used: string | null } | { s: "err"; msg: string }
  >({ s: "idle" });

  // Customer picker (optional).
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerHit[]>([]);
  const [customer, setCustomer] = useState<CustomerHit | null>(null);

  // Reset + prefill the tester's own email when opened.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setState({ s: "idle" });
      setQuery("");
      setResults([]);
      setCustomer(null);
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const email = data.user?.email;
      if (email) setTo((cur) => cur || email);
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Debounced customer search.
  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      if (q.length < 2) {
        if (!cancelled) setResults([]);
        return;
      }
      try {
        const res = await fetch(`/api/email/customer-search?q=${encodeURIComponent(q)}`, {
          headers: await authHeader(),
        });
        const json = await res.json();
        if (!cancelled) setResults((json.customers as CustomerHit[]) ?? []);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  if (!open) return null;

  async function send() {
    const address = to.trim();
    if (!EMAIL_RE.test(address)) {
      setState({ s: "err", msg: "Enter a valid email address." });
      return;
    }
    setState({ s: "sending" });
    const saved = await onRequestSave();
    const id = saved?.id ?? templateId;
    if (!id) {
      setState({ s: "err", msg: "Save the template first, then send a test." });
      return;
    }
    try {
      const res = await fetch(`/api/email/block-templates/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          to: address,
          ...(customer ? { customer_type: customer.customer_type, customer_ref: customer.customer_ref } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ s: "err", msg: json.error ?? `Send failed (${res.status}).` });
        return;
      }
      setState({ s: "ok", to: json.sentTo ?? address, used: json.usedCustomer ?? customer?.name ?? null });
    } catch (e) {
      setState({ s: "err", msg: e instanceof Error ? e.message : "Send failed." });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900 text-white">
              <Send size={14} />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Send a test email</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {state.s === "ok" ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
              <div className="text-sm text-emerald-800">
                Test sent to <span className="font-medium">{state.to}</span>
                {state.used ? (
                  <> using <span className="font-medium">{state.used}</span>&rsquo;s merge data</>
                ) : null}
                . Check your inbox.
              </div>
            </div>
          ) : (
            <>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5">
                Send to
              </label>
              <input
                type="email"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  if (state.s !== "idle") setState({ s: "idle" });
                }}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />

              {/* Customer merge data (optional) */}
              <label className="mt-3 block text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5">
                Merge data from <span className="normal-case tracking-normal text-gray-400">(optional)</span>
              </label>
              {customer ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <User size={14} className="shrink-0 text-gray-400" />
                    <span className="truncate text-sm text-gray-800">{customer.name}</span>
                    <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-600">
                      {customer.customer_type === "d2c" ? "D2C" : "Wholesale"}
                    </span>
                  </div>
                  <button onClick={() => setCustomer(null)} className="text-[11px] text-gray-400 hover:text-rose-500">
                    clear
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search a customer by name…"
                    className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                  {results.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                      {results.map((c) => (
                        <button
                          key={`${c.customer_type}:${c.customer_ref}`}
                          onClick={() => { setCustomer(c); setQuery(""); setResults([]); }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-gray-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-gray-800">{c.name}</span>
                            {c.email && <span className="block truncate text-[10px] text-gray-400">{c.email}</span>}
                          </span>
                          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-500">
                            {c.customer_type === "d2c" ? "D2C" : "WS"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
                Goes to your address above through your connected mailbox. Pick a customer to see how the
                merge fields resolve with their real data — otherwise sample values (Alex, Acme Goods Co.) are used.
              </p>
              {state.s === "err" && <p className="mt-2 text-[11px] text-rose-600">{state.msg}</p>}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/60">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition">
            {state.s === "ok" ? "Close" : "Cancel"}
          </button>
          {state.s !== "ok" && (
            <button
              onClick={send}
              disabled={state.s === "sending" || !to.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-800 transition disabled:opacity-50"
            >
              {state.s === "sending" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {state.s === "sending" ? "Sending…" : "Send test"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
