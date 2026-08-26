"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { RefreshCw, AlertTriangle, Download, Archive, ArchiveRestore, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { VarianceRow, VarianceSummary, VarianceFlag } from "@/lib/inventoryVariance";

type Payload = {
  snapshotAt: string;
  snapshotAgeHours: number;
  synapseRowCount: number;
  summary: VarianceSummary;
  rows: VarianceRow[];
  /** False until migration 20260826000000 is applied. */
  overridesReady: boolean;
};

/** Beyond this the Fishbowl snapshot is too old to draw conclusions from — it
 *  refreshes 3x daily, so a full day of silence means the sync is broken. */
const STALE_HOURS = 26;

const FLAG_LABEL: Record<VarianceFlag, string> = {
  "missing-in-synapse": "Not at Point B",
  "missing-in-fishbowl": "Not in Fishbowl",
  "mixed-uom": "Mixed UOM",
  "uom-mismatch": "Unit mismatch",
  "held-stock": "Held stock",
};

const FLAG_STYLE: Record<VarianceFlag, string> = {
  "missing-in-synapse": "bg-amber-50 text-amber-700 border-amber-200",
  "missing-in-fishbowl": "bg-purple-50 text-purple-700 border-purple-200",
  "mixed-uom": "bg-blue-50 text-blue-700 border-blue-200",
  "uom-mismatch": "bg-blue-50 text-blue-700 border-blue-200",
  "held-stock": "bg-gray-50 text-gray-600 border-gray-200",
};

type View = "differences" | "all" | "flagged" | "archived";

const n = (v: number | null) => (v === null ? "—" : v.toLocaleString());

export default function VarianceReport() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("differences");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draftUom, setDraftUom] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Internal API routes authenticate off an Authorization header, NOT the
      // session cookie — a bare fetch() here is always a 401.
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch("/api/inventory/variance", {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setData(json as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  /**
   * Record a decision, then reload. A reload rather than a local patch because
   * archiving changes every summary figure, and recomputing those in the client
   * would be a second implementation of summarize() waiting to drift.
   */
  const saveOverride = async (part: string, patch: { archived?: boolean; uom?: string }) => {
    setSaving(part);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch("/api/inventory/variance", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ part, ...patch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toUpperCase();
    return data.rows.filter((r) => {
      // Archived lines are a deliberate "settled" — they only appear when asked for.
      if (view === "archived") {
        if (!r.archived) return false;
      } else if (r.archived) return false;
      if (view === "differences" && r.variance === 0) return false;
      if (view === "differences" && r.variance === null && !r.flags.length) return false;
      if (view === "flagged" && !r.flags.length) return false;
      if (!term) return true;
      return r.part.includes(term) || r.description.toUpperCase().includes(term);
    });
  }, [data, view, q]);

  const exportCsv = () => {
    if (!data) return;
    const head = [
      "Part", "Description", "Fishbowl On Hand", "Fishbowl UOM", "Synapse Physical",
      "Synapse UOM", "Variance", "Variance %", "Synapse Available", "Synapse Held",
      "Synapse Committed", "Flags",
    ];
    const body = rows.map((r) => [
      r.part, r.description, r.fishbowl ?? "", r.fishbowlUom ?? "", r.synapse ?? "",
      r.synapseUom ?? "", r.variance ?? "",
      r.variancePct === null ? "" : r.variancePct.toFixed(1),
      r.synapseAvailable ?? "", r.synapseHeld ?? "", r.synapseCommitted ?? "",
      r.flags.map((f) => FLAG_LABEL[f]).join(" | "),
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-variance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = data?.summary;
  const stale = (data?.snapshotAgeHours ?? 0) > STALE_HOURS;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Variance Report</h1>
          <p className="text-sm text-gray-500 mt-1">
            Fishbowl&apos;s inventory snapshot against the live count at Point B. Point B is
            the building, so a gap here means Fishbowl is off — or paperwork is in flight.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={!data || rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> Export
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800 disabled:opacity-40"
          >
            <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && !data.overridesReady && (
        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Archiving and unit overrides need migration{" "}
            <code className="rounded bg-blue-100 px-1">20260826000000</code> — run{" "}
            <code className="rounded bg-blue-100 px-1">supabase db push</code>. The report
            works without it; saving a change won&apos;t.
          </span>
        </div>
      )}

      {stale && data && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            The Fishbowl snapshot is {data.snapshotAgeHours}h old. It should refresh three
            times a day — until it does, these differences may just be staleness rather than
            a real gap. Check fishbowl-inventory-sync.
          </span>
        </div>
      )}

      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Compared" value={s.compared.toLocaleString()} sub="parts in both" />
          <Stat
            label="Differ"
            value={s.differing.toLocaleString()}
            sub={s.compared ? `${Math.round((s.differing / s.compared) * 100)}% of compared` : ""}
            tone={s.differing > 0 ? "warn" : "ok"}
          />
          <Stat
            label="Total gap"
            value={s.totalAbsVariance.toLocaleString()}
            sub={s.uomMismatch ? `excl. ${s.uomMismatch} unit-mismatched` : "units, absolute"}
          />
          <Stat label="Fishbowl" value={s.fishbowlTotal.toLocaleString()} sub="units on hand" />
          <Stat
            label="Point B"
            value={s.synapseTotal.toLocaleString()}
            sub={s.archived ? `${s.archived} archived, excluded` : "units physical"}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(
            [
              ["differences", "Differences"],
              ["flagged", "Needs a look"],
              ["all", "All parts"],
              ["archived", "Archived"],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={clsx(
                "rounded-md px-3 py-1.5 text-sm",
                view === v ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search part or description…"
          className="flex-1 min-w-[200px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-gray-400"
        />
        {data && (
          <span className="text-xs text-gray-400">
            {rows.length.toLocaleString()} shown · snapshot{" "}
            {new Date(data.snapshotAt).toLocaleString()}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3 text-left font-medium">Part</th>
              <th className="px-4 py-3 text-right font-medium">Fishbowl</th>
              <th className="px-4 py-3 text-right font-medium">Point B</th>
              <th className="px-4 py-3 text-center font-medium">Units</th>
              <th className="px-4 py-3 text-right font-medium">Variance</th>
              <th className="px-4 py-3 text-right font-medium">%</th>
              <th className="px-4 py-3 text-right font-medium">Held</th>
              <th className="px-4 py-3 text-right font-medium">Committed</th>
              <th className="px-4 py-3 text-left font-medium">Notes</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-400">
                  Reading Fishbowl and Point B…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-400">
                  {view === "archived"
                    ? "Nothing archived yet."
                    : view === "differences"
                      ? "Every comparable part agrees. Nothing to reconcile."
                      : "Nothing matches that search."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.part} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-gray-900">{r.part}</div>
                  {r.description && (
                    <div className="text-xs text-gray-500">{r.description}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                  {n(r.fishbowl)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                  {n(r.synapse)}
                </td>
                <td className="px-4 py-2.5 text-center text-xs">
                  {editing === r.part ? (
                    <div className="flex items-center justify-center gap-1">
                      <input
                        autoFocus
                        value={draftUom}
                        onChange={(e) => setDraftUom(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveOverride(r.part, { uom: draftUom });
                          if (e.key === "Escape") setEditing(null);
                        }}
                        placeholder={r.synapseUom ?? "EA"}
                        className="w-14 rounded border border-gray-300 px-1 py-0.5 text-center uppercase outline-none focus:border-gray-500"
                      />
                      <button
                        onClick={() => void saveOverride(r.part, { uom: draftUom })}
                        className="text-emerald-600 hover:text-emerald-700"
                        title="Save (Enter). Blank clears the override."
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditing(r.part); setDraftUom(r.fishbowlUom ?? ""); }}
                      title="Click to correct the unit Fishbowl records for this part"
                      className={clsx(
                        "rounded px-1.5 py-0.5 hover:bg-gray-100",
                        r.flags.includes("uom-mismatch") ? "text-blue-700" : "text-gray-400",
                        r.uomOverridden && "underline decoration-dotted",
                      )}
                    >
                      {r.fishbowlUom || r.synapseUom
                        ? r.fishbowlUom === r.synapseUom
                          ? r.fishbowlUom
                          : `${r.fishbowlUom ?? "?"} / ${r.synapseUom ?? "?"}`
                        : "—"}
                    </button>
                  )}
                </td>
                <td
                  className={clsx(
                    "px-4 py-2.5 text-right tabular-nums font-medium",
                    r.variance === null && "text-gray-300",
                    r.variance !== null && r.variance === 0 && "text-gray-400",
                    r.variance !== null && r.variance > 0 && "text-emerald-600",
                    r.variance !== null && r.variance < 0 && "text-red-600",
                  )}
                >
                  {r.variance === null ? "—" : r.variance > 0 ? `+${n(r.variance)}` : n(r.variance)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                  {r.variancePct === null ? "—" : `${r.variancePct > 0 ? "+" : ""}${r.variancePct.toFixed(0)}%`}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                  {r.synapseHeld ? n(r.synapseHeld) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                  {r.synapseCommitted ? n(r.synapseCommitted) : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {r.flags.map((f) => (
                      <span
                        key={f}
                        className={clsx(
                          "rounded border px-1.5 py-0.5 text-[11px]",
                          FLAG_STYLE[f],
                        )}
                      >
                        {FLAG_LABEL[f]}
                      </span>
                    ))}
                    {r.note && <span className="text-[11px] text-gray-400">{r.note}</span>}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => void saveOverride(r.part, { archived: !r.archived })}
                    disabled={saving === r.part}
                    title={r.archived ? "Bring this part back into the report" : "Archive — drops out of the report and its totals"}
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-40"
                  >
                    {r.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Fishbowl is its on-hand for the Point B location group; Point B is physical stock,
        with committed allocations excluded so both sides mean the same thing. A part missing
        from one system shows &ldquo;—&rdquo; rather than 0 — no row and a count of zero are
        different facts. A part the two systems count in different units (Fishbowl in eaches,
        Point B in cases) gets no variance and is left out of the totals: both numbers are
        right, and subtracting one from the other is not. Click a unit to correct what
        Fishbowl records for that part — that only helps where the LABEL was wrong, not
        where the two genuinely pack differently; archive those instead. Archived parts
        leave the report and every total in it.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "plain",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "ok" | "warn";
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div
        className={clsx(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "warn" && "text-amber-600",
          tone === "ok" && "text-emerald-600",
          tone === "plain" && "text-gray-900",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}
