"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Megaphone,
  MousePointerClick,
  Eye,
  ShoppingCart,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** One campaign email this customer received, plus what followed it. */
type CampaignSend = {
  id: string;
  kind: "bulk" | "automation";
  campaign: string;
  subject: string;
  stepOrder: number | null;
  isTest: boolean;
  status: string;
  sentAt: string | null;
  errorText: string | null;
  openedAt: string | null;
  openCount: number;
  clickedAt: string | null;
  clickCount: number;
  suppression: { source: string; at: string; reason: string | null } | null;
  order: {
    ref: string;
    date: string;
    total: number | null;
    daysAfter: number;
    reactivated: boolean;
  } | null;
};

type Summary = {
  sent: number;
  opened: number;
  clicked: number;
  failed: number;
  ordersAfter: number;
  revenueAfter: number;
  medianDaysToOrder: number | null;
  suppressed: { source: string; at: string } | null;
};

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** "2h" / "3d" between a send and whatever it triggered. */
function gapLabel(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const ms = Date.parse(to) - Date.parse(from);
  if (Number.isNaN(ms) || ms < 0) return null;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

const SUPPRESSION_LABEL: Record<string, string> = {
  link: "Unsubscribed",
  complaint: "Marked as spam",
  bounce: "Bounced",
  manual: "Suppressed",
};

/**
 * Campaign email history for one customer: the blasts and automation steps we
 * sent them, how each performed, and how long after it they acted.
 */
export default function CampaignEmailsTab({
  customerId,
  isD2C,
}: {
  customerId: string;
  isD2C: boolean;
}) {
  const [sends, setSends] = useState<CampaignSend[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [windowDays, setWindowDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          type: isD2C ? "d2c" : "wholesale",
          ref: customerId,
        });
        const res = await fetch(`/api/email/customer-campaigns?${params}`, {
          headers: await authHeader(),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json?.error ?? "Couldn't load campaign history");
        } else {
          setSends(json.sends ?? []);
          setSummary(json.summary ?? null);
          setWindowDays(json.windowDays ?? 90);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customerId, isD2C]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
        <Loader2 size={15} className="animate-spin" /> Loading campaign history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        {error}
      </div>
    );
  }

  if (sends.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
        <Megaphone size={24} className="mx-auto text-gray-300" />
        <h2 className="mt-3 text-sm font-medium text-gray-900">
          No campaign emails yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
          Blasts from Templates and automation steps sent to this customer show
          up here with opens, clicks, and the order that followed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* ── Deliverability summary ── */}
      {summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Sent" value={String(summary.sent)} sub={summary.failed ? `${summary.failed} failed` : undefined} />
          <Stat
            label="Opened"
            value={pct(summary.opened, summary.sent)}
            sub={`${summary.opened} of ${summary.sent}`}
            icon={<Eye size={12} className="text-gray-400" />}
          />
          <Stat
            label="Clicked"
            value={pct(summary.clicked, summary.sent)}
            sub={`${summary.clicked} of ${summary.sent}`}
            icon={<MousePointerClick size={12} className="text-gray-400" />}
          />
          <Stat
            label={`Orders ≤ ${windowDays}d`}
            value={String(summary.ordersAfter)}
            sub={summary.revenueAfter ? fmtMoney(summary.revenueAfter) : undefined}
            icon={<ShoppingCart size={12} className="text-gray-400" />}
          />
          <Stat
            label="Median to order"
            value={summary.medianDaysToOrder == null ? "—" : `${summary.medianDaysToOrder}d`}
            sub="after a send"
          />
        </div>
      ) : null}

      {summary?.suppressed ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {SUPPRESSION_LABEL[summary.suppressed.source] ?? summary.suppressed.source} on{" "}
            {fmtDate(summary.suppressed.at)} — this address is suppressed, so
            further campaign mail is skipped.
          </span>
        </div>
      ) : null}

      {/* ── Send history ── */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-400">
              <th className="px-3 py-2.5 font-medium">Campaign</th>
              <th className="px-3 py-2.5 font-medium">Sent</th>
              <th className="px-3 py-2.5 font-medium">Opened</th>
              <th className="px-3 py-2.5 font-medium">Clicked</th>
              <th className="px-3 py-2.5 font-medium">What happened next</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sends.map((s) => {
              const openGap = gapLabel(s.sentAt, s.openedAt);
              const clickGap = gapLabel(s.sentAt, s.clickedAt);
              return (
                <tr key={s.id} className="border-b border-gray-50 last:border-0 align-top">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-900">{s.campaign}</div>
                    <div className="text-gray-400">{s.subject}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span
                        className={
                          s.kind === "automation"
                            ? "inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700"
                            : "inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                        }
                      >
                        {s.kind === "automation"
                          ? `Automation${s.stepOrder ? ` · step ${s.stepOrder}` : ""}`
                          : "Blast"}
                      </span>
                      {s.isTest ? (
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          test
                        </span>
                      ) : null}
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">
                    {fmtDate(s.sentAt)}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5">
                    {s.openedAt ? (
                      <>
                        <div className="font-medium text-gray-900">{openGap ?? "yes"}</div>
                        <div className="text-gray-400">
                          {s.openCount} open{s.openCount === 1 ? "" : "s"}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5">
                    {s.clickedAt ? (
                      <>
                        <div className="font-medium text-gray-900">{clickGap ?? "yes"}</div>
                        <div className="text-gray-400">
                          {s.clickCount} click{s.clickCount === 1 ? "" : "s"}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  <td className="px-3 py-2.5">
                    {s.order ? (
                      <>
                        <div className="font-medium text-gray-900">
                          Ordered {s.order.daysAfter}d later
                          {s.order.total != null ? ` · ${fmtMoney(s.order.total)}` : ""}
                        </div>
                        <div className="text-gray-400">
                          {s.order.ref} on {fmtDate(s.order.date)}
                        </div>
                        {s.order.reactivated ? (
                          <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            Reactivated
                          </span>
                        ) : null}
                      </>
                    ) : s.suppression ? (
                      <span className="text-gray-400">
                        {SUPPRESSION_LABEL[s.suppression.source] ?? s.suppression.source}{" "}
                        {gapLabel(s.sentAt, s.suppression.at)
                          ? `${gapLabel(s.sentAt, s.suppression.at)} later`
                          : ""}
                      </span>
                    ) : (
                      <span className="text-gray-300">No order within {windowDays}d</span>
                    )}
                  </td>

                  <td className="px-3 py-2.5">
                    {s.status === "sent" ? (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        sent
                      </span>
                    ) : s.status === "failed" ? (
                      <span
                        className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700"
                        title={s.errorText ?? undefined}
                      >
                        failed
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                        {s.status}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400">
        “What happened next” is the first order placed within {windowDays} days
        of the send — timing, not proof. Two sends close together both point at
        the same order; the summary counts each order once. Opens depend on
        images loading, so treat the open rate as a floor.
      </p>
    </div>
  );
}

/* ─── Summary tile ─── */

function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{value}</div>
      {sub ? <div className="text-[11px] text-gray-400">{sub}</div> : null}
    </div>
  );
}
