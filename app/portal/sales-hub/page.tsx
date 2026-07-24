"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Copy,
  Phone,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "@/components/portal/icons";
import {
  portalGet,
  portalHref,
  usd,
  type PortalSalesHub,
} from "@/components/portal/api";
import { NI_BRAND, SASSY_BRAND, type BrandContent } from "@/lib/brandContent";
import { properCase } from "@/lib/textCase";

/**
 * The rep's Sales Hub.
 *
 * Same positioning content as the internal hub, but ordered by *their* book:
 * the channels they actually sell into come first, each paired with the USP and
 * talking points for that channel, and the accounts worth a call this week sit
 * at the top. A rep who sells gift shops shouldn't have to scroll past casino
 * talking points to find theirs.
 */

const BRANDS: BrandContent[] = [NI_BRAND, SASSY_BRAND];

function pctLabel(p: number | null): string {
  if (p === null) return "—";
  return `${p >= 0 ? "+" : ""}${p.toFixed(0)}%`;
}

export default function PortalSalesHub() {
  const [data, setData] = useState<PortalSalesHub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<string>("all");

  useEffect(() => {
    portalGet<PortalSalesHub>("/api/portal/sales-hub")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  const { kpis, channels, slipping, growing, declining } = data;
  /* Channels with no revenue this year or last are noise on a selling page. */
  const soldChannels = channels.filter(
    (c) => c.sales_2026 > 0 || c.sales_2025 > 0,
  );

  /* Channel filter (top-right dropdown). "all" = the whole book; otherwise every
     section below is scoped to the chosen channel — its numbers, its accounts to
     call, its talking points, its movers. */
  const activeCh =
    channel === "all" ? null : (channels.find((c) => c.channel === channel) ?? null);
  const slip = channel === "all" ? slipping : slipping.filter((s) => s.channel === channel);
  const grow = channel === "all" ? growing : growing.filter((g) => g.channel === channel);
  const decl = channel === "all" ? declining : declining.filter((d) => d.channel === channel);
  const shownChannels =
    channel === "all" ? soldChannels : soldChannels.filter((c) => c.channel === channel);

  // KPI tiles reflect the current scope: the channel's own totals, or the book.
  const view = activeCh
    ? {
        customers: activeCh.customers,
        sales_2026: activeCh.sales_2026,
        pct_of_2025: activeCh.pct_of_2025,
        ytd_variance: activeCh.ytd_variance,
        ytd_variance_pct: activeCh.ytd_variance_pct,
        slippingCount: slip.length,
      }
    : {
        customers: kpis.customers,
        sales_2026: kpis.sales_2026,
        pct_of_2025: kpis.pct_of_2025,
        ytd_variance: kpis.ytd_variance,
        ytd_variance_pct: kpis.ytd_variance_pct,
        slippingCount: kpis.slippingCount,
      };

  return (
    <div className="space-y-6">
      {/* Header — title left, channel picker pinned top-right */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Sales Hub
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {channel === "all"
              ? "Your talking points, ranked by where your business actually is."
              : `Everything from your ${channel} accounts.`}
          </p>
        </div>
        {soldChannels.length > 0 && (
          <div className="relative shrink-0">
            <label htmlFor="channel" className="sr-only">
              Channel
            </label>
            <select
              id="channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-9 text-sm font-medium text-gray-700 transition hover:border-gray-300 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            >
              <option value="all">All channels</option>
              {soldChannels.map((c) => (
                <option key={c.channel} value={c.channel}>
                  {c.channel}
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
        )}
      </div>

      {/* Your year at a glance — scoped to the selected channel */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Accounts" value={view.customers.toLocaleString()} />
        <Kpi label="2026 sales · YTD" value={usd(view.sales_2026)} />
        {/* Pacing: 2026 YTD as a share of last year's full total. */}
        <Kpi
          label="% of 2025"
          value={
            view.pct_of_2025 === null ? "—" : `${Math.round(view.pct_of_2025)}%`
          }
          sub="of full-year 2025"
        />
        {/* Apples-to-apples: 2026 YTD vs the same window in 2025. */}
        <Kpi
          label={`vs 2025 YTD · thru ${kpis.ytd_through}`}
          value={`${view.ytd_variance >= 0 ? "+" : "−"}${usd(Math.abs(view.ytd_variance)).replace("-", "")}`}
          tone={view.ytd_variance >= 0 ? "good" : "bad"}
          sub={pctLabel(view.ytd_variance_pct)}
        />
        <Kpi
          label="Need a call"
          value={String(view.slippingCount)}
          tone={view.slippingCount > 0 ? "bad" : "good"}
          sub="no order in 6+ months"
        />
      </div>

      {/* ── Call these accounts ── */}
      {slip.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-baseline gap-x-3 border-b border-gray-100 px-5 py-3.5">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Phone size={15} className="text-amber-500" />
              Call these accounts
            </h2>
            <span className="text-xs text-gray-500">
              Ordered by what&apos;s on the table
            </span>
          </div>
          <ul className="divide-y divide-gray-50">
            {slip.map((s) => (
              <li
                key={s.customerid}
                className="flex items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {properCase(s.name)}
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {s.days_since_order} days since last order
                    {s.channel ? ` · ${s.channel}` : ""}
                    {s.state ? ` · ${s.state}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold tabular-nums text-gray-900">
                    {usd(s.at_stake)}
                  </div>
                  <div className="text-[11px] text-gray-400">at stake</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-100 px-5 py-2.5">
            <Link
              href={portalHref("/portal/customers")}
              className="text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-800"
            >
              See all customers
            </Link>
          </div>
        </section>
      )}

      {/* ── Your channels, with what to say ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {channel === "all" ? "What to say, by channel" : "What to say"}
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {channel === "all"
              ? "Your channels first — biggest by 2026 revenue."
              : `Talking points for ${channel}.`}
          </p>
        </div>

        {shownChannels.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 px-5 py-8 text-center text-sm text-gray-400">
            No channel revenue recorded yet.
          </p>
        ) : (
          shownChannels.map((ch, i) => (
            <ChannelCard key={ch.channel} channel={ch} defaultOpen={channel !== "all" || i === 0} />
          ))
        )}
      </section>

      {/* ── Movers ── */}
      {(grow.length > 0 || decl.length > 0) && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MoverList
            title="Growing"
            icon={<TrendingUp size={15} className="text-emerald-500" />}
            hint="Thank them — and ask what else they need."
            rows={grow}
          />
          <MoverList
            title="Slipping"
            icon={<TrendingDown size={15} className="text-rose-500" />}
            hint="Worth a conversation before the year closes."
            rows={decl}
          />
        </section>
      )}

      {/* ── Brand basics ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Brand basics</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            The short version of each brand, ready to copy.
          </p>
        </div>
        {BRANDS.map((b) => (
          <BrandCard key={b.name} brand={b} />
        ))}
      </section>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          tone === "good"
            ? "text-emerald-600"
            : tone === "bad"
              ? "text-rose-600"
              : "text-gray-900"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}

function ChannelCard({
  channel,
  defaultOpen,
}: {
  channel: PortalSalesHub["channels"][number];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  /* Each brand words the same channel differently, so show both — the rep
     picks depending on which line they're presenting. Channels with no
     scripted copy (e.g. UNCLASSIFIED) simply show their numbers. */
  const pitches = BRANDS.map((b) => ({
    brand: b.name,
    content: b.channels[channel.channel],
  })).filter((p) => p.content);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-gray-50"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900">
            {channel.channel}
          </div>
          <div className="text-xs text-gray-500">
            {channel.customers} account{channel.customers === 1 ? "" : "s"} ·{" "}
            {channel.activeCustomers} active
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums text-gray-900">
            {usd(channel.sales_2026)}
          </div>
          {/* Same-window: 2026 YTD vs 2025 YTD, not vs the full prior year. */}
          <div
            className={`text-[11px] tabular-nums ${
              channel.ytd_variance >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {channel.ytd_variance >= 0 ? "+" : "−"}
            {usd(Math.abs(channel.ytd_variance))} vs LY YTD
          </div>
        </div>
        <ChevronDown
          size={15}
          className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-100 px-5 py-4">
          {pitches.length === 0 ? (
            <p className="text-sm text-gray-400">
              No scripted talking points for this channel yet.
            </p>
          ) : (
            pitches.map((p) => (
              <div key={p.brand}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {p.brand}
                  </span>
                  <CopyButton
                    text={`${p.content!.usp}\n\n${p.content!.talkingPoints.map((t) => `• ${t}`).join("\n")}`}
                  />
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {p.content!.usp}
                </p>
                <ul className="mt-2 space-y-1">
                  {p.content!.talkingPoints.map((t) => (
                    <li
                      key={t}
                      className="flex gap-2 text-sm text-gray-600"
                    >
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-300" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MoverList({
  title,
  icon,
  hint,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  hint: string;
  rows: PortalSalesHub["growing"];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-3.5">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          {icon}
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
      </div>
      <ul className="divide-y divide-gray-50">
        {rows.map((r) => (
          <li key={r.customerid} className="flex items-center gap-3 px-5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-gray-900">{properCase(r.name)}</div>
              {r.channel && (
                <div className="truncate text-xs text-gray-400">{r.channel}</div>
              )}
            </div>
            <div
              className={`shrink-0 text-sm font-medium tabular-nums ${
                r.variance >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {r.variance >= 0 ? "+" : "−"}
              {usd(Math.abs(r.variance))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BrandCard({ brand }: { brand: BrandContent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-gray-50"
      >
        <Sparkles size={15} className="shrink-0 text-gray-400" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900">{brand.name}</div>
          <div className="truncate text-xs text-gray-500">{brand.oneLiner}</div>
        </div>
        <ChevronDown
          size={15}
          className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-100 px-5 py-4">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Elevator pitch
              </h4>
              <CopyButton text={brand.elevator} />
            </div>
            <p className="text-sm text-gray-700">{brand.elevator}</p>
          </div>

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Pillars
            </h4>
            <div className="space-y-2">
              {brand.pillars.map((p) => (
                <div key={p.title}>
                  <div className="text-sm font-medium text-gray-900">
                    {p.title}
                  </div>
                  <div className="text-sm text-gray-600">{p.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Who buys it
            </h4>
            <p className="text-sm text-gray-600">{brand.targetConsumer}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* Clipboard blocked (insecure context / permission) — stay silent
             rather than throw a scary error at a rep mid-call. */
        }
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
    >
      {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
