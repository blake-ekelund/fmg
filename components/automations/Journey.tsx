"use client";

/**
 * The journey — the automation's emails laid out left to right on the days
 * they land — and the inspector for whichever email is selected. Together
 * they ARE the editor: pick a card to choose its email, change its timing,
 * reorder or remove it, and see it rendered with its results.
 *
 * Presentational only: AutomationEditor owns the data and the save calls and
 * hands in the timing control (its WaitRow) so there's one timing editor.
 */

import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Loader2,
  Monitor,
  Plus,
  Smartphone,
  Tag,
  Trash2,
  Zap,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export type JourneyStep = {
  id: string;
  step_order: number;
  template_id: string | null;
  delay_days: number;
  send_date?: string | null;
};

export type JourneyTemplate = { id: string; name: string; subject: string; source?: "text" | "blocks" | "html" };

export type StepResult = {
  step_order: number;
  template: { subject: string | null; preview_text: string | null; offer: { label: string; code: string; unique: boolean } | null } | null;
  delivered: number;
  opened: number;
  clicked: number;
  orders: number;
  revenue: number;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function waitLabel(step: JourneyStep, isFirst: boolean): string {
  if (step.send_date) {
    return new Date(`${step.send_date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  const d = step.delay_days;
  if (d === 0) return isFirst ? "Right away" : "Same day";
  if (d % 7 === 0) return `${d / 7} wk`;
  return `${d} day${d === 1 ? "" : "s"}`;
}

/* ── The strip ─────────────────────────────────────────────────────────── */

export function JourneyStrip({
  steps,
  days,
  templates,
  results,
  triggerSummary,
  selectedId,
  onSelect,
  onAdd,
}: {
  steps: JourneyStep[];
  /** Day each step lands, counted from the trigger (parallel to steps). */
  days: number[];
  templates: Map<string, JourneyTemplate>;
  results: Map<number, StepResult>;
  triggerSummary: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-3 pt-1.5 [scrollbar-width:thin]">
      <ol className="flex min-w-max items-stretch">
        <li className="flex">
          <div className="flex w-44 flex-col rounded-2xl bg-brand-700 p-3.5 text-white shadow-card">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-200">
              <Zap size={11} /> Starts
            </span>
            <span className="mt-2 text-[13px] font-medium leading-snug">{triggerSummary}</span>
          </div>
        </li>

        {steps.map((s, i) => {
          const tpl = s.template_id ? templates.get(s.template_id) : undefined;
          const r = results.get(s.step_order);
          const offer = r?.template?.offer ?? null;
          const selected = s.id === selectedId;
          return (
            <li key={s.id} className="flex items-center">
              <Connector label={waitLabel(s, i === 0)} pinned={!!s.send_date} />
              <button
                onClick={() => onSelect(s.id)}
                aria-pressed={selected}
                className={clsx(
                  "flex h-full w-56 flex-col rounded-2xl border bg-surface p-3.5 text-left shadow-card transition",
                  selected
                    ? "border-brand-500 ring-4 ring-brand-100"
                    : "border-line hover:-translate-y-0.5 hover:border-line-strong",
                )}
              >
                <span className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider">
                  <span className={selected ? "text-brand-600" : "text-ink-subtle"}>Email {i + 1}</span>
                  <span className="font-mono font-medium normal-case tracking-normal text-ink-muted">Day {days[i]}</span>
                </span>
                <span className="mt-1.5 line-clamp-2 min-h-[2.4rem] text-[13px] font-medium leading-snug text-ink">
                  {tpl ? tpl.subject || tpl.name : <span className="text-ink-muted">No email chosen</span>}
                </span>
                <span className="mb-3 mt-2">
                  {!tpl ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning">
                      <AlertTriangle size={10} /> Pick an email
                    </span>
                  ) : offer ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold text-accent-700">
                      <Tag size={10} /> {offer.label}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                      No offer
                    </span>
                  )}
                </span>
                <span className="mt-auto flex gap-3 border-t border-line pt-2.5 text-[10px] tabular-nums text-ink-muted">
                  <span><b className="font-semibold text-ink">{(r?.delivered ?? 0).toLocaleString()}</b> sent</span>
                  <span><b className="font-semibold text-ink">{pct(r?.opened ?? 0, r?.delivered ?? 0)}</b> open</span>
                  <span><b className="font-semibold text-ink">{pct(r?.clicked ?? 0, r?.delivered ?? 0)}</b> click</span>
                </span>
              </button>
            </li>
          );
        })}

        <li className="flex items-center">
          <Connector />
          <button
            onClick={onAdd}
            className="flex h-full min-h-[132px] w-36 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line-strong text-[11px] font-medium text-ink-muted transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
          >
            <Plus size={16} />
            Add email
          </button>
        </li>
      </ol>
    </div>
  );
}

function Connector({ label, pinned }: { label?: string; pinned?: boolean }) {
  return (
    <span className="relative flex w-20 shrink-0 items-center justify-center" aria-hidden={!label}>
      <span className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
      {label && (
        <span
          className={clsx(
            "relative whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px]",
            pinned ? "border-brand-200 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink-muted",
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}

/* ── The inspector ─────────────────────────────────────────────────────── */

export function EmailInspector({
  step,
  index,
  count,
  day,
  templates,
  result,
  timingControl,
  onTemplateChange,
  onMove,
  onDelete,
}: {
  step: JourneyStep;
  index: number;
  count: number;
  day: number;
  templates: JourneyTemplate[];
  result: StepResult | undefined;
  timingControl: React.ReactNode;
  onTemplateChange: (templateId: string | null) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const tpl = templates.find((t) => t.id === step.template_id);
  const subject = result?.template?.subject ?? tpl?.subject ?? null;
  const previewText = result?.template?.preview_text ?? null;
  const offer = result?.template?.offer ?? null;
  const delivered = result?.delivered ?? 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
              Email {index + 1} of {count}
            </div>
            <div className="mt-0.5 text-lg font-semibold text-ink">Day {day}</div>
          </div>
          <div className="flex items-center gap-1">
            <IconButton label="Move earlier" disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowLeft size={14} />
            </IconButton>
            <IconButton label="Move later" disabled={index === count - 1} onClick={() => onMove(1)}>
              <ArrowRight size={14} />
            </IconButton>
            <IconButton label="Remove this email" danger onClick={onDelete}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        </div>

        <Field label="Email">
          <select
            value={step.template_id ?? ""}
            onChange={(e) => onTemplateChange(e.target.value || null)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-brand-400 focus:outline-none"
          >
            <option value="">Add later</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
            {step.template_id && !tpl && <option value={step.template_id}>(missing template)</option>}
          </select>
          {tpl && (
            <a
              href={`/templates?edit=${tpl.id}`}
              target="_blank"
              rel="noopener"
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-800"
            >
              Edit this email <ExternalLink size={11} />
            </a>
          )}
        </Field>

        <Field label="When it sends">{timingControl}</Field>

        {tpl && (
          <dl className="space-y-2.5 rounded-xl bg-surface-muted p-3 text-xs">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Subject</dt>
              <dd className="mt-0.5 text-ink">{subject || "(no subject)"}</dd>
            </div>
            {previewText && (
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Preview text</dt>
                <dd className="mt-0.5 text-ink-secondary">{previewText}</dd>
              </div>
            )}
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Offer</dt>
              <dd className="mt-0.5 text-ink-secondary">
                {offer ? (
                  <>
                    <span className="font-medium text-accent-700">{offer.label}</span>
                    {offer.code && <> · {offer.unique ? `a personal ${offer.code} code per customer` : `code ${offer.code}`}</>}
                  </>
                ) : (
                  "None"
                )}
              </dd>
            </div>
          </dl>
        )}

        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Results</div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Sent" value={delivered.toLocaleString()} />
            <Stat label="Opened" value={pct(result?.opened ?? 0, delivered)} />
            <Stat label="Clicked" value={pct(result?.clicked ?? 0, delivered)} />
            <Stat label="Orders" value={String(result?.orders ?? 0)} />
            <Stat label="Revenue" value={money(result?.revenue ?? 0)} wide />
          </div>
        </div>
      </div>

      <EmailPreview templateId={tpl?.id ?? null} />
    </div>
  );
}

/** The email as a send renders it (sample merge values), desktop or phone width. */
function EmailPreview({ templateId }: { templateId: string | null }) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [height, setHeight] = useState(640);
  // Keyed by template id, so switching emails never flashes the previous one.
  const [loaded, setLoaded] = useState<{ id: string; html: string | null } | null>(null);

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/email/block-templates/${templateId}/preview`, { headers: await authHeader() });
      const html = res.ok ? await res.text() : null;
      if (!cancelled) setLoaded({ id: templateId, html });
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const current = loaded && loaded.id === templateId ? loaded : null;
  const html = current?.html ?? null;
  const state: "loading" | "error" | "idle" = !current ? "loading" : current.html == null ? "error" : "idle";

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Preview</span>
        <div className="flex rounded-lg bg-surface-sunken p-0.5">
          {(["desktop", "phone"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              aria-pressed={device === d}
              className={clsx(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                device === d ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
              )}
            >
              {d === "desktop" ? <Monitor size={12} /> : <Smartphone size={12} />}
              {d === "desktop" ? "Desktop" : "Phone"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-1 justify-center bg-surface-sunken p-4 sm:p-6">
        {!templateId ? (
          <div className="self-center py-24 text-center text-[11px] text-ink-muted">Choose an email to see it here.</div>
        ) : state === "error" ? (
          <div className="self-center py-24 text-center text-[11px] text-ink-muted">Couldn&apos;t load the preview.</div>
        ) : html == null ? (
          <div className="flex items-center gap-2 self-center py-24 text-[11px] text-ink-muted">
            <Loader2 size={13} className="animate-spin" /> Loading email…
          </div>
        ) : (
          <iframe
            title="Email preview"
            srcDoc={html}
            sandbox="allow-same-origin allow-popups"
            onLoad={(e) => {
              const doc = (e.target as HTMLIFrameElement).contentDocument;
              if (doc) setHeight(doc.documentElement.scrollHeight + 4);
            }}
            style={{ height, width: device === "desktop" ? 640 : 375 }}
            className="max-w-full rounded-xl border-0 bg-white shadow-raised transition-[width] duration-200"
          />
        )}
      </div>
    </div>
  );
}

/* ── Bits ──────────────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={clsx("rounded-xl border border-line px-2.5 py-2", wide && "col-span-2")}>
      <div className="text-[10px] text-ink-muted">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-ink">{value}</div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={clsx(
        "rounded-lg p-1.5 text-ink-muted transition disabled:opacity-30 disabled:hover:bg-transparent",
        danger ? "hover:bg-critical-soft hover:text-critical" : "hover:bg-surface-sunken hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
