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
  ShoppingBag,
  X,
} from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";
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

type PartnerPatch = {
  status?: PartnerStatus;
  sales_rep?: string | null;
  rep_group?: string | null;
  account_number?: string | null;
};

type TypeFilter = "all" | "wholesale" | "retail";
type StatusFilter = "all" | PartnerStatus;
type RepFilter = "all" | "unassigned" | string;

const isWholesale = (p: PartnerProfile) => p.role === "wholesale";
const isRetail = (p: PartnerProfile) => p.role === "retail";

// D2C accounts all route to the NI house rep and a single Fishbowl D2C
// customer, so these fields carry fixed defaults for retail accounts. The
// defaults are shown (and are searchable / filterable) but only persisted if a
// staff member edits the field — an explicit stored value always wins.
const D2C_DEFAULT_REP = "admin";
const D2C_DEFAULT_REP_GROUP = "NI House";
const D2C_DEFAULT_ACCOUNT_NUMBER = ""; // TODO: set the D2C Fishbowl account number

const effectiveRep = (p: PartnerProfile) =>
  p.sales_rep?.trim() || (isRetail(p) ? D2C_DEFAULT_REP : "");
const effectiveRepGroup = (p: PartnerProfile) =>
  p.rep_group?.trim() || (isRetail(p) ? D2C_DEFAULT_REP_GROUP : "");
const effectiveAccountNumber = (p: PartnerProfile) =>
  p.account_number?.trim() || (isRetail(p) ? D2C_DEFAULT_ACCOUNT_NUMBER : "");

export default function PartnersPage() {
  const [partners, setPartners] = useState<PartnerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [repFilter, setRepFilter] = useState<RepFilter>("all");
  const [storeFilter, setStoreFilter] = useState<"all" | "sassy" | "ni">("all");

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

  async function patchPartner(id: string, patch: PartnerPatch) {
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

  /* Autocomplete suggestions for the manual rep / rep-group fields: every
     distinct value in play (stored values plus the D2C defaults), so staff can
     reuse prior entries. */
  const repOptions = useMemo(() => {
    const set = new Set<string>([D2C_DEFAULT_REP]);
    for (const p of partners) {
      const r = effectiveRep(p);
      if (r) set.add(r);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [partners]);
  const repGroupOptions = useMemo(() => {
    const set = new Set<string>([D2C_DEFAULT_REP_GROUP]);
    for (const p of partners) {
      const r = effectiveRepGroup(p);
      if (r) set.add(r);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [partners]);

  const typeCounts = useMemo(() => {
    let wholesale = 0;
    let retail = 0;
    for (const p of partners) {
      if (isWholesale(p)) wholesale++;
      else if (isRetail(p)) retail++;
    }
    return { all: partners.length, wholesale, retail };
  }, [partners]);

  const statusCounts = useMemo(() => {
    const c = { all: 0, pending: 0, approved: 0, denied: 0 };
    for (const p of partners) {
      if (!isWholesale(p)) continue;
      c.all++;
      c[p.wholesale_status]++;
    }
    return c;
  }, [partners]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return partners
      .filter((p) => {
        if (typeFilter === "wholesale" && !isWholesale(p)) return false;
        if (typeFilter === "retail" && !isRetail(p)) return false;
        // Wholesale status is only meaningful for wholesale accounts — a status
        // filter therefore implicitly narrows to wholesale.
        if (statusFilter !== "all") {
          if (!isWholesale(p)) return false;
          if (p.wholesale_status !== statusFilter) return false;
        }
        if (storeFilter !== "all" && p.signup_store !== storeFilter)
          return false;
        if (repFilter === "unassigned" && effectiveRep(p)) return false;
        if (
          repFilter !== "all" &&
          repFilter !== "unassigned" &&
          effectiveRep(p).toLowerCase() !== repFilter.toLowerCase()
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
            effectiveRep(p),
            effectiveRepGroup(p),
            effectiveAccountNumber(p),
            p.signup_store,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Pending wholesale applications float to the top (the review queue),
        // then newest first across everything else.
        const aPending = isWholesale(a) && a.wholesale_status === "pending";
        const bPending = isWholesale(b) && b.wholesale_status === "pending";
        if (aPending !== bPending) return aPending ? -1 : 1;
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      });
  }, [partners, query, typeFilter, statusFilter, repFilter, storeFilter]);

  const typePills: { value: TypeFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: typeCounts.all },
    { value: "wholesale", label: "Wholesale", count: typeCounts.wholesale },
    { value: "retail", label: "D2C", count: typeCounts.retail },
  ];

  const statusPills: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: statusCounts.all },
    { value: "pending", label: "Pending", count: statusCounts.pending },
    { value: "approved", label: "Approved", count: statusCounts.approved },
    { value: "denied", label: "Denied", count: statusCounts.denied },
  ];

  const showStatusPills = typeFilter !== "retail";

  return (
    <div className="w-full space-y-6 p-6 md:px-8">
      <p className="max-w-6xl text-sm text-gray-500">
        Every account from the Sassy and Natural Inspirations storefronts — D2C
        and wholesale. Assign a rep and rep group to any account; for wholesale,
        approve or deny access and record their Fishbowl account number.
      </p>

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
            placeholder="Search business, contact, email, account #…"
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
          {typePills.map((t) => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={clsx(
                "rounded-md px-2.5 py-1.5 font-medium transition",
                typeFilter === t.value
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900"
              )}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {showStatusPills ? (
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
                title="Wholesale approval status"
              >
                {s.label} ({s.count})
              </button>
            ))}
          </div>
        ) : null}

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

      {/* Datalists shared by every row's rep / rep-group inputs. */}
      <datalist id="partner-rep-options">
        {repOptions.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <datalist id="partner-rep-group-options">
        {repGroupOptions.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 size={15} className="animate-spin" /> Loading accounts…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                <th className="px-3 py-2 text-left font-medium">Account</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Store</th>
                <th className="px-3 py-2 text-left font-medium">Contact</th>
                <th className="px-3 py-2 text-left font-medium">Rep &amp; group</th>
                <th className="px-3 py-2 text-left font-medium">Account #</th>
                <th className="px-3 py-2 text-left font-medium">Joined</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-sm text-gray-400"
                  >
                    {partners.length === 0
                      ? "No storefront accounts yet — new signups show up here automatically."
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

/**
 * A text input that commits (patches) on blur or Enter, not per keystroke.
 * Reset to the latest server value via a `key` on the committed value at the
 * call site (React's recommended pattern), so no state-syncing effect is needed.
 */
function EditableText({
  value,
  placeholder,
  listId,
  disabled,
  onCommit,
}: {
  value: string | null | undefined;
  placeholder: string;
  listId?: string;
  disabled?: boolean;
  onCommit: (next: string | null) => void;
}) {
  const initial = value ?? "";
  const [draft, setDraft] = useState(initial);

  const commit = () => {
    const next = draft.trim();
    if (next !== initial.trim()) onCommit(next || null);
  };

  return (
    <input
      value={draft}
      list={listId}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(initial);
      }}
      className={clsx(
        "w-full max-w-[150px] rounded-lg border bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-300",
        draft.trim()
          ? "border-gray-200 font-medium text-gray-900"
          : "border-dashed border-gray-300 text-gray-500"
      )}
    />
  );
}

function PartnerRow({
  partner: p,
  last,
  busy,
  onPatch,
}: {
  partner: PartnerProfile;
  last: boolean;
  busy: boolean;
  onPatch: (id: string, patch: PartnerPatch) => void;
}) {
  const wholesale = isWholesale(p);
  const meta = STATUS_META[p.wholesale_status];
  const joined = p.created_at
    ? new Date(p.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
  const details = [p.business_type, p.expected_monthly_volume]
    .filter(Boolean)
    .join(" · ");

  return (
    <tr
      className={clsx(
        "align-top transition-colors hover:bg-gray-50",
        !last && "border-b border-gray-50",
        busy && "opacity-60"
      )}
    >
      {/* Account: business + (for wholesale) vetting details */}
      <td className="px-3 py-2.5">
        <div className="font-semibold text-gray-900">{p.business_name}</div>
        {p.website ? (
          <div className="mt-0.5 max-w-[180px] truncate text-gray-400">
            {p.website}
          </div>
        ) : null}
        {wholesale && (details || p.tax_id) ? (
          <div className="mt-1 max-w-[200px] text-[11px] leading-tight text-gray-400">
            {details ? <div>{details}</div> : null}
            <div>{p.tax_id ? `Tax ID ${p.tax_id}` : "No tax ID yet"}</div>
          </div>
        ) : null}
      </td>

      {/* Type */}
      <td className="px-3 py-2.5">
        {wholesale ? (
          <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
            Wholesale
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            <ShoppingBag size={10} /> D2C
          </span>
        )}
      </td>

      {/* Store */}
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

      {/* Contact */}
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

      {/* Rep & group — manual free-text, autocompleted from prior entries */}
      <td className="px-3 py-2.5">
        <div className="space-y-1">
          <EditableText
            key={`rep-${effectiveRep(p)}`}
            value={effectiveRep(p)}
            placeholder="Rep"
            listId="partner-rep-options"
            disabled={busy}
            onCommit={(next) => onPatch(p.id, { sales_rep: next })}
          />
          <EditableText
            key={`group-${effectiveRepGroup(p)}`}
            value={effectiveRepGroup(p)}
            placeholder="Rep group"
            listId="partner-rep-group-options"
            disabled={busy}
            onCommit={(next) => onPatch(p.id, { rep_group: next })}
          />
        </div>
      </td>

      {/* Account # — Fishbowl customer number; D2C defaults to the house account */}
      <td className="px-3 py-2.5">
        <EditableText
          key={`acct-${effectiveAccountNumber(p)}`}
          value={effectiveAccountNumber(p)}
          placeholder={wholesale ? "Fishbowl #" : "Account #"}
          disabled={busy}
          onCommit={(next) => onPatch(p.id, { account_number: next })}
        />
      </td>

      {/* Joined */}
      <td className="whitespace-nowrap px-3 py-2.5 text-gray-500 tabular-nums">
        {joined}
      </td>

      {/* Status — wholesale approval, or a neutral marker for D2C */}
      <td className="px-3 py-2.5">
        {wholesale ? (
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              meta.chip
            )}
          >
            <meta.Icon size={11} />
            {meta.label}
          </span>
        ) : (
          <span className="text-[11px] text-gray-400">Customer</span>
        )}
      </td>

      {/* Actions — approve / deny / revoke, wholesale only */}
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          {busy ? (
            <Loader2 size={14} className="animate-spin text-gray-400" />
          ) : !wholesale ? (
            <span className="text-gray-300">—</span>
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
