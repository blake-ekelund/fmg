"use client";

import { useState } from "react";
import { Loader2, Database, Play, Boxes, AlertTriangle, Send } from "lucide-react";
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
  {
    label: "All SKUs (parts + UPC)",
    sql: "SELECT part.num AS sku, part.description, part.upc, part.activeFlag AS active FROM part ORDER BY part.num",
  },

  /* Shipping/tracking discovery. Tracking numbers are not on `so` — Fishbowl
     keeps them on shipment cartons — so these probe what this instance
     actually exposes before we commit a query to the sync. Run the three
     "probe" entries first; the column names they reveal are what
     SHIPMENTS_SQL needs to be corrected against. */
  { label: "▸ Probe: ship (headers)", sql: SHIP_PROBE_HEADER },
  { label: "▸ Probe: shipcarton (tracking #)", sql: SHIP_PROBE_CARTON },
  { label: "▸ Probe: carrier", sql: SHIP_PROBE_CARRIER },
  { label: "Shipments + tracking (unverified)", sql: SHIPMENTS_SQL },
  /* Accounting / QuickBooks. Fishbowl posts to QuickBooks Desktop (QBFC) on a
     nightly 18:00 "Standard Export". `post` is the queue (statusId 10=Entered,
     20=Posted; typeId -> posttype), `accountingexportlog` is the run history.
     Start with "export health" — a run can post most records and still be
     logged as errored, so a red row is not necessarily a full outage.
     NOTE: post.amount is 0 for ALL Payment rows (even posted ones) — the money
     lives in postransaction.amount. Don't read that as a $0-payment bug. */
  {
    label: "▸ Acct: export health",
    sql: `SELECT id, dateExportStart, scheduled,
       CASE WHEN error IS NULL OR error = '' THEN 'OK' ELSE 'ERR' END AS result,
       SUBSTRING(error, 1, 120) AS errorHead
  FROM accountingexportlog
 ORDER BY id DESC
 LIMIT 30`,
  },
  {
    label: "▸ Acct: unposted queue",
    sql: `SELECT poststatus.name AS status, posttype.name AS postType, COUNT(*) AS n,
       MIN(post.dateCreated) AS oldest, MAX(post.dateCreated) AS newest
  FROM post
  JOIN poststatus ON post.statusId = poststatus.id
  JOIN posttype   ON post.typeId   = posttype.id
 GROUP BY poststatus.name, posttype.name
 ORDER BY status, n DESC`,
  },
  {
    label: "▸ Acct: stuck records",
    sql: `SELECT post.id, posttype.name AS postType, post.dateCreated, post.orderId,
       so.num AS soNum, so.dateIssued, so.totalPrice, customer.name AS customer
  FROM post
  JOIN posttype ON post.typeId = posttype.id
  LEFT JOIN so ON post.orderId = so.id
  LEFT JOIN customer ON so.customerId = customer.id
 WHERE post.statusId = 10
   AND post.dateCreated < CURDATE()
 ORDER BY post.dateCreated`,
  },
  {
    label: "▸ Acct: recurring errors",
    sql: `SELECT SUBSTRING(error, 1, 110) AS errorHead, COUNT(*) AS n,
       MIN(dateExportStart) AS firstSeen, MAX(dateExportStart) AS lastSeen
  FROM accountingexportlog
 WHERE error IS NOT NULL AND error <> ''
 GROUP BY errorHead
 ORDER BY n DESC`,
  },
  {
    label: "▸ Acct: QB chart of accounts",
    sql: `SELECT accountNumber, name, typeId, activeFlag, accountingId, dateLastModified
  FROM asaccount
 ORDER BY accountNumber, name`,
  },
  {
    label: "▸ Acct: QB classes",
    sql: `SELECT id, name, accountingId, activeFlag, dateLastModified
  FROM qbclass
 ORDER BY name`,
  },
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

      <ApiSection />
      <InventorySection />
      <QuerySection />
    </div>
  );
}

const EX_PATHS = [
  "/api/export/Sales-Order",
  "/api/sales-orders",
  "/api/sales-orders/1",
  "/api/import/Sales-Order",
];

/** Raw Fishbowl HTTP explorer — hit any endpoint, see status + Allow + body.
 *  Used to discover the sales-order import/export shape. */
function ApiSection() {
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/api/export/Sales-Order");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<{
    status: number;
    ok: boolean;
    allow: string | null;
    body: unknown;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let parsedBody: unknown = undefined;
      if (body.trim()) {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          throw new Error("Body must be valid JSON (or left empty).");
        }
      }
      const r = await fetch("/api/fishbowl/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ method, path, body: parsedBody }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Send size={16} className="text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900">API explorer</h2>
      </div>
      <p className="text-xs text-gray-500">
        Raw Fishbowl HTTP. <span className="font-medium text-gray-700">GET is read-only</span> —
        use it to see an export template or an existing sales order.{" "}
        <span className="text-amber-700">POST/PUT/DELETE will write to the live ERP</span>, so only
        use those deliberately.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {EX_PATHS.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              setMethod("GET");
              setPath(ex);
            }}
            className="rounded-md border border-gray-200 px-2.5 py-1 font-mono text-[11px] text-gray-600 hover:bg-gray-50 transition"
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        >
          {["GET", "POST", "PUT", "DELETE"].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          spellCheck={false}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 font-mono text-[13px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          placeholder="/api/..."
        />
        <button
          onClick={send}
          disabled={loading || !path.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-3.5 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send
        </button>
      </div>

      {method !== "GET" && (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck={false}
          rows={4}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-[13px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          placeholder='Optional JSON body, e.g. [["Header1","Header2"],["v1","v2"]]'
        />
      )}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span
              className={
                "rounded-md px-2 py-0.5 font-semibold tabular-nums " +
                (result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")
              }
            >
              HTTP {result.status}
            </span>
            {result.allow ? (
              <span className="text-gray-500">
                Allow: <span className="font-mono text-gray-700">{result.allow}</span>
              </span>
            ) : null}
          </div>
          <pre className="max-h-[480px] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-[12px] leading-relaxed text-gray-800">
            {JSON.stringify(result.body, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
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
