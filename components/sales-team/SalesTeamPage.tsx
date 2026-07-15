"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  Mail,
  Phone,
  MapPin,
  Users,
  Plus,
  Pencil,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  UserPlus,
  Check,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { SALES_REPS, type SalesRep } from "./reps";
import RepEmailModal from "./RepEmailModal";
import RepFormModal from "./RepFormModal";

const PAGE_SIZE = 20;

const selectCls =
  "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none";

async function authHeader(): Promise<Record<string, string>> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Map a DB row (snake_case) to the SalesRep shape the UI uses. */
function fromRow(r: Record<string, unknown>): SalesRep {
  return {
    id: r.id as string,
    agencyCode: (r.agency_code as number) ?? 0,
    agency: (r.agency as string) ?? "",
    name: (r.name as string) ?? "",
    email: (r.email as string) ?? "",
    phone: (r.phone as string) ?? "",
    city: (r.city as string) ?? "",
    state: (r.state as string) ?? "",
    zip: (r.zip as string) ?? "",
    territory: (r.territory as string) ?? "",
    samples: (r.samples as string) ?? "",
  };
}

/** Fallback seed rows get a stable synthetic key; they're read-only. */
const SEED_REPS: SalesRep[] = SALES_REPS.map((r, i) => ({ ...r, id: `seed-${i}` }));
const isSeed = (rep: SalesRep) => !rep.id || rep.id.startsWith("seed-");

export default function SalesTeamPage() {
  const [reps, setReps] = useState<SalesRep[]>(SEED_REPS);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [agency, setAgency] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [emailOpen, setEmailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SalesRep | null>(null);

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
      const res = await fetch("/api/sales-reps", { headers: await authHeader() });
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json?.error ?? `Failed to load (${res.status})`);
        return;
      }
      setLoadError(null);
      if (json.notReady) {
        // Table not created yet — show the built-in roster read-only.
        setReadOnly(true);
        setReps(SEED_REPS);
      } else {
        setReadOnly(false);
        setReps((json.reps as Record<string, unknown>[]).map(fromRow));
      }
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

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
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

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(rep: SalesRep) {
    setEditing(rep);
    setFormOpen(true);
  }

  return (
    <div className="w-full space-y-6 p-6 md:px-8">
      <p className="max-w-2xl text-sm text-gray-500">
        Our independent sales reps and rep agencies. Select reps to send them a
        personalized email blast, or edit the roster.
      </p>

      {loadError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {loadError}
        </div>
      )}

      {readOnly && !loading && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Showing the built-in roster (read-only). Run the{" "}
            <code className="rounded bg-amber-100 px-1">sales_reps</code> migration
            (<code className="rounded bg-amber-100 px-1">supabase db push</code>) to
            enable editing and adding reps.
          </span>
        </div>
      )}

      {inviteMsg && (
        <div
          className={
            "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm " +
            (inviteMsg.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700")
          }
        >
          {inviteMsg.ok ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
          {inviteMsg.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search name, agency, territory, location"
            className="w-80 rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          />
        </div>

        <select
          value={agency}
          onChange={(e) => {
            setAgency(e.target.value);
            setPage(0);
          }}
          className={selectCls}
        >
          <option value="all">All agencies ({reps.length})</option>
          {agencies.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {filtered.length} rep{filtered.length === 1 ? "" : "s"}
            {selected.size > 0 && (
              <span className="text-gray-600"> · {selected.size} selected</span>
            )}
          </span>
          {!readOnly && (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <Plus size={14} />
              Add rep
            </button>
          )}
          <button
            type="button"
            onClick={() => setEmailOpen(true)}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-40"
          >
            <Mail size={14} />
            Email {selected.size > 0 ? `${selected.size} ` : ""}rep
            {selected.size === 1 ? "" : "s"}
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 size={15} className="animate-spin" /> Loading reps…
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60 text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                      className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-gray-900"
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">Rep</th>
                  <th className="px-3 py-2.5 font-medium">Agency</th>
                  <th className="px-3 py-2.5 font-medium">Territory</th>
                  <th className="px-3 py-2.5 font-medium">Location</th>
                  <th className="px-3 py-2.5 font-medium">Contact</th>
                  <th className="px-3 py-2.5 font-medium">Samples</th>
                  <th className="w-24 px-3 py-2.5 text-right font-medium">Portal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pageItems.map((r) => {
                  const id = r.id as string;
                  const isSel = selected.has(id);
                  const canSelect = !!r.email;
                  return (
                    <tr
                      key={id}
                      onClick={() => canSelect && toggle(id)}
                      className={
                        "group transition-colors " +
                        (canSelect ? "cursor-pointer hover:bg-gray-50/70 " : "") +
                        (isSel ? "bg-gray-50" : "")
                      }
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSel}
                          disabled={!canSelect}
                          onChange={() => toggle(id)}
                          aria-label={`Select ${r.name}`}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-gray-900 disabled:cursor-not-allowed disabled:opacity-30"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-gray-900">{r.name}</div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {r.agency}
                        <span className="ml-1.5 text-[11px] text-gray-300">
                          {r.agencyCode || ""}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {r.territory || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">
                        {r.city || r.state ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={12} className="shrink-0 text-gray-300" />
                            {[r.city, r.state].filter(Boolean).join(", ")}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          {r.email ? (
                            <a
                              href={`mailto:${r.email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900 hover:underline"
                            >
                              <Mail size={12} className="shrink-0 text-gray-300" />
                              {r.email}
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-gray-300">
                              <Mail size={12} className="shrink-0" />
                              No email on file
                            </span>
                          )}
                          {r.phone && (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                              <Phone size={11} className="shrink-0 text-gray-300" />
                              {r.phone}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.samples && (
                          <span className="inline-block rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
                            {r.samples}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {!isSeed(r) && (
                            <button
                              type="button"
                              onClick={() => openEdit(r)}
                              className="rounded-md p-1 text-gray-300 opacity-0 transition hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
                              title={`Edit ${r.name}`}
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          {!isSeed(r) && r.email && (
                            <button
                              type="button"
                              onClick={() => invite(r)}
                              disabled={inviteState[id] === "loading"}
                              className={
                                "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition " +
                                (inviteState[id] === "done"
                                  ? "text-emerald-600"
                                  : "text-gray-400 hover:bg-gray-100 hover:text-gray-700")
                              }
                              title={`Invite ${r.name} to the rep portal`}
                            >
                              {inviteState[id] === "loading" ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : inviteState[id] === "done" ? (
                                <>
                                  <Check size={13} /> Sent
                                </>
                              ) : (
                                <>
                                  <UserPlus size={13} /> Invite
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-sm text-gray-400">
                      <Users size={22} className="mx-auto mb-2 text-gray-300" />
                      No reps match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2.5 text-xs text-gray-500">
              <span>
                {from}–{to} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
                >
                  <ChevronLeft size={13} /> Prev
                </button>
                <span className="px-2 text-gray-400">
                  Page {safePage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {withoutEmail > 0 && (
        <p className="text-[11px] text-gray-400">
          {withoutEmail} rep{withoutEmail === 1 ? "" : "s"} in this view{" "}
          {withoutEmail === 1 ? "has" : "have"} no email on file and can&apos;t be
          selected for a send.
        </p>
      )}

      <RepEmailModal open={emailOpen} onClose={() => setEmailOpen(false)} reps={selectedReps} />
      <RepFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        rep={editing}
        onSaved={load}
      />
    </div>
  );
}
