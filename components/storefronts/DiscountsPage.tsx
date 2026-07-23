"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  DollarSign,
  Download,
  Hash,
  List,
  Loader2,
  Pencil,
  Plus,
  Scissors,
  TicketPercent,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useBrand } from "@/components/BrandContext";

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
  per_customer_limit: number | null;
  unique_codes: boolean;
  created_at: string;
};

type Status = "active" | "scheduled" | "expired" | "paused";

/** Per-code usage rolled up from storefront orders, split by store. */
type Metric = { uses: number; spent: number; discount: number };
type CodeMetrics = { all: Metric; sassy: Metric; ni: Metric };
type Batch = { total: number; redeemed: number };
const ZERO_METRIC: Metric = { uses: 0, spent: 0, discount: 0 };

type SortKey = "code" | "value" | "brand" | "status" | "window" | "uses" | "spent" | "discount";
type SortDir = "asc" | "desc";
const NUMERIC_KEYS = new Set<SortKey>(["value", "uses", "spent", "discount"]);
const STATUS_RANK: Record<Status, number> = { active: 0, scheduled: 1, expired: 2, paused: 3 };

const PAGE_SIZE = 10;

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

const STATUS_CHIP: Record<Status, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  scheduled: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-gray-100 text-gray-500 border-gray-200",
  paused: "bg-gray-100 text-gray-500 border-gray-200",
};

const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  paused: "Paused",
};

function discountLabel(d: Discount): string {
  return d.kind === "percent" ? `${d.value}% off` : `$${d.value.toFixed(2)} off`;
}

function fmtMoney(n: number): string {
  return (
    "$" +
    (n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Effective state, factoring in the active flag AND the date window. */
function statusOf(d: Discount): Status {
  if (!d.active) return "paused";
  const now = Date.now();
  if (d.starts_at && new Date(d.starts_at).getTime() > now) return "scheduled";
  if (d.ends_at && new Date(d.ends_at).getTime() < now) return "expired";
  return "active";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function dateWindowLabel(d: Discount): string {
  if (d.starts_at && d.ends_at) return `${fmtDate(d.starts_at)} – ${fmtDate(d.ends_at)}`;
  if (d.starts_at) return `starts ${fmtDate(d.starts_at)}`;
  if (d.ends_at) return `ends ${fmtDate(d.ends_at)}`;
  return "always on";
}

/** ISO timestamp → yyyy-mm-dd for an <input type="date">, in local time. */
function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** yyyy-mm-dd → ISO at the START of that day, in the admin's local time. */
function startOfDayIso(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** yyyy-mm-dd → ISO at the END of that day, so "ends Jul 31" stays valid all day. */
function endOfDayIso(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function DiscountsPage() {
  const { brand: storeFilter } = useBrand(); // global toggle in the top bar: "all" | "Sassy" | "NI"
  const storeKey: keyof CodeMetrics =
    storeFilter === "Sassy" ? "sassy" : storeFilter === "NI" ? "ni" : "all";

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [metrics, setMetrics] = useState<Record<string, CodeMetrics>>({});
  const [batches, setBatches] = useState<Record<string, Batch>>({});
  const [ordersConnected, setOrdersConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [codesFor, setCodesFor] = useState<Discount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Discount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Table controls
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  // Create / edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [brand, setBrand] = useState<Discount["brand"]>("both");
  const [kind, setKind] = useState<Discount["kind"]>("percent");
  const [value, setValue] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");
  const [perCustomerLimit, setPerCustomerLimit] = useState("");
  const [uniqueCodes, setUniqueCodes] = useState(false);
  const [genCount, setGenCount] = useState("");
  const [saving, setSaving] = useState(false);
  /* Save failures render inside the dialog — the page-level banner sits behind
     the overlay, so routing form errors there would hide them. */
  const [formError, setFormError] = useState<string | null>(null);

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
      setMetrics((json.metrics as Record<string, CodeMetrics>) ?? {});
      setBatches((json.batches as Record<string, Batch>) ?? {});
      setOrdersConnected(!!json.ordersConnected);
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

  // The store toggle changes which codes show — go back to the first page.
  useEffect(() => {
    setPage(0);
  }, [storeFilter]);

  const metricFor = useCallback(
    (d: Discount): Metric => {
      // A unique-code batch is "used" by redeeming a generated code; uses come
      // from the batch's redeemed count, not from shared-code order matching.
      if (d.unique_codes) {
        return { uses: batches[d.id]?.redeemed ?? 0, spent: 0, discount: 0 };
      }
      return metrics[d.code.toUpperCase()]?.[storeKey] ?? ZERO_METRIC;
    },
    [metrics, batches, storeKey]
  );

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(NUMERIC_KEYS.has(key) ? "desc" : "asc");
    }
  }

  // Filter by the global store toggle: a "both"-brand code applies to either store.
  const filtered = useMemo(() => {
    const rows = discounts.filter((d) => {
      if (storeFilter === "Sassy") return d.brand === "Sassy" || d.brand === "both";
      if (storeFilter === "NI") return d.brand === "NI" || d.brand === "both";
      return true;
    });

    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      const startMs = (d: Discount) => new Date(d.starts_at ?? d.created_at).getTime();
      rows.sort((a, b) => {
        let c = 0;
        switch (sortKey) {
          case "code":
            c = a.code.localeCompare(b.code);
            break;
          case "value":
            c = a.value - b.value;
            break;
          case "brand":
            c = a.brand.localeCompare(b.brand);
            break;
          case "status":
            c = STATUS_RANK[statusOf(a)] - STATUS_RANK[statusOf(b)];
            break;
          case "window":
            c = startMs(a) - startMs(b);
            break;
          case "uses":
            c = metricFor(a).uses - metricFor(b).uses;
            break;
          case "spent":
            c = metricFor(a).spent - metricFor(b).spent;
            break;
          case "discount":
            c = metricFor(a).discount - metricFor(b).discount;
            break;
        }
        return dir * c;
      });
    }
    return rows;
  }, [discounts, storeFilter, sortKey, sortDir, metricFor]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, d) => {
        const m = metricFor(d);
        acc.uses += m.uses;
        acc.spent += m.spent;
        acc.discount += m.discount;
        if (statusOf(d) === "active") acc.active += 1;
        return acc;
      },
      { uses: 0, spent: 0, discount: 0, active: 0 }
    );
  }, [filtered, metricFor]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  /* Stable identities so the dialog's Escape-key effect doesn't re-subscribe
     on every render. Every setter here is already stable. */
  const resetForm = useCallback(() => {
    setEditingId(null);
    setCode("");
    setBrand("both");
    setKind("percent");
    setValue("");
    setMinSubtotal("");
    setStartsAt("");
    setEndsAt("");
    setNote("");
    setPerCustomerLimit("");
    setUniqueCodes(false);
    setGenCount("");
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setFormError(null);
    resetForm();
  }, [resetForm]);

  function toggleForm() {
    if (showForm) {
      closeForm();
    } else {
      resetForm();
      setFormError(null);
      setShowForm(true);
    }
  }

  /* Dialog behaviour: Escape closes, and the page behind stops scrolling.
     Both are suppressed mid-save so a stray keypress can't strand a request. */
  useEffect(() => {
    if (!showForm) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) closeForm();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [showForm, saving, closeForm]);

  function beginEdit(d: Discount) {
    setEditingId(d.id);
    setCode(d.code);
    setBrand(d.brand);
    setKind(d.kind);
    setValue(String(d.value));
    setMinSubtotal(d.min_subtotal != null ? String(d.min_subtotal) : "");
    setStartsAt(isoToDateInput(d.starts_at));
    setEndsAt(isoToDateInput(d.ends_at));
    setNote(d.note ?? "");
    setPerCustomerLimit(d.per_customer_limit != null ? String(d.per_customer_limit) : "");
    setUniqueCodes(d.unique_codes);
    setGenCount("");
    setError(null);
    setFormError(null);
    setShowForm(true);
  }

  async function submitForm() {
    // Friendly guard: an end date before the start date is almost always a typo.
    if (startsAt && endsAt && endsAt < startsAt) {
      setFormError("The end date can't be before the start date.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        code,
        brand,
        kind,
        value: Number(value),
        min_subtotal: minSubtotal ? Number(minSubtotal) : null,
        starts_at: startOfDayIso(startsAt),
        ends_at: endOfDayIso(endsAt),
        note: note || null,
        per_customer_limit: perCustomerLimit ? Number(perCustomerLimit) : null,
        unique_codes: uniqueCodes,
      };

      const res = await fetch("/api/storefront-discounts", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json?.error ?? `Failed (${res.status})`);
        return;
      }

      const saved = json.discount as Discount;

      // Brand-new unique-code batch → generate the requested codes immediately.
      if (!editingId && uniqueCodes && Number(genCount) > 0) {
        const genRes = await fetch("/api/storefront-discounts/codes", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({
            discountId: saved.id,
            count: Number(genCount),
            prefix: saved.code,
          }),
        });
        if (!genRes.ok) {
          const gj = await genRes.json().catch(() => null);
          setError(gj?.error ?? "Codes couldn't be generated — open the batch to retry.");
        }
        await reload();
      } else {
        setDiscounts((prev) =>
          editingId
            ? prev.map((x) => (x.id === saved.id ? saved : x))
            : [saved, ...prev]
        );
        setError(null);
      }
      closeForm();
    } finally {
      setSaving(false);
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

  function askDelete(d: Discount) {
    setDeleteError(null);
    setDeleteTarget(d);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const d = deleteTarget;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/storefront-discounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ id: d.id }),
      });
      if (res.ok) {
        setDiscounts((prev) => prev.filter((x) => x.id !== d.id));
        if (editingId === d.id) closeForm();
        if (codesFor?.id === d.id) setCodesFor(null);
        setDeleteTarget(null);
      } else {
        const json = await res.json().catch(() => null);
        setDeleteError(json?.error ?? `Failed (${res.status})`);
      }
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  const hasRedemptions = totals.uses > 0;

  function SortHeader({
    label,
    sortKey: key,
    numeric,
  }: {
    label: string;
    sortKey: SortKey;
    numeric?: boolean;
  }) {
    const active = sortKey === key;
    return (
      <th
        scope="col"
        className={clsx(
          "px-3 py-2.5 text-xs font-medium text-gray-500",
          numeric ? "text-right" : "text-left"
        )}
      >
        <button
          type="button"
          onClick={() => onSort(key)}
          className={clsx(
            "inline-flex items-center gap-1 transition hover:text-gray-900",
            numeric && "flex-row-reverse",
            active && "text-gray-900"
          )}
        >
          {label}
          {active ? (
            sortDir === "asc" ? (
              <ChevronUp size={12} />
            ) : (
              <ChevronDown size={12} />
            )
          ) : null}
        </button>
      </th>
    );
  }

  const SUMMARY = [
    { label: "Active codes", value: String(totals.active), icon: BadgeCheck, tint: "text-green-600 bg-green-50" },
    { label: "Uses", value: totals.uses.toLocaleString(), icon: Hash, tint: "text-violet-600 bg-violet-50" },
    { label: "Spent", value: fmtMoney(totals.spent), icon: DollarSign, tint: "text-emerald-600 bg-emerald-50" },
    { label: "Discount given", value: fmtMoney(totals.discount), icon: Scissors, tint: "text-amber-600 bg-amber-50" },
  ];

  return (
    <div className="w-full space-y-6 p-6 md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-500">
          Codes for the Sassy and Natural Inspirations storefronts.
          Checkout reads only active codes inside their date window.
        </p>
        <button
          type="button"
          onClick={toggleForm}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          <Plus size={14} /> New code
        </button>
      </div>

      {needsMigration ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            One step to activate: the discounts tables ship with the pending
            database migrations — run{" "}
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
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:items-center"
          onClick={() => {
            if (!saving) closeForm();
          }}
        >
          <div
            className="my-auto w-full max-w-3xl rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={editingId ? "Edit discount code" : "New discount code"}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-gray-900">
                {editingId ? "Edit discount code" : "New discount code"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                aria-label="Close"
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body — scrolls independently so the footer stays reachable
                on short screens. */}
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500">
                    {uniqueCodes ? "Batch name (prefix)" : "Code"}
                  </label>
                  <input
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder={uniqueCodes ? "INFLUENCER" : "GLOWUP15"}
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
                        {b === "both" ? "Both" : b}
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
                    Starts (optional)
                  </label>
                  <input
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500">
                    Ends (optional)
                  </label>
                  <input
                    type="date"
                    value={endsAt}
                    min={startsAt || undefined}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500">
                    Max uses per customer (optional)
                  </label>
                  <input
                    value={perCustomerLimit}
                    onChange={(e) => setPerCustomerLimit(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="Unlimited"
                    inputMode="numeric"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
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

              {/* Unique single-use code batch (only when creating) */}
              {!editingId ? (
                <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={uniqueCodes}
                      onChange={(e) => setUniqueCodes(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
                    />
                    Unique one-time codes — generate a batch of single-use codes
                  </label>
                  {uniqueCodes ? (
                    <div className="mt-3 flex flex-wrap items-end gap-3 pl-6">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500">
                          How many to generate
                        </label>
                        <input
                          value={genCount}
                          onChange={(e) => setGenCount(e.target.value.replace(/[^\d]/g, ""))}
                          placeholder="100"
                          inputMode="numeric"
                          className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-gray-300"
                        />
                      </div>
                      <p className="max-w-md text-xs text-gray-400">
                        Each shopper gets a one-time code like{" "}
                        <code className="rounded bg-gray-100 px-1 py-0.5">
                          {(code || "SAVE")}-7K2QX9
                        </code>
                        . The amount/dates above apply to the whole batch. You can
                        generate more later.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <p className="mt-3 text-xs text-gray-400">
                Leave the dates blank for an always-on code. Dates follow your local
                day — a start applies from midnight, an end lasts through the whole day.
              </p>

              {formError ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {formError}
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!code.trim() || !value || saving}
                onClick={submitForm}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : null}
                {editingId ? "Save changes" : uniqueCodes ? "Create batch" : "Create code"}
              </button>
            </div>
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
            order, so that&apos;s a natural first one.
          </p>
        </div>
      ) : discounts.length > 0 ? (
        <div className="space-y-4">
          {/* Summary totals — scoped to the store toggle in the top bar */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {SUMMARY.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3"
              >
                <div className={clsx("flex h-9 w-9 items-center justify-center rounded-lg", s.tint)}>
                  <s.icon size={16} />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 tabular-nums">{s.value}</div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-gray-100 bg-gray-50/70">
                <tr>
                  <SortHeader label="Code" sortKey="code" />
                  <SortHeader label="Discount" sortKey="value" />
                  <SortHeader label="Brand" sortKey="brand" />
                  <SortHeader label="Status" sortKey="status" />
                  <SortHeader label="Window" sortKey="window" />
                  <SortHeader label="Uses" sortKey="uses" numeric />
                  <SortHeader label="Spent" sortKey="spent" numeric />
                  <SortHeader label="Discount given" sortKey="discount" numeric />
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-sm text-gray-400">
                      No codes for this store.
                    </td>
                  </tr>
                ) : (
                  paged.map((d) => {
                    const status = statusOf(d);
                    const m = metricFor(d);
                    const batch = batches[d.id];
                    return (
                      <tr
                        key={d.id}
                        className="border-b border-gray-50 transition last:border-0 hover:bg-gray-50/60"
                      >
                        <td className="px-3 py-3 align-top">
                          <div className="flex items-center gap-2">
                            <code className="rounded-md bg-gray-900 px-2 py-1 font-mono text-xs font-semibold tracking-wide text-white">
                              {d.code}
                            </code>
                            {d.unique_codes ? (
                              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                                Unique
                              </span>
                            ) : null}
                          </div>
                          {d.note ? (
                            <div className="mt-1 max-w-[200px] truncate text-[11px] text-gray-400" title={d.note}>
                              {d.note}
                            </div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-medium text-gray-900">
                          {discountLabel(d)}
                          {d.min_subtotal ? (
                            <span className="ml-1 text-[11px] font-normal text-gray-400">
                              min ${d.min_subtotal}
                            </span>
                          ) : null}
                          {d.per_customer_limit ? (
                            <span className="ml-1 text-[11px] font-normal text-gray-400">
                              · {d.per_customer_limit}/customer
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={clsx(
                              "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              BRAND_CHIP[d.brand]
                            )}
                          >
                            {d.brand === "both" ? "Both" : d.brand}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={clsx(
                              "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              STATUS_CHIP[status]
                            )}
                          >
                            {STATUS_LABEL[status]}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-500">
                          {dateWindowLabel(d)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                          {d.unique_codes ? (
                            <span title="redeemed / generated">
                              {m.uses}
                              <span className="text-gray-300">/{batch?.total ?? 0}</span>
                            </span>
                          ) : m.uses > 0 ? (
                            m.uses.toLocaleString()
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                          {!d.unique_codes && m.uses > 0 ? (
                            fmtMoney(m.spent)
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                          {!d.unique_codes && m.uses > 0 ? (
                            fmtMoney(m.discount)
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {busyId === d.id ? (
                              <Loader2 size={15} className="animate-spin text-gray-400" />
                            ) : (
                              <>
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={d.active}
                                  onClick={() => toggleActive(d)}
                                  title={d.active ? "Active — click to pause" : "Paused — click to activate"}
                                  className={clsx(
                                    "flex h-5 w-5 items-center justify-center rounded-md border transition",
                                    d.active
                                      ? "border-brand-700 bg-brand-700 text-white"
                                      : "border-gray-300 bg-white text-transparent hover:border-gray-400"
                                  )}
                                >
                                  <Check size={13} strokeWidth={3} />
                                </button>
                                {d.unique_codes ? (
                                  <button
                                    type="button"
                                    onClick={() => setCodesFor(d)}
                                    className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                                    aria-label={`manage codes for ${d.code}`}
                                    title="Manage codes"
                                  >
                                    <List size={14} />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => beginEdit(d)}
                                  className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                                  aria-label={`edit ${d.code}`}
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => askDelete(d)}
                                  className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                                  aria-label={`delete ${d.code}`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filtered.length > 0 ? (
                <tfoot className="border-t border-gray-200 bg-gray-50/70">
                  <tr className="text-xs font-medium text-gray-600">
                    <td className="px-3 py-2.5" colSpan={5}>
                      Totals · {filtered.length} {filtered.length === 1 ? "code" : "codes"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {totals.uses.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(totals.spent)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(totals.discount)}</td>
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE ? (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                Showing {clampedPage * PAGE_SIZE + 1}–
                {Math.min((clampedPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(clampedPage - 1)}
                  disabled={clampedPage === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="tabular-nums">
                  Page {clampedPage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(clampedPage + 1)}
                  disabled={clampedPage >= pageCount - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ) : null}

          {!hasRedemptions ? (
            <p className="text-xs text-gray-400">
              {ordersConnected
                ? "Uses, spend, and discount given populate from storefront orders that recorded the code — they fill in once the cart applies these codes at checkout."
                : "Usage metrics read from the storefront orders table once it's connected; they'll populate after the cart starts applying codes at checkout."}
            </p>
          ) : null}
        </div>
      ) : null}

      {codesFor ? (
        <CodesModal
          discount={codesFor}
          onClose={() => setCodesFor(null)}
          onChanged={reload}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteDiscountModal
          discount={deleteTarget}
          batch={batches[deleteTarget.id]}
          uses={metrics[deleteTarget.code.toUpperCase()]?.all.uses ?? 0}
          deleting={deleting}
          error={deleteError}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}

function DeleteDiscountModal({
  discount,
  batch,
  uses,
  deleting,
  error,
  onCancel,
  onConfirm,
}: {
  discount: Discount;
  batch: Batch | undefined;
  uses: number;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deleting, onCancel]);

  const isBatch = discount.unique_codes;
  const total = batch?.total ?? 0;
  const redeemed = batch?.redeemed ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={() => {
        if (!deleting) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <Trash2 size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Delete {isBatch ? "code batch" : "discount code"}?
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-gray-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">
                {discount.code}
              </code>
              <span className="text-xs text-gray-500">
                {discountLabel(discount)} · {discount.brand === "both" ? "Both brands" : discount.brand}
              </span>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Shoppers will no longer be able to use{" "}
              {isBatch ? "any code in this batch" : "this code"}. This can&apos;t be undone.
            </p>

            {isBatch && total > 0 ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Removes all {total.toLocaleString()} generated codes
                {redeemed > 0 ? `, including ${redeemed.toLocaleString()} already redeemed` : ""}.
              </div>
            ) : null}

            {!isBatch && uses > 0 ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                This code has been used {uses.toLocaleString()} {uses === 1 ? "time" : "times"}.
                Past orders keep their discount — you&apos;re only removing the code itself.
              </div>
            ) : null}

            {error ? (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete {isBatch ? "batch" : "code"}
          </button>
        </div>
      </div>
    </div>
  );
}

type CodeRow = {
  id: string;
  code: string;
  redeemed_at: string | null;
  order_id: string | null;
};

function CodesModal({
  discount,
  onClose,
  onChanged,
}: {
  discount: Discount;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [genCount, setGenCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/storefront-discounts/codes?discountId=${discount.id}`,
        { headers: await authHeader() }
      );
      const json = await res.json();
      if (res.ok) {
        setCodes((json.codes as CodeRow[]) ?? []);
        setErr(null);
      } else {
        setErr(json?.error ?? "Failed to load codes");
      }
    } finally {
      setLoading(false);
    }
  }, [discount.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    const n = Number(genCount);
    if (!Number.isFinite(n) || n <= 0) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/storefront-discounts/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ discountId: discount.id, count: n, prefix: discount.code }),
      });
      const json = await res.json();
      if (res.ok) {
        setGenCount("");
        await load();
        onChanged();
      } else {
        setErr(json?.error ?? "Generation failed");
      }
    } finally {
      setBusy(false);
    }
  }

  const available = codes.filter((c) => !c.redeemed_at);
  const redeemed = codes.length - available.length;

  function copyAvailable() {
    navigator.clipboard.writeText(available.map((c) => c.code).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadCsv() {
    const rows = [
      ["code", "status", "redeemed_at", "order_id"],
      ...codes.map((c) => [
        c.code,
        c.redeemed_at ? "redeemed" : "available",
        c.redeemed_at ?? "",
        c.order_id ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${discount.code}-codes.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Codes · <span className="font-mono">{discount.code}</span>
            </h3>
            <p className="text-xs text-gray-400">
              {codes.length} generated · {redeemed} redeemed · {available.length} available
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={copyAvailable}
            disabled={available.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy size={13} /> {copied ? "Copied!" : "Copy available"}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={codes.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={13} /> Download CSV
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <input
              value={genCount}
              onChange={(e) => setGenCount(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="50"
              inputMode="numeric"
              className="w-20 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
            <button
              type="button"
              onClick={generate}
              disabled={busy || !genCount}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Generate
            </button>
          </div>
        </div>

        {err ? (
          <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-600">{err}</div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-gray-400">
              <Loader2 size={15} className="animate-spin" /> Loading codes…
            </div>
          ) : codes.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No codes yet — generate a batch above.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {codes.map((c) => (
                <div
                  key={c.id}
                  className={clsx(
                    "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-xs",
                    c.redeemed_at
                      ? "border-gray-100 bg-gray-50 text-gray-400 line-through"
                      : "border-gray-200 text-gray-700"
                  )}
                >
                  <span className="truncate">{c.code}</span>
                  {c.redeemed_at ? (
                    <span className="shrink-0 not-italic no-underline text-[10px] text-gray-400">
                      used
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
