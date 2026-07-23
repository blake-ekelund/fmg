"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Eye,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Monitor,
  Smartphone,
  RefreshCw,
} from "lucide-react";
import { loadReps } from "./repShared";
import RepAvatar from "./RepAvatar";
import type { SalesRep } from "./reps";

type Device = "desktop" | "mobile";

/**
 * Read-only preview of the external rep portal for internal admins.
 *
 * It embeds the REAL /portal in an iframe rather than reproducing its UI, so
 * the preview can never drift from what reps actually see. The agency to view
 * rides in as ?previewAgency=<code>; the server (resolvePortalAgency) only
 * honours it for owner/admin.
 */
export default function RepPortalPreview() {
  const [reps, setReps] = useState<SalesRep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repId, setRepId] = useState<string>("");
  const [device, setDevice] = useState<Device>("desktop");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const { reps } = await loadReps();
        setReps(reps);
        // Default to the first rep whose agency we can actually scope by.
        const first = reps.find((r) => r.agencyCode);
        if (first?.id) setRepId(first.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setReps([]);
      }
    })();
  }, []);

  /* Only reps with an agency code can be previewed — the portal scopes every
     query by it, so a rep without one has nothing to show. */
  const previewable = useMemo(
    () => (reps ?? []).filter((r) => r.agencyCode),
    [reps],
  );

  const rep = previewable.find((r) => r.id === repId) ?? null;
  const src = rep ? `/portal?previewAgency=${rep.agencyCode}` : null;

  return (
    <div className="w-full space-y-4 p-5 md:px-7">
      <Link
        href="/sales-team"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted transition hover:text-brand-700"
      >
        <ArrowLeft size={12} /> Rep Directory
      </Link>

      {/* ─── Controls ─── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-card">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary">
          <Eye size={13} className="text-ink-subtle" />
          Viewing as
        </span>

        {rep && <RepAvatar rep={rep} size={22} />}

        <select
          value={repId}
          onChange={(e) => setRepId(e.target.value)}
          aria-label="Rep to preview"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-ink transition focus:border-brand-400 focus:outline-none sm:flex-none sm:min-w-64"
        >
          {previewable.length === 0 && <option value="">No reps available</option>}
          {previewable.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.agency || "No agency"} ({r.agencyCode})
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Reps live on phones — being able to check that view matters. */}
          <div className="flex gap-0.5 rounded-lg bg-surface-sunken p-0.5">
            {(
              [
                { key: "desktop", icon: Monitor, label: "Desktop" },
                { key: "mobile", icon: Smartphone, label: "Mobile" },
              ] as const
            ).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setDevice(key)}
                title={label}
                aria-pressed={device === key}
                className={
                  "rounded-md px-2 py-1 transition " +
                  (device === key
                    ? "bg-surface text-brand-700 shadow-card"
                    : "text-ink-muted hover:text-ink")
                }
              >
                <Icon size={13} />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            title="Reload preview"
            className="rounded-lg border border-line p-1.5 text-ink-muted transition hover:border-line-strong hover:text-ink"
          >
            <RefreshCw size={13} />
          </button>

          {src && (
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink-secondary transition hover:border-line-strong hover:text-ink"
            >
              <ExternalLink size={12} /> Open
            </a>
          )}
        </div>
      </div>

      <p className="text-[11px] text-ink-muted">
        This is the live portal, scoped to{" "}
        <span className="font-medium text-ink-secondary">
          {rep ? rep.agency || "this agency" : "the selected agency"}
        </span>
        . Reps sign in at{" "}
        <code className="rounded bg-surface-sunken px-1 font-mono text-[10px]">/portal</code>{" "}
        and see only their own agency&apos;s customers.
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-critical/20 bg-critical-soft px-3 py-2 text-[11px] text-critical">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          {error}
        </div>
      )}

      {/* ─── The portal itself ─── */}
      {reps === null ? (
        <div className="flex items-center gap-2 py-10 text-[11px] text-ink-muted">
          <Loader2 size={13} className="animate-spin" /> Loading reps…
        </div>
      ) : !src ? (
        <div className="rounded-xl border border-line bg-surface px-6 py-14 text-center shadow-card">
          <Eye size={20} className="mx-auto mb-2 text-ink-subtle" />
          <p className="text-xs font-medium text-ink">No previewable reps</p>
          <p className="mt-1 text-[11px] text-ink-muted">
            A rep needs an agency code before their portal view can be scoped.
          </p>
        </div>
      ) : (
        <div
          className={
            "overflow-hidden rounded-xl border border-line bg-surface shadow-card " +
            (device === "mobile" ? "mx-auto w-full max-w-[390px]" : "")
          }
        >
          <iframe
            key={`${src}-${device}-${reloadKey}`}
            src={src}
            title={`Rep portal preview — ${rep?.name ?? ""}`}
            className="h-[72vh] w-full min-h-[520px] border-0 bg-surface-muted"
          />
        </div>
      )}
    </div>
  );
}
