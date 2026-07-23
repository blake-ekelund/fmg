"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Mail,
  Phone,
  MapPin,
  Users,
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertTriangle,
  UserPlus,
  Check,
  Building2,
  Globe2,
  MailWarning,
  X,
} from "lucide-react";
import { SEED_REPS, authHeader, isSeed, loadReps, location } from "./repShared";
import RepAvatar from "./RepAvatar";
import type { SalesRep } from "./reps";
import RepEmailModal from "./RepEmailModal";
import RepFormModal from "./RepFormModal";

const PAGE_SIZE = 25;

/* ---------------------------
   Sorting
--------------------------- */
type SortKey = "name" | "agency" | "territory" | "location" | "email" | "phone";
type SortDir = "asc" | "desc";

const SORT_VALUE: Record<SortKey, (r: SalesRep) => string> = {
  name: (r) => r.name,
  // Sort by agency name, then code, so one agency's reps stay together.
  agency: (r) => `${r.agency} ${String(r.agencyCode ?? "").padStart(6, "0")}`,
  territory: (r) => r.territory,
  // State first: "who covers the Southwest" is the real question behind this column.
  location: (r) => [r.state, r.city].filter(Boolean).join(" "),
  email: (r) => r.email,
  // Compare digits only, so 612-281-7921 and 612.281.7921 sort together.
  phone: (r) => r.phone.replace(/\D/g, ""),
};

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Rep" },
  { key: "agency", label: "Agency" },
  { key: "territory", label: "Territory" },
  { key: "location", label: "Location" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

const controlCls =
  "rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-ink-secondary transition focus:border-brand-400 focus:outline-none";

export default function SalesTeamPage() {
  const router = useRouter();

  const [reps, setReps] = useState<SalesRep[]>(SEED_REPS);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [agency, setAgency] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "name",
    dir: "asc",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /** New column starts ascending; the same column flips direction. */
  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
    setPage(0);
  }

  const [emailOpen, setEmailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Portal-invite state, keyed by rep id.
  const [inviteState, setInviteState] = useState<Record<string, "loading" | "done" | "error">>({});
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function invite(rep: SalesRep) {
    if (!rep.id) return;
    setInviteState((s) => ({ ...s, [rep.id as string]: "loading" }));
    setInviteMsg(null);
    try {
      const res = await fetch("/api/portal/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ repId: rep.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`);
      setInviteState((s) => ({ ...s, [rep.id as string]: "done" }));
      setInviteMsg({ ok: true, text: `${rep.name}: ${json.message ?? "Invite sent."}` });
    } catch (e) {
      setInviteState((s) => ({ ...s, [rep.id as string]: "error" }));
      setInviteMsg({ ok: false, text: `${rep.name}: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  const load = useCallback(async () => {
    try {
      const { reps, readOnly } = await loadReps();
      setLoadError(null);
      setReadOnly(readOnly);
      setReps(reps);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const agencies = useMemo(
    () => Array.from(new Set(reps.map((r) => r.agency).filter(Boolean))).sort(),
    [reps],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reps.filter((r) => {
      if (agency !== "all" && r.agency !== agency) return false;
      if (q) {
        const hay = [r.name, r.agency, r.territory, r.city, r.state, r.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reps, query, agency]);

  /* Blanks always sink to the bottom, in either direction — a directory sorted
     by Phone should lead with the reps who have one, not with the gaps. */
  const sorted = useMemo(() => {
    const value = SORT_VALUE[sort.key];
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (!av && !bv) return a.name.localeCompare(b.name);
      if (!av) return 1;
      if (!bv) return -1;
      const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
      return cmp !== 0 ? cmp * factor : a.name.localeCompare(b.name);
    });
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE);

  // Selectable = every filtered rep with an email (across all pages).
  const selectableIds = useMemo(
    () => filtered.filter((r) => r.email).map((r) => r.id as string),
    [filtered],
  );
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const selectedReps = useMemo(
    () => reps.filter((r) => r.id && selected.has(r.id)),
    [reps, selected],
  );

  const withoutEmail = filtered.filter((r) => !r.email).length;
  const states = useMemo(
    () => new Set(reps.map((r) => r.state).filter(Boolean)).size,
    [reps],
  );

  const isFiltered = query.trim() !== "" || agency !== "all";

  function clearFilters() {
    setQuery("");
    setAgency("all");
    setPage(0);
  }

  return (
    <div className="w-full space-y-4 p-5 md:px-7">
      {/* ─── Summary strip (desktop only — on a phone the roster itself is
             the point, and four counters push it below the fold) ─── */}
      <div className="hidden gap-2 sm:grid sm:grid-cols-4">
        <Stat icon={Users} label="Reps" value={reps.length} />
        <Stat icon={Building2} label="Agencies" value={agencies.length} />
        <Stat icon={Globe2} label="States" value={states} />
        <Stat
          icon={MailWarning}
          label="No email"
          value={reps.filter((r) => !r.email).length}
          muted
        />
      </div>

      {loadError && (
        <Banner tone="critical" icon={AlertTriangle}>
          {loadError}
        </Banner>
      )}

      {readOnly && !loading && (
        <Banner tone="warning" icon={AlertTriangle}>
          Showing the built-in roster (read-only). Run the{" "}
          <code className="rounded bg-warning-soft px-1 font-mono">sales_reps</code>{" "}
          migration (<code className="rounded bg-warning-soft px-1 font-mono">supabase db push</code>)
          to enable editing, adding reps and portal invites.
        </Banner>
      )}

      {inviteMsg && (
        <Banner
          tone={inviteMsg.ok ? "positive" : "critical"}
          icon={inviteMsg.ok ? Check : AlertTriangle}
          onDismiss={() => setInviteMsg(null)}
        >
          {inviteMsg.text}
        </Banner>
      )}

      {/* ─── Toolbar ─── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Mobile: search fills the row and the Email CTA sits beside it. */}
        <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search name, agency, territory, location"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-8 pr-3 text-[11px] text-ink placeholder:text-ink-subtle transition focus:border-brand-400 focus:outline-none sm:py-1.5"
          />
        </div>

        {/* Agency filter is desktop-only — search already covers agency names. */}
        <select
          value={agency}
          onChange={(e) => {
            setAgency(e.target.value);
            setPage(0);
          }}
          className={`hidden sm:block ${controlCls}`}
        >
          <option value="all">All agencies ({reps.length})</option>
          {agencies.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        {isFiltered && (
          <button
            type="button"
            onClick={clearFilters}
            className="hidden items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-ink-muted transition hover:text-ink sm:inline-flex"
          >
            <X size={11} /> Clear
          </button>
        )}

        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          {/* Count is desktop-only; on mobile the Email button already carries
              the selection count and the roster speaks for itself. */}
          <span className="hidden text-[11px] text-ink-subtle sm:inline">
            {filtered.length} rep{filtered.length === 1 ? "" : "s"}
            {selected.size > 0 && (
              <span className="text-brand-700"> · {selected.size} selected</span>
            )}
          </span>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="hidden min-h-9 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-ink-secondary transition hover:border-line-strong hover:text-ink sm:inline-flex"
            >
              <Plus size={12} />
              Add rep
            </button>
          )}
          <button
            type="button"
            onClick={() => setEmailOpen(true)}
            disabled={selected.size === 0}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-lg bg-brand-700 px-2.5 text-[11px] font-medium text-white transition hover:bg-brand-800 disabled:opacity-40 disabled:hover:bg-brand-700 sm:px-3 sm:py-1.5"
          >
            <Mail size={12} />
            <span>Email{selected.size > 0 ? ` ${selected.size}` : ""}</span>
            {/* The "rep(s)" tail is desktop-only so the mobile CTA stays compact. */}
            <span className="hidden sm:inline">
              rep{selected.size === 1 ? "" : "s"}
            </span>
          </button>
        </div>
      </div>

      {/* ─── Table ─── */}
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-[11px] text-ink-muted">
          <Loader2 size={13} className="animate-spin" /> Loading reps…
        </div>
      ) : (
        /* Panel chrome is desktop-only; on mobile each rep is a standalone card. */
        <div className="md:overflow-hidden md:rounded-xl md:border md:border-line md:bg-surface md:shadow-card">
          {/* Desktop: full table. Below md it becomes a card list — an 860px
              table in a horizontal scroller is unusable on a phone. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] text-[11px]">
              <thead>
                <tr className="border-b border-line bg-surface-muted text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                  <th className="w-9 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all reps"
                      className="h-3 w-3 cursor-pointer rounded border-line-strong accent-brand-700"
                    />
                  </th>
                  {COLUMNS.map((col) => (
                    <SortableTh
                      key={col.key}
                      label={col.label}
                      active={sort.key === col.key}
                      dir={sort.dir}
                      onClick={() => toggleSort(col.key)}
                    />
                  ))}
                  <th className="w-20 px-3 py-2 text-right">Portal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageItems.map((r) => {
                  const id = r.id as string;
                  const isSel = selected.has(id);
                  const canSelect = !!r.email;
                  return (
                    <tr
                      key={id}
                      onClick={() => router.push(`/sales-team/${id}`)}
                      className={
                        "group cursor-pointer transition-colors " +
                        (isSel ? "bg-brand-50/60" : "hover:bg-surface-muted")
                      }
                    >
                      {/* Selection is checkbox-only now that the row itself
                          drills into the rep. */}
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSel}
                          disabled={!canSelect}
                          onChange={() => toggle(id)}
                          aria-label={`Select ${r.name}`}
                          title={canSelect ? `Select ${r.name}` : "No email on file"}
                          className="h-3 w-3 cursor-pointer rounded border-line-strong accent-brand-700 disabled:cursor-not-allowed disabled:opacity-30"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <RepAvatar rep={r} size={22} />
                          <span className="font-medium text-ink group-hover:text-brand-700">
                            {r.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-ink-secondary">
                        {r.agency}
                        {!!r.agencyCode && (
                          <span className="ml-1 text-[10px] text-ink-subtle">
                            {r.agencyCode}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink-secondary">
                        {r.territory || <Dash />}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">
                        {location(r) ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={11} className="shrink-0 text-ink-subtle" />
                            {location(r)}
                          </span>
                        ) : (
                          <Dash />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.email ? (
                          <span className="inline-flex items-center gap-1 text-ink-secondary">
                            <Mail size={11} className="shrink-0 text-ink-subtle" />
                            {r.email}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-ink-subtle">
                            <Mail size={11} className="shrink-0" />
                            No email on file
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.phone ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap text-ink-secondary">
                            <Phone size={10} className="shrink-0 text-ink-subtle" />
                            {r.phone}
                          </span>
                        ) : (
                          <Dash />
                        )}
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {!isSeed(r) && r.email ? (
                            <button
                              type="button"
                              onClick={() => invite(r)}
                              disabled={inviteState[id] === "loading"}
                              className={
                                "inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium transition " +
                                (inviteState[id] === "done"
                                  ? "text-positive"
                                  : "text-ink-muted hover:bg-surface-sunken hover:text-ink")
                              }
                              title={`Invite ${r.name} to the rep portal`}
                            >
                              {inviteState[id] === "loading" ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : inviteState[id] === "done" ? (
                                <>
                                  <Check size={11} /> Sent
                                </>
                              ) : (
                                <>
                                  <UserPlus size={11} /> Invite
                                </>
                              )}
                            </button>
                          ) : (
                            <ChevronRight
                              size={13}
                              className="text-ink-subtle opacity-0 transition group-hover:opacity-100"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-14 text-center">
                      <Users size={20} className="mx-auto mb-2 text-ink-subtle" />
                      <p className="text-[11px] font-medium text-ink-secondary">
                        No reps match your search.
                      </p>
                      {isFiltered && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="mt-2 text-[11px] font-medium text-brand-700 hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile: one tappable card per rep */}
          <ul className="space-y-2 md:hidden">
            {pageItems.map((r) => {
              const id = r.id as string;
              const isSel = selected.has(id);
              const canSelect = !!r.email;
              return (
                <li
                  key={id}
                  className={
                    "rounded-xl border bg-surface shadow-card transition-colors " +
                    (isSel ? "border-brand-300 bg-brand-50/60" : "border-line")
                  }
                >
                  <div className="flex items-start gap-2.5 px-3 py-3">
                    <label
                      className="flex min-h-11 min-w-6 items-start pt-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        disabled={!canSelect}
                        onChange={() => toggle(id)}
                        aria-label={`Select ${r.name}`}
                        className="h-4 w-4 cursor-pointer rounded border-line-strong accent-brand-700 disabled:cursor-not-allowed disabled:opacity-30"
                      />
                    </label>

                    <Link href={`/sales-team/${id}`} className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <RepAvatar rep={r} size={26} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-ink">
                            {r.name}
                          </div>
                          <div className="truncate text-[11px] text-ink-muted">
                            {[r.agency, r.territory].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                        <ChevronRight size={14} className="shrink-0 text-ink-subtle" />
                      </div>

                      <div className="mt-1.5 space-y-1 pl-[34px] text-[11px]">
                        <div className="flex items-center gap-1.5 text-ink-secondary">
                          <Mail size={11} className="shrink-0 text-ink-subtle" />
                          {r.email ? (
                            <span className="truncate">{r.email}</span>
                          ) : (
                            <span className="text-ink-subtle">No email on file</span>
                          )}
                        </div>
                        {r.phone && (
                          <div className="flex items-center gap-1.5 text-ink-secondary">
                            <Phone size={11} className="shrink-0 text-ink-subtle" />
                            {r.phone}
                          </div>
                        )}
                        {location(r) && (
                          <div className="flex items-center gap-1 text-ink-muted">
                            <MapPin size={11} className="shrink-0 text-ink-subtle" />
                            {location(r)}
                          </div>
                        )}
                      </div>
                    </Link>
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="rounded-xl border border-line bg-surface px-3 py-12 text-center shadow-card">
                <Users size={20} className="mx-auto mb-2 text-ink-subtle" />
                <p className="text-[11px] font-medium text-ink-secondary">
                  No reps match your search.
                </p>
                {isFiltered && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-2 text-[11px] font-medium text-brand-700 hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </li>
            )}
          </ul>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="mt-2 flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-[10px] text-ink-muted md:mt-0 md:rounded-none md:border-0 md:border-t md:border-line">
              <span>
                {from}–{to} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="inline-flex items-center gap-0.5 rounded border border-line px-1.5 py-1 font-medium text-ink-secondary transition hover:bg-surface-muted disabled:opacity-40"
                >
                  <ChevronLeft size={11} /> Prev
                </button>
                <span className="px-2">
                  Page {safePage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="inline-flex items-center gap-0.5 rounded border border-line px-1.5 py-1 font-medium text-ink-secondary transition hover:bg-surface-muted disabled:opacity-40"
                >
                  Next <ChevronRight size={11} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {withoutEmail > 0 && (
        <p className="text-[10px] text-ink-subtle">
          {withoutEmail} rep{withoutEmail === 1 ? "" : "s"} in this view{" "}
          {withoutEmail === 1 ? "has" : "have"} no email on file and can&apos;t be
          selected for a send.
        </p>
      )}

      <RepEmailModal open={emailOpen} onClose={() => setEmailOpen(false)} reps={selectedReps} />
      {/* Editing happens on the rep's own page; this is create-only. */}
      <RepFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        rep={null}
        onSaved={load}
      />
    </div>
  );
}

/* ─── Small building blocks ─── */

function Dash() {
  return <span className="text-ink-subtle">—</span>;
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th
      className="px-3 py-2"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={onClick}
        title={`Sort by ${label}`}
        className={
          "group inline-flex items-center gap-1 uppercase tracking-[0.1em] transition-colors " +
          (active ? "text-brand-700" : "hover:text-ink-secondary")
        }
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp size={11} className="shrink-0" />
          ) : (
            <ChevronDown size={11} className="shrink-0" />
          )
        ) : (
          <ChevronsUpDown
            size={11}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
          />
        )}
      </button>
    </th>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card">
      <span
        className={
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg " +
          (muted ? "bg-surface-sunken text-ink-muted" : "bg-brand-50 text-brand-700")
        }
      >
        <Icon size={14} />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="text-[15px] font-semibold tabular text-ink">{value}</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-subtle">
          {label}
        </div>
      </div>
    </div>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
  onDismiss,
}: {
  tone: "critical" | "warning" | "positive";
  icon: typeof AlertTriangle;
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const tones = {
    critical: "border-critical/20 bg-critical-soft text-critical",
    warning: "border-warning/20 bg-warning-soft text-warning",
    positive: "border-positive/20 bg-positive-soft text-positive",
  } as const;

  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] ${tones[tone]}`}>
      <Icon size={13} className="mt-px shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 opacity-60 transition hover:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
