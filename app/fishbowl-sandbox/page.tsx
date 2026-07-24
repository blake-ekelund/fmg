"use client";

import { useState } from "react";
import { Loader2, Database, Play, Boxes, AlertTriangle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  SALES_ORDERS_SQL,
  LINE_ITEMS_SQL,
  SHIPMENTS_SQL,
  SHIP_PROBE_HEADER,
  SHIP_PROBE_CARTON,
  SHIP_PROBE_CARRIER,
} from "@/lib/fishbowlQueries";

/**
 * Fishbowl sandbox — an internal scratch page for exploring what the Fishbowl
 * API can pull: live inventory, and arbitrary read-only data-queries (the
 * bridge to your Fishbowl saved views). Throwaway/dev tool — once we settle on
 * the data we want, it graduates into a real feature. Not linked in the nav.
 */

type Rows = Record<string, unknown>[];

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// SO / line-item SQL is shared with the server sync — see lib/fishbowlQueries.ts.
const EXAMPLES: { label: string; sql: string }[] = [
  { label: "Sales orders", sql: SALES_ORDERS_SQL },
  { label: "Line items", sql: LINE_ITEMS_SQL },
  { label: "Open sales orders", sql: "SELECT id, num FROM so WHERE statusId = 1" },
  { label: "Parts (50)", sql: "SELECT id, num, description FROM part ORDER BY num LIMIT 50" },

  /* Shipping/tracking discovery. Tracking numbers are not on `so` — Fishbowl
     keeps them on shipment cartons — so these probe what this instance
     actually exposes before we commit a query to the sync. Run the three
     "probe" entries first; the column names they reveal are what
     SHIPMENTS_SQL needs to be corrected against. */
  { label: "▸ Probe: ship (headers)", sql: SHIP_PROBE_HEADER },
  { label: "▸ Probe: shipcarton (tracking #)", sql: SHIP_PROBE_CARTON },
  { label: "▸ Probe: carrier", sql: SHIP_PROBE_CARRIER },
  { label: "Shipments + tracking (unverified)", sql: SHIPMENTS_SQL },
];

export default function FishbowlSandboxPage() {
  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Fishbowl sandbox</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Scratch page for exploring the Fishbowl API. Each call logs in, runs, and logs out
          (releasing the license seat). Internal/admin only.
        </p>
      </div>

      <InventorySection />
      <QuerySection />
    </div>
  );
}

function InventorySection() {
  const [rows, setRows] = useState<Rows | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/fishbowl/inventory?all=1", { headers: await authHeader() });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      const flat: Rows = (body.results ?? []).map((x: Record<string, unknown>) => ({
        partNumber: x.partNumber,
        description: x.partDescription,
        quantity: x.quantity,
        uom: (x.uom as { abbreviation?: string } | null)?.abbreviation ?? null,
      }));
      setRows(flat);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Live inventory</h2>
          {rows && (
            <span className="text-xs text-gray-400 tabular-nums">{rows.length} parts</span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-3.5 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
          {rows ? "Reload" : "Load inventory"}
        </button>
      </div>
      <ResultArea loading={loading} error={error} rows={rows} />
    </section>
  );
}

function QuerySection() {
  const [sql, setSql] = useState(EXAMPLES[0].sql);
  const [rows, setRows] = useState<Rows | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/fishbowl/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ sql }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      setRows(body.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Database size={16} className="text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900">Data query (SQL)</h2>
        {rows && <span className="text-xs text-gray-400 tabular-nums">{rows.length} rows</span>}
      </div>

      <p className="text-xs text-gray-500">
        Read-only (SELECT / WITH). Paste a Fishbowl saved-query&apos;s SQL, or
        <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-[11px]">SELECT * FROM your_view</code>
        to pull one of your data views.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            onClick={() => setSql(ex.sql)}
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 transition"
          >
            {ex.label}
          </button>
        ))}
      </div>

      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        spellCheck={false}
        rows={4}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-[13px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        placeholder="SELECT ..."
      />

      <div className="flex justify-end">
        <button
          onClick={run}
          disabled={loading || !sql.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-3.5 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          Run query
        </button>
      </div>

      <ResultArea loading={loading} error={error} rows={rows} />
    </section>
  );
}

function ResultArea({
  loading,
  error,
  rows,
}: {
  loading: boolean;
  error: string | null;
  rows: Rows | null;
}) {
  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-gray-400 inline-flex items-center gap-2 justify-center w-full">
        <Loader2 size={14} className="animate-spin" /> Calling Fishbowl…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-sm text-red-700">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <span className="break-all">{error}</span>
      </div>
    );
  }
  if (!rows) return null;
  return <ResultsTable rows={rows} />;
}

const fmtCell = (v: unknown) =>
  v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

function ResultsTable({ rows }: { rows: Rows }) {
  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-400">No rows returned.</div>;
  }
  const cols = Object.keys(rows[0]);
  const shown = rows.slice(0, 1000);
  return (
    <div className="space-y-1.5">
      <div className="overflow-auto rounded-lg border border-gray-200 max-h-[480px]">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wider sticky top-0">
            <tr>
              {cols.map((c) => (
                <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50/50">
                {cols.map((c) => (
                  <td key={c} className="px-3 py-1.5 whitespace-nowrap text-gray-700 tabular-nums">
                    {fmtCell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && (
        <div className="text-[11px] text-gray-400">
          Showing first {shown.length.toLocaleString()} of {rows.length.toLocaleString()} rows.
        </div>
      )}
    </div>
  );
}
