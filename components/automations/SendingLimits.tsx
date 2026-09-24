"use client";

/**
 * The account-wide marketing frequency cap, edited from the Automations page.
 * However many flows someone is in, they get at most N marketing emails a
 * week, at least M days apart (bulk blasts count too). Enforced by the cron —
 * see lib/automations/overlap.ts.
 */

import { useEffect, useRef, useState } from "react";
import { Gauge, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Limits = { perWeek: number; minGapDays: number; stored: boolean };

export default function SendingLimits() {
  const [limits, setLimits] = useState<Limits | null>(null);
  const [open, setOpen] = useState(false);
  const [perWeek, setPerWeek] = useState("3");
  const [gap, setGap] = useState("2");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/email/sending-limits", { headers: await authHeader() });
      if (res.ok) {
        const l = (await res.json()) as Limits;
        setLimits(l);
        setPerWeek(String(l.perWeek));
        setGap(String(l.minGapDays));
      }
    })();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function save() {
    const p = Number(perWeek);
    const g = Number(gap);
    if (!Number.isInteger(p) || p < 0 || p > 50) return setError("Emails per week must be a whole number from 0 to 50.");
    if (!Number.isInteger(g) || g < 0 || g > 30) return setError("Days apart must be a whole number from 0 to 30.");
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/email/sending-limits", {
        method: "PATCH",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ perWeek: p, minGapDays: g }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? `Save failed (${res.status})`);
      setLimits(json as Limits);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const label = !limits
    ? "Sending limits"
    : limits.perWeek === 0 && limits.minGapDays === 0
      ? "No sending limit"
      : [limits.perWeek > 0 && `Max ${limits.perWeek}/week`, limits.minGapDays > 0 && `${limits.minGapDays}d apart`]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="How often any one customer can be emailed, across every flow"
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] font-medium text-ink-secondary transition hover:bg-surface-muted"
      >
        <Gauge size={13} />
        {label}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border border-line bg-surface p-4 shadow-overlay">
          <div className="text-sm font-semibold text-ink">Sending limits</div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
            However many flows a customer is in, they get no more than this. Bulk blasts count too. An email over the
            limit waits for the next open slot; it&apos;s never dropped.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
            <label className="block">
              <span className="text-ink-muted">Emails per 7 days</span>
              <input
                value={perWeek}
                onChange={(e) => { setPerWeek(e.target.value); setError(null); }}
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-line px-2.5 py-1.5 text-xs tabular-nums focus:border-brand-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-ink-muted">Days between emails</span>
              <input
                value={gap}
                onChange={(e) => { setGap(e.target.value); setError(null); }}
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-line px-2.5 py-1.5 text-xs tabular-nums focus:border-brand-400 focus:outline-none"
              />
            </label>
          </div>
          <p className="mt-2 text-[10px] text-ink-subtle">0 turns a rule off. Test sends are never limited.</p>
          {error && <p className="mt-2 text-[11px] text-critical">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium text-ink-secondary hover:bg-surface-muted">
              Cancel
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {saving && <Loader2 size={11} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
