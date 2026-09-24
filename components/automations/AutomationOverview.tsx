"use client";

/**
 * The automation Overview: the drip read at a glance, the way a campaign plan
 * reads — a summary, a revenue-per-email (RPE) benchmark, a horizontal
 * timeline of when each email lands (click a dot to jump to it), and every
 * email rendered below with its own results.
 *
 * Read-only apart from the benchmark settings, which save into
 * trigger_config (rpe_target, rpe_conversion_pct, attribution_days) through
 * the editor's normal config patch. Building the flow stays on the Build tab.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mail, Tag, Target, TrendingUp, Clock } from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Offer = { label: string; code: string; unique: boolean };
type StepPerf = {
  step_order: number;
  delay_days: number;
  send_date: string | null;
  template: { id: string; name: string; subject: string | null; preview_text: string | null; offer: Offer | null } | null;
  delivered: number;
  opened: number;
  clicked: number;
  orders: number;
  revenue: number;
};
type Perf = { attribution_days: number; enrolled: number; steps: StepPerf[]; aov: number | null; aov_basis?: string };

/** The only config keys the Overview writes. */
type BenchmarkUpdate = { rpe_target?: number; rpe_conversion_pct?: number; attribution_days?: number };

type Config = {
  audience?: string;
  brand?: string;
  order_event_type?: "first" | "last";
  days_after?: number;
  status_target?: "at_risk" | "churned";
  rpe_target?: number;
  rpe_conversion_pct?: number;
  attribution_days?: number;
  [k: string]: unknown;
};

/** Below this many delivered emails an RPE is noise, so it's flagged "early". */
const EARLY_SAMPLE = 100;
const WINDOW_OPTIONS = [3, 5, 7, 14];

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const money = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 1000) / 10}%` : "—");

export default function AutomationOverview({
  automationId,
  description,
  triggerType,
  config,
  onConfigChange,
}: {
  automationId: string;
  description: string | null;
  triggerType: string;
  config: Config;
  onConfigChange: (updates: BenchmarkUpdate) => Promise<void>;
}) {
  const [perf, setPerf] = useState<Perf | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const cardRefs = useRef(new Map<number, HTMLElement>());

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(`/api/automations/${automationId}/performance`, { headers: await authHeader() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setLoadError(json.error ?? "Couldn't load results");
    else setPerf(json as Perf);
  }, [automationId]);

  useEffect(() => {
    void load();
  }, [load, config.attribution_days]);

  /* Day each email lands, counted from the trigger. A pinned step shows its
     date; for spacing it simply sits where its relative wait would put it. */
  const timeline = useMemo(() => {
    const base = triggerType === "order_event" ? config.days_after ?? 7 : 0;
    let day = base;
    return (perf?.steps ?? []).map((s, i) => {
      day = i === 0 ? base + s.delay_days : day + s.delay_days;
      return { ...s, day };
    });
  }, [perf, triggerType, config.days_after]);

  const lastDay = Math.max(1, ...timeline.map((t) => t.day));
  const offers = timeline.filter((t) => t.template?.offer).length;
  const totals = timeline.reduce(
    (acc, t) => ({
      delivered: acc.delivered + t.delivered,
      opened: acc.opened + t.opened,
      clicked: acc.clicked + t.clicked,
      orders: acc.orders + t.orders,
      revenue: acc.revenue + t.revenue,
    }),
    { delivered: 0, opened: 0, clicked: 0, orders: 0, revenue: 0 },
  );

  const conversionPct = config.rpe_conversion_pct ?? 1;
  const suggested = perf?.aov ? Math.round(perf.aov * (conversionPct / 100) * 100) / 100 : null;
  const target = config.rpe_target ?? suggested ?? null;
  const actualRpe = totals.delivered > 0 ? totals.revenue / totals.delivered : null;

  const triggerLabel =
    triggerType === "order_event"
      ? `after their ${config.order_event_type === "last" ? "latest" : "first"}${config.brand ? ` ${config.brand}` : ""} order`
      : triggerType === "status_change"
        ? `after they become ${config.status_target === "churned" ? "Churned" : "At Risk"}`
        : triggerType === "date"
          ? "after the start date"
          : "after they're added";

  function jumpTo(order: number) {
    setActive(order);
    cardRefs.current.get(order)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loadError) {
    return <div className="px-6 py-10 text-center text-[11px] text-critical">{loadError}</div>;
  }
  if (!perf) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[11px] text-ink-muted">
        <Loader2 size={14} className="animate-spin" /> Loading overview…
      </div>
    );
  }
  if (timeline.length === 0) {
    return (
      <div className="px-6 py-14 text-center text-[11px] text-ink-muted">
        No emails yet. Add steps on the <span className="font-medium">Build</span> tab.
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-8">
      {/* ── Summary ── */}
      <section>
        {description && <p className="max-w-3xl text-xs leading-relaxed text-ink-secondary">{description}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Emails" value={String(timeline.length)} sub={`Day ${timeline[0].day} → Day ${lastDay}`} />
          <Tile label="Span" value={`${lastDay} days`} sub={triggerLabel} />
          <Tile label="With an offer" value={`${offers} of ${timeline.length}`} sub={offers ? `from Day ${timeline.find((t) => t.template?.offer)?.day}` : "no discounts"} />
          <Tile label="Enrolled" value={perf.enrolled.toLocaleString()} sub={`${totals.delivered.toLocaleString()} emails delivered`} />
          <Tile label="Attributed revenue" value={money(totals.revenue, 0)} sub={`${totals.orders} order${totals.orders === 1 ? "" : "s"} · ${perf.attribution_days}-day window`} />
          <Tile
            label="Revenue per email"
            value={actualRpe != null ? money(actualRpe) : "—"}
            sub={target != null ? `target ${money(target)}` : "set a target below"}
            tone={rpeTone(actualRpe, target, totals.delivered)}
          />
        </div>
      </section>

      {/* ── RPE benchmark ── */}
      <Benchmark
        aov={perf.aov}
        aovBasis={perf.aov_basis}
        conversionPct={conversionPct}
        target={config.rpe_target ?? null}
        suggested={suggested}
        attributionDays={perf.attribution_days}
        actual={actualRpe}
        delivered={totals.delivered}
        onSave={onConfigChange}
      />

      {/* ── Timeline ── */}
      <section>
        <h3 className="text-xs font-semibold text-ink">When each email lands</h3>
        <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-surface px-6 pb-3 pt-5 shadow-card">
          <div className="relative mx-3 h-24 min-w-[560px]">
            <div className="absolute inset-x-0 top-[30px] h-0.5 bg-line" />
            {timeline.map((t) => {
              const left = Math.sqrt(Math.max(0, t.day) / lastDay) * 100;
              const offer = !!t.template?.offer;
              const rpe = t.delivered > 0 ? t.revenue / t.delivered : null;
              return (
                <button
                  key={t.step_order}
                  onClick={() => jumpTo(t.step_order)}
                  style={{ left: `${left}%` }}
                  aria-label={`Email ${t.step_order}, day ${t.day}`}
                  title={t.template?.subject ?? `Email ${t.step_order}`}
                  className="group absolute top-[18px] flex -translate-x-1/2 flex-col items-center gap-1 focus:outline-none"
                >
                  <span
                    className={clsx(
                      "grid h-6 w-6 place-items-center rounded-full border-2 border-surface text-[10px] font-semibold ring-1 transition group-hover:scale-110 group-focus-visible:ring-2",
                      offer ? "bg-accent-100 text-accent-700 ring-accent-500" : "bg-brand-50 text-brand-700 ring-brand-400",
                      active === t.step_order && "scale-110 ring-2",
                    )}
                  >
                    {t.step_order}
                  </span>
                  <span className="whitespace-nowrap font-mono text-[10px] text-ink-subtle">d{t.day}</span>
                  {rpe != null && (
                    <span className={clsx("whitespace-nowrap rounded px-1 text-[9px] font-medium tabular-nums", toneClass(rpeTone(rpe, target, t.delivered)))}>
                      {money(rpe)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex flex-wrap gap-4 text-[10px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-brand-400" />No offer</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-accent-500" />Carries a discount</span>
            <span>Chip under a dot = that email&apos;s revenue per email. Days use a square-root scale so the early emails stay readable.</span>
          </div>
        </div>
      </section>

      {/* ── The emails ── */}
      <section>
        <h3 className="text-xs font-semibold text-ink">The {timeline.length} emails</h3>
        <div className="mt-2 space-y-5">
          {timeline.map((t) => (
            <article
              key={t.step_order}
              ref={(el) => {
                if (el) cardRefs.current.set(t.step_order, el);
                else cardRefs.current.delete(t.step_order);
              }}
              className="grid scroll-mt-4 grid-cols-1 gap-3 sm:grid-cols-[72px_minmax(0,1fr)]"
            >
              <div className="flex items-baseline gap-2 sm:block sm:pt-2 sm:text-right">
                <span className="text-[10px] uppercase tracking-wider text-ink-subtle">Day</span>
                <span className="block text-2xl font-semibold tabular-nums text-ink">{t.day}</span>
                <span className="text-[10px] uppercase tracking-wider text-ink-subtle">Email {t.step_order}</span>
              </div>
              <EmailCard step={t} target={target} highlighted={active === t.step_order} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── Benchmark card ─────────────────────────────────────────────────────── */

function Benchmark({
  aov,
  aovBasis,
  conversionPct,
  target,
  suggested,
  attributionDays,
  actual,
  delivered,
  onSave,
}: {
  aov: number | null;
  aovBasis?: string;
  conversionPct: number;
  target: number | null;
  suggested: number | null;
  attributionDays: number;
  actual: number | null;
  delivered: number;
  onSave: (updates: BenchmarkUpdate) => Promise<void>;
}) {
  const [targetDraft, setTargetDraft] = useState(target != null ? String(target) : "");
  const [convDraft, setConvDraft] = useState(String(conversionPct));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setTargetDraft(target != null ? String(target) : ""), [target]);
  useEffect(() => setConvDraft(String(conversionPct)), [conversionPct]);

  const effective = target ?? suggested;
  const progress = actual != null && effective ? Math.min(100, (actual / effective) * 100) : 0;

  async function save() {
    const t = targetDraft.trim() === "" ? undefined : Number(targetDraft);
    const c = Number(convDraft);
    if (t !== undefined && (!Number.isFinite(t) || t < 0)) return setError("Enter a dollar amount, like 0.75");
    if (!Number.isFinite(c) || c <= 0 || c > 100) return setError("Enter a conversion rate between 0.1 and 100");
    setError(null);
    setSaving(true);
    try {
      await onSave({ rpe_target: t, rpe_conversion_pct: c });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2">
        <Target size={14} className="text-brand-600" />
        <h3 className="text-xs font-semibold text-ink">Revenue per email benchmark</h3>
      </div>
      <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-ink-muted">
        RPE is attributed revenue divided by emails delivered. An order counts toward the most recent email in this flow
        if it lands within the attribution window. The suggested target is your audience&apos;s average order value
        times the share of recipients you expect to buy from each email.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <label className="block">
            <span className="text-ink-muted">Average order value</span>
            <span className="mt-1 block rounded-lg bg-surface-sunken px-2.5 py-1.5 font-medium tabular-nums text-ink">
              {aov != null ? money(aov) : "—"}
            </span>
            {aovBasis && <span className="mt-0.5 block text-[10px] text-ink-subtle">{aovBasis}</span>}
          </label>
          <label className="block">
            <span className="text-ink-muted">Expected buyers per email (%)</span>
            <input
              value={convDraft}
              onChange={(e) => { setConvDraft(e.target.value); setError(null); }}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-line px-2.5 py-1.5 tabular-nums focus:border-brand-400 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-ink-muted">RPE target ($)</span>
            <input
              value={targetDraft}
              onChange={(e) => { setTargetDraft(e.target.value); setError(null); }}
              placeholder={suggested != null ? `${suggested} (suggested)` : "0.75"}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-line px-2.5 py-1.5 tabular-nums focus:border-brand-400 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-ink-muted">Attribution window</span>
            <select
              value={attributionDays}
              onChange={(e) => void onSave({ attribution_days: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 focus:border-brand-400 focus:outline-none"
            >
              {WINDOW_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} days after the email</option>
              ))}
            </select>
          </label>
          <div className="col-span-2 flex items-center gap-2">
            <button
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-brand-700 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-brand-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save benchmark"}
            </button>
            {suggested != null && (
              <button
                onClick={() => setTargetDraft(String(suggested))}
                className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-ink-secondary transition hover:bg-surface-muted"
              >
                Use suggested {money(suggested)}
              </button>
            )}
          </div>
          {error && <p className="col-span-2 text-[11px] text-critical">{error}</p>}
        </div>

        <div className="rounded-lg bg-surface-muted p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-ink-muted">Actual vs target</span>
            {delivered > 0 && delivered < EARLY_SAMPLE && (
              <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">
                Early: {delivered} delivered
              </span>
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-ink">{actual != null ? money(actual) : "—"}</span>
            <span className="text-[11px] text-ink-muted">
              {effective != null ? `of ${money(effective)}${target == null ? " suggested" : ""}` : "no target yet"}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={clsx("h-full rounded-full", barClass(rpeTone(actual, effective, delivered)))}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-ink-muted">
            {actual == null
              ? "Results appear once the first emails go out."
              : `${Math.round(progress)}% of target. Green at or above target, amber within half, red below half.`}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── One email ──────────────────────────────────────────────────────────── */

function EmailCard({ step, target, highlighted }: { step: StepPerf & { day: number }; target: number | null; highlighted: boolean }) {
  const tpl = step.template;
  const rpe = step.delivered > 0 ? step.revenue / step.delivered : null;
  return (
    <div
      className={clsx(
        "overflow-hidden rounded-xl border bg-surface shadow-card transition-colors",
        highlighted ? "border-brand-300" : "border-line",
      )}
    >
      <div className="space-y-1.5 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {tpl?.offer ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold text-accent-700">
              <Tag size={10} /> {tpl.offer.label}
              {tpl.offer.code && <> · {tpl.offer.unique ? `unique ${tpl.offer.code} code` : tpl.offer.code}</>}
            </span>
          ) : (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">No offer</span>
          )}
          {step.send_date && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] text-ink-secondary">
              <Clock size={10} /> {step.send_date}
            </span>
          )}
          {tpl && <span className="truncate text-[10px] text-ink-subtle">{tpl.name}</span>}
        </div>
        <div className="text-sm font-semibold text-ink">{tpl?.subject || (tpl ? "(no subject)" : "No email yet")}</div>
        {tpl?.preview_text && <div className="text-[11px] text-ink-muted">Preview: {tpl.preview_text}</div>}
      </div>

      <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center sm:grid-cols-6">
        <Metric label="Delivered" value={step.delivered.toLocaleString()} />
        <Metric label="Opened" value={pct(step.opened, step.delivered)} />
        <Metric label="Clicked" value={pct(step.clicked, step.delivered)} />
        <Metric label="Orders" value={String(step.orders)} />
        <Metric label="Revenue" value={money(step.revenue, 0)} />
        <Metric label="RPE" value={rpe != null ? money(rpe) : "—"} tone={rpeTone(rpe, target, step.delivered)} />
      </div>

      {tpl ? <LazyPreview templateId={tpl.id} /> : (
        <div className="px-4 py-8 text-center text-[11px] text-ink-muted">
          <Mail size={16} className="mx-auto mb-1 text-ink-subtle" /> This step has no email yet.
        </div>
      )}
    </div>
  );
}

/**
 * The real rendered email (the same HTML a send produces, sample merge
 * values), fetched with auth once the card nears the viewport, then sized to
 * its content so there's no nested scroll.
 */
function LazyPreview({ templateId }: { templateId: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const res = await fetch(`/api/email/block-templates/${templateId}/preview`, { headers: await authHeader() });
        if (cancelled) return;
        if (res.ok) setHtml(await res.text());
        else setFailed(true);
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [templateId]);

  return (
    <div ref={holder} className="bg-surface-sunken p-3 sm:p-5">
      {failed ? (
        <div className="py-8 text-center text-[11px] text-ink-muted">Couldn&apos;t load the preview.</div>
      ) : html == null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[11px] text-ink-muted">
          <Loader2 size={13} className="animate-spin" /> Loading email…
        </div>
      ) : (
        <iframe
          ref={frame}
          title="Email preview"
          srcDoc={html}
          sandbox="allow-same-origin allow-popups"
          onLoad={() => {
            const doc = frame.current?.contentDocument;
            if (doc) setHeight(doc.documentElement.scrollHeight + 4);
          }}
          style={{ height }}
          className="mx-auto block w-full max-w-[640px] rounded-lg border-0 bg-white"
        />
      )}
    </div>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────────── */

type Tone = "good" | "near" | "low" | "none";

function rpeTone(actual: number | null, target: number | null, delivered: number): Tone {
  if (actual == null || target == null || target <= 0 || delivered === 0) return "none";
  if (actual >= target) return "good";
  return actual >= target / 2 ? "near" : "low";
}
function toneClass(t: Tone): string {
  return t === "good"
    ? "bg-positive-soft text-positive"
    : t === "near"
      ? "bg-warning-soft text-warning"
      : t === "low"
        ? "bg-critical-soft text-critical"
        : "bg-surface-sunken text-ink-secondary";
}
function barClass(t: Tone): string {
  return t === "good" ? "bg-positive" : t === "near" ? "bg-warning" : t === "low" ? "bg-critical" : "bg-brand-400";
}

function Tile({ label, value, sub, tone = "none" }: { label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink-subtle">
        {label === "Revenue per email" && <TrendingUp size={10} />}
        {label}
      </div>
      <div
        className={clsx(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "good" ? "text-positive" : tone === "near" ? "text-warning" : tone === "low" ? "text-critical" : "text-ink",
        )}
      >
        {value}
      </div>
      {sub && <div className="truncate text-[10px] text-ink-muted" title={sub}>{sub}</div>}
    </div>
  );
}

function Metric({ label, value, tone = "none" }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="px-2 py-2">
      <div className="text-[10px] uppercase tracking-wider text-ink-subtle">{label}</div>
      <div
        className={clsx(
          "text-xs font-semibold tabular-nums",
          tone === "good" ? "text-positive" : tone === "near" ? "text-warning" : tone === "low" ? "text-critical" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}
