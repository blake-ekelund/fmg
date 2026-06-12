"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Plus,
  TicketPercent,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Discount = {
  id: string;
  code: string;
  brand: "Sassy" | "NI" | "both";
  kind: "percent" | "fixed";
  value: number;
  min_subtotal: number | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
};

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const BRAND_CHIP: Record<Discount["brand"], string> = {
  Sassy: "bg-pink-50 text-pink-700 border-pink-200",
  NI: "bg-blue-50 text-blue-700 border-blue-200",
  both: "bg-gray-100 text-gray-600 border-gray-200",
};

function discountLabel(d: Discount): string {
  return d.kind === "percent" ? `${d.value}% off` : `$${d.value.toFixed(2)} off`;
}

export default function DiscountsPage() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [brand, setBrand] = useState<Discount["brand"]>("both");
  const [kind, setKind] = useState<Discount["kind"]>("percent");
  const [value, setValue] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/storefront-discounts", {
        headers: await authHeader(),
      });
      const json = await res.json();
      if (!res.ok) {
        setNeedsMigration(!!json?.needsMigration);
        setError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setError(null);
      setNeedsMigration(false);
      setDiscounts(json.discounts as Discount[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  async function createDiscount() {
    setCreating(true);
    try {
      const res = await fetch("/api/storefront-discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          code,
          brand,
          kind,
          value: Number(value),
          min_subtotal: minSubtotal ? Number(minSubtotal) : null,
          ends_at: endsAt ? new Date(endsAt).toISOString() : null,
          note: note || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setDiscounts((prev) => [json.discount as Discount, ...prev]);
      setShowForm(false);
      setCode("");
      setValue("");
      setMinSubtotal("");
      setEndsAt("");
      setNote("");
      setError(null);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(d: Discount) {
    setBusyId(d.id);
    try {
      const res = await fetch("/api/storefront-discounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ id: d.id, active: !d.active }),
      });
      const json = await res.json();
      if (res.ok) {
        setDiscounts((prev) =>
          prev.map((x) => (x.id === d.id ? (json.discount as Discount) : x))
        );
      } else {
        setError(json?.error ?? `Failed (${res.status})`);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function remove(d: Discount) {
    if (!confirm(`Delete code ${d.code}? Shoppers will no longer be able to use it.`)) return;
    setBusyId(d.id);
    try {
      const res = await fetch("/api/storefront-discounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ id: d.id }),
      });
      if (res.ok) {
        setDiscounts((prev) => prev.filter((x) => x.id !== d.id));
      } else {
        const json = await res.json();
        setError(json?.error ?? `Failed (${res.status})`);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Discounts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Codes for the Sassy and Natural Inspirations storefronts.
            Checkout reads only active codes inside their date window.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          <Plus size={14} /> New code
        </button>
      </div>

      {needsMigration ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            One step to activate: the discounts table ships with the pending
            database migration — run{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[12px]">
              npx supabase db push
            </code>{" "}
            from the fmg folder, then refresh.
          </span>
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {showForm ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-medium text-gray-900">New discount code</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">Code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="GLOWUP15"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">Brand</label>
              <div className="flex gap-1.5">
                {(["Sassy", "NI", "both"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBrand(b)}
                    className={clsx(
                      "flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition",
                      brand === b
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">Amount</label>
              <div className="flex gap-1.5">
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as Discount["kind"])}
                  className="rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  <option value="percent">% off</option>
                  <option value="fixed">$ off</option>
                </select>
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder={kind === "percent" ? "15" : "10.00"}
                  inputMode="decimal"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">
                Minimum subtotal (optional)
              </label>
              <input
                value={minSubtotal}
                onChange={(e) =>
                  setMinSubtotal(e.target.value.replace(/[^\d.]/g, ""))
                }
                placeholder="50"
                inputMode="decimal"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">
                Ends (optional)
              </label>
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">
                Internal note (optional)
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="newsletter welcome offer"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!code.trim() || !value || creating}
              onClick={createDiscount}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : null}
              Create code
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 size={15} className="animate-spin" /> Loading discounts…
        </div>
      ) : discounts.length === 0 && !needsMigration ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-5 py-10 text-center">
          <TicketPercent size={22} className="mx-auto text-gray-300" />
          <p className="mt-2 text-sm text-gray-400">
            No codes yet — the sassy newsletter promises 15% off the first
            order, so that's a natural first one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {discounts.map((d) => (
            <div
              key={d.id}
              className={clsx(
                "flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-5 py-4",
                d.active ? "border-gray-200" : "border-gray-200 opacity-60"
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <code className="rounded-lg bg-gray-900 px-2.5 py-1 font-mono text-sm font-semibold tracking-wide text-white">
                  {d.code}
                </code>
                <span className="text-sm font-medium text-gray-900">
                  {discountLabel(d)}
                </span>
                <span
                  className={clsx(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    BRAND_CHIP[d.brand]
                  )}
                >
                  {d.brand === "both" ? "Both brands" : d.brand}
                </span>
                <span className="text-xs text-gray-400">
                  {[
                    d.min_subtotal ? `min $${d.min_subtotal}` : null,
                    d.ends_at
                      ? `ends ${new Date(d.ends_at).toLocaleDateString()}`
                      : "no end date",
                    d.note,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {busyId === d.id ? (
                  <Loader2 size={15} className="animate-spin text-gray-400" />
                ) : (
                  <>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={d.active}
                      onClick={() => toggleActive(d)}
                      className={clsx(
                        "relative h-5 w-9 rounded-full transition-colors",
                        d.active ? "bg-green-500" : "bg-gray-300"
                      )}
                      title={d.active ? "Active — click to pause" : "Paused — click to activate"}
                    >
                      <span
                        className={clsx(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                          d.active ? "translate-x-[18px]" : "translate-x-0.5"
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(d)}
                      className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`delete ${d.code}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
