"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, Network, CheckCircle2, XCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { PUSH_LABEL, type PushOwner } from "@/lib/pointbFieldMap";

/**
 * Point B Field Relationships — for a real order, every field Point B returns
 * with its value, the Fishbowl field it maps to, and who pushes it. The live,
 * data-driven version of the field contract (looks like the raw order dump, but
 * annotated). Read-only; data from /api/pointb/relationships.
 */

type Field = {
  field: string;
  value: string | null;
  fishbowl: string | null;
  owner: PushOwner | null;
  note: string | null;
  passthru: boolean;
};
type Rel = {
  so: string;
  customerPO: string;
  connected: boolean;
  found?: boolean;
  orderid?: number;
  lineCount?: number;
  tracking?: string[];
  fields?: Field[];
  fees?: { totalAmount: number; detail: Array<{ code: number; description: string; amount: number }> } | null;
};
type RecentOrder = { num: string; channel: string; status: string; issued: string };
type FieldCheck = {
  connected: boolean;
  sampled?: number;
  feeCodes?: Array<{ code: number; description: string; known: boolean }>;
  unknownCount?: number;
};

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const t = data.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function readJson(r: Response): Promise<Record<string, unknown>> {
  const text = await r.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text.slice(0, 200) };
  }
}

const OWNER_CLS: Record<PushOwner, string> = {
  "connector-out": "bg-sky-50 text-sky-700 ring-sky-200",
  "connector-in": "bg-violet-50 text-violet-700 ring-violet-200",
  human: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  constant: "bg-gray-100 text-gray-500 ring-gray-200",
};
function PushChip({ owner }: { owner: PushOwner }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset whitespace-nowrap ${OWNER_CLS[owner]}`}
    >
      {PUSH_LABEL[owner]}
    </span>
  );
}

export default function RelationshipsPage() {
  const [so, setSo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Rel | null>(null);
  const [recent, setRecent] = useState<RecentOrder[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [fieldCheck, setFieldCheck] = useState<FieldCheck | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/pointb/recent-orders", { headers: await authHeader() });
        const json = await readJson(r);
        const list = (json.orders as RecentOrder[]) ?? [];
        setRecent(list);
        if (list[0]) load(list[0].num);
      } catch {
        /* non-fatal */
      }
    })();
    (async () => {
      try {
        const r = await fetch("/api/pointb/field-check", { headers: await authHeader() });
        const json = await readJson(r);
        if (r.ok) setFieldCheck(json as unknown as FieldCheck);
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  async function load(value: string) {
    const v = value.trim();
    if (!v) return;
    setSo(v);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const r = await fetch(`/api/pointb/relationships?so=${encodeURIComponent(v)}`, {
        headers: await authHeader(),
      });
      const json = await readJson(r);
      if (!r.ok) setError((json.error as string) ?? `Failed (${r.status})`);
      else setData(json as unknown as Rel);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const fields = data?.fields ?? [];
  const shown = showAll ? fields : fields.filter((f) => f.fishbowl != null || (f.value != null && !f.passthru));
  const hidden = fields.length - shown.length;

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1000px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-gray-400 text-xs font-medium">
          <Network size={14} />
          Point B Fields
        </div>
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight mt-1">Field relationships</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          Every field Point B returns for an order, its value, the Fishbowl field it maps to, and who pushes
          it. Pick an order to see the live mapping.
        </p>
      </div>

      {/* Charge-drift banner */}
      {fieldCheck?.connected &&
        (fieldCheck.unknownCount === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 size={15} className="shrink-0" />
            Point B&apos;s charges match the contract — {fieldCheck.feeCodes?.length ?? 0} types, all recognized
            (checked {fieldCheck.sampled} recent orders).
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <div className="flex items-center gap-2 font-medium">
              <XCircle size={15} className="shrink-0" />
              {fieldCheck.unknownCount} new Point B charge type(s) — review the freight mapping.
            </div>
            <div className="text-xs mt-1 font-mono">
              {fieldCheck.feeCodes
                ?.filter((f) => !f.known)
                .map((f) => `${f.code} ${f.description}`)
                .join(", ")}
            </div>
          </div>
        ))}

      {/* Picker */}
      <div className="flex flex-wrap items-center gap-2">
        {recent.length > 0 && (
          <select
            value={so}
            onChange={(e) => e.target.value && load(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          >
            {recent.map((o) => (
              <option key={o.num} value={o.num}>
                {[o.num, o.channel, o.status].filter(Boolean).join("  ·  ")}
              </option>
            ))}
          </select>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(so);
          }}
          className="flex gap-2"
        >
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={so}
              onChange={(e) => setSo(e.target.value)}
              placeholder="…or type any order #"
              className="w-52 rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            View
          </button>
        </form>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {data && data.connected === false && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          Point B isn&apos;t connected in this environment yet — add the Point B credentials to see live fields.
        </div>
      )}

      {data?.found === false && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          Order {data.so} isn&apos;t in Point B yet (it may not have shipped).
        </div>
      )}

      {data?.found && (
        <div className="space-y-4">
          {/* Order summary */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 grid gap-3 sm:grid-cols-4 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-400">Fishbowl SO</div>
              <div className="text-gray-900 font-medium">{data.so}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-400">Warehouse order</div>
              <div className="text-gray-900 font-medium">{data.orderid}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-400">Line items</div>
              <div className="text-gray-900 font-medium">{data.lineCount}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-400">Tracking</div>
              <div className="text-gray-900 font-mono text-xs">{data.tracking?.join(", ") || "—"}</div>
            </div>
          </div>

          {/* Field table */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Fields</h2>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                Show all {hidden > 0 && !showAll ? `(+${hidden} pass-through)` : ""}
              </label>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Point B field</th>
                    <th className="text-left font-medium px-3 py-2">Value</th>
                    <th className="text-left font-medium px-3 py-2">Fishbowl</th>
                    <th className="text-left font-medium px-3 py-2">Push</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {shown.map((f) => (
                    <tr key={f.field} className="align-top">
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-700 whitespace-nowrap">
                        {f.field}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-600 max-w-[220px] truncate">
                        {f.value ?? <span className="text-gray-300">null</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {f.fishbowl ?? <span className="text-gray-300">unmapped</span>}
                        {f.note && <span className="block text-[11px] text-gray-400">{f.note}</span>}
                      </td>
                      <td className="px-3 py-2">{f.owner ? <PushChip owner={f.owner} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fees */}
          {data.fees && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Charges (order/fees → Shipping line × 1.25)</h2>
              <div className="max-w-sm space-y-1">
                {data.fees.detail.map((d) => (
                  <div key={d.code} className="flex justify-between text-xs text-gray-600">
                    <span>
                      {d.description} <span className="text-gray-300">#{d.code}</span>
                    </span>
                    <span>{money(d.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-medium text-gray-900 pt-1 border-t border-gray-100">
                  <span>Total</span>
                  <span>{money(data.fees.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>× 1.25 → Fishbowl shipping line</span>
                  <span>{money(Math.round(data.fees.totalAmount * 1.25 * 100) / 100)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
