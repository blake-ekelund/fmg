"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Clock,
  Loader2,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useTeamOwners } from "@/lib/team-owners";
import type { PartnerProfile, PartnerStatus } from "@/lib/wholesalePortal";

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const STATUS_META: Record<
  PartnerStatus,
  { label: string; chip: string; Icon: typeof Clock }
> = {
  pending: {
    label: "Pending",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: Clock,
  },
  approved: {
    label: "Approved",
    chip: "bg-green-50 text-green-700 border-green-200",
    Icon: BadgeCheck,
  },
  denied: {
    label: "Denied",
    chip: "bg-red-50 text-red-700 border-red-200",
    Icon: X,
  },
};

type StatusFilter = "all" | PartnerStatus;
type RepFilter = "all" | "unassigned" | string;

const STATUS_RANK: Record<PartnerStatus, number> = {
  pending: 0,
  approved: 1,
  denied: 2,
};

export default function PartnersPage() {
  const [partners, setPartners] = useState<PartnerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [repFilter, setRepFilter] = useState<RepFilter>("all");
  const [storeFilter, setStoreFilter] = useState<"all" | "sassy" | "ni">("all");

  const { owners } = useTeamOwners();

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/partners", { headers: await authHeader() });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setError(null);
      setPartners(json.partners as PartnerProfile[]);
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

  async function patchPartner(
    id: string,
    patch: { status?: PartnerStatus; sales_rep?: string | null }
  ) {
    setBusyId(id);
    try {
      const res = await fetch("/api/partners", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeader()),
        },
        body: JSON.stringify({ id, ...patch }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setError(null);
      setPartners((prev) =>
        prev.map((p) => (p.id === id ? (json.partner as PartnerProfile) : p))
      );
    } finally {
      setBusyId(null);
    }
  }

  /* Rep options: the FMG team roster plus any rep value already stored
     (so legacy/renamed assignments stay selectable). */
  const repOptions = useMemo(() => {
    const assigned = partners
      .map((p) => p.sales_rep?.trim())
      .filter((r): r is string => !!r);
    return Array.from(new Set([...owners, ...assigned])).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [owners, partners]);

  const counts = useMemo(() => {
    const c = { all: partners.length, pending: 0, approved: 0, denied: 0 };
    for (const p of partners) c[p.wholesale_status]++;
    return c;
  }, [partners]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return partners
      .filter((p) => {
        if (statusFilter !== "all" && p.wholesale_status !== statusFilter)
          return false;
        if (storeFilter !== "all" && p.signup_store !== storeFilter)
          return false;
        if (repFilter === "unassigned" && p.sales_rep?.trim()) return false;
        if (
          repFilter !== "all" &&
          repFilter !== "unassigned" &&
          (p.sales_rep ?? "").trim().toLowerCase() !== repFilter.toLowerCase()
        )
          return false;
        if (q) {
          const hay = [
            p.business_name,
            p.contact_name,
            p.email,
            p.phone,
            p.website,
            p.business_type,
            p.sales_rep,
            p.signup_store,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort(
        // Review queue first, newest within each status.
        (a, b) =>
          STATUS_RANK[a.wholesale_status] - STATUS_RANK[b.wholesale_status] ||
          (b.created_at ?? "").localeCompare(a.created_at ?? "")
      );
  }, [partners, query, statusFilter, repFilter, storeFilter]);

  const statusPills: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "pending", label: "Pending", count: counts.pending },
    { value: "approved", label: "Approved", count: counts.approved },
    { value: "denied", label: "Denied", count: counts.denied },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Partners</h1>
        <p className="mt-1 text-sm text-gray-500">
          Wholesale accounts from the storefronts. New signups order at case
          pricing immediately — approving confirms them, denying pauses their
          wholesale access on next page load.
        </p>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-[300px] flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search business, contact, email…"
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
          {statusPills.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={clsx(
                "rounded-md px-2.5 py-1.5 font-medium transition",
                statusFilter === s.value
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900"
              )}
            >
              {s.label} ({s.count})
            </button>
          ))}
        </div>

        <select
          value={storeFilter}
          onChange={(e) =>
            setStoreFilter(e.target.value as "all" | "sassy" | "ni")
          }
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300"
          title="Filter by signup store"
        >
          <option value="all">All stores</option>
          <option value="sassy">Sassy (sassyandco.com)</option>
          <option value="ni">NI (naturalinspirations)</option>
        </select>

        <select
          value={repFilter}
          onChange={(e) => setRepFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300"
          title="Filter by sales rep"
        >
          <option value="all">All reps</option>
          <option value="unassigned">Unassigned</option>
          {repOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <span className="ml-auto text-xs text-gray-400 tabular-nums">
          {filtered.length} of {partners.length}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 size={15} className="animate-spin" /> Loading partners…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                <th className="px-3 py-2 text-left font-medium">Business</th>
                <th className="px-3 py-2 text-left font-medium">Store</th>
                <th className="px-3 py-2 text-left font-medium">Contact</th>
                <th className="px-3 py-2 text-left font-medium">Details</th>
                <th className="px-3 py-2 text-left font-medium">Sales rep</th>
                <th className="px-3 py-2 text-left font-medium">Applied</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm text-gray-400"
                  >
                    {partners.length === 0
                      ? "No partner accounts yet — new signups show up here automatically."
                      : "Nothing matches the current filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((p, idx) => (
                  <PartnerRow
                    key={p.id}
                    partner={p}
                    last={idx === filtered.length - 1}
                    busy={busyId === p.id}
                    repOptions={repOptions}
                    onPatch={patchPartner}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PartnerRow({
  partner: p,
  last,
  busy,
  repOptions,
  onPatch,
}: {
  partner: PartnerProfile;
  last: boolean;
  busy: boolean;
  repOptions: string[];
  onPatch: (
    id: string,
    patch: { status?: PartnerStatus; sales_rep?: string | null }
  ) => void;
}) {
  const meta = STATUS_META[p.wholesale_status];
  const applied = p.created_at
    ? new Date(p.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
  const details = [p.business_type, p.expected_monthly_volume]
    .filter(Boolean)
    .join(" · ");
  const rep = p.sales_rep?.trim() ?? "";

  return (
    <tr
      className={clsx(
        "align-top transition-colors hover:bg-gray-50",
        !last && "border-b border-gray-50",
        busy && "opacity-60"
      )}
    >
      <td className="px-3 py-2.5">
        <div className="font-semibold text-gray-900">{p.business_name}</div>
        {p.website ? (
          <div className="mt-0.5 max-w-[160px] truncate text-gray-400">
            {p.website}
          </div>
        ) : null}
      </td>
      <td className="px-3 py-2.5">
        {p.signup_store === "sassy" ? (
          <span className="inline-flex rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-medium text-pink-700">
            Sassy
          </span>
        ) : p.signup_store === "ni" ? (
          <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
            NI
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="text-gray-900">{p.contact_name}</div>
        <a
          href={`mailto:${p.email}`}
          className="mt-0.5 block max-w-[200px] truncate text-gray-500 hover:text-gray-900 hover:underline"
        >
          {p.email}
        </a>
        {p.phone ? <div className="mt-0.5 text-gray-400">{p.phone}</div> : null}
      </td>
      <td className="px-3 py-2.5 text-gray-500">
        <div className="max-w-[180px]">{details || "—"}</div>
        <div className="mt-0.5 text-gray-400">
          {p.tax_id ? `Tax ID ${p.tax_id}` : "No tax ID yet"}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <select
          value={rep}
          disabled={busy}
          onChange={(e) => onPatch(p.id, { sales_rep: e.target.value || null })}
          className={clsx(
            "w-full max-w-[140px] rounded-lg border bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-300",
            rep
              ? "border-gray-200 font-medium text-gray-900"
              : "border-dashed border-gray-300 text-gray-400"
          )}
        >
          <option value="">Unassigned</option>
          {repOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-gray-500 tabular-nums">
        {applied}
      </td>
      <td className="px-3 py-2.5">
        <span
          className={clsx(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            meta.chip
          )}
        >
          <meta.Icon size={11} />
          {meta.label}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          {busy ? (
            <Loader2 size={14} className="animate-spin text-gray-400" />
          ) : p.wholesale_status === "pending" ? (
            <>
              <button
                type="button"
                onClick={() => onPatch(p.id, { status: "approved" })}
                className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-green-700"
              >
                <Check size={12} /> Approve
              </button>
              <button
                type="button"
                onClick={() => onPatch(p.id, { status: "denied" })}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition hover:border-red-300 hover:text-red-600"
              >
                <X size={12} /> Deny
              </button>
            </>
          ) : p.wholesale_status === "approved" ? (
            <button
              type="button"
              onClick={() => onPatch(p.id, { status: "denied" })}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition hover:border-red-300 hover:text-red-600"
            >
              <X size={12} /> Revoke
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onPatch(p.id, { status: "approved" })}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition hover:border-green-300 hover:text-green-700"
            >
              <RotateCcw size={12} /> Approve
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
