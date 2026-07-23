"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building2,
  Map,
  Package,
  Pencil,
  UserPlus,
  Check,
  Loader2,
  AlertTriangle,
  Users,
  TrendingUp,
  ShoppingBag,
  Activity,
  Hash,
} from "lucide-react";
import { authHeader, isSeed, loadReps, location } from "./repShared";
import RepAvatar from "./RepAvatar";
import RepFormModal from "./RepFormModal";
import RepEmailModal from "./RepEmailModal";
import type { SalesRep } from "./reps";

export default function RepDetailPage({ repId }: { repId: string }) {
  const [reps, setReps] = useState<SalesRep[] | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [invite, setInvite] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { reps, readOnly } = await loadReps();
      setError(null);
      setReadOnly(readOnly);
      setReps(reps);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setReps([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rep = useMemo(
    () => reps?.find((r) => r.id === repId) ?? null,
    [reps, repId],
  );

  /** Everyone else at the same agency — the most useful lateral jump. */
  const teammates = useMemo(() => {
    if (!rep || !reps) return [];
    return reps
      .filter((r) => r.id !== rep.id && r.agency && r.agency === rep.agency)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rep, reps]);

  async function sendInvite() {
    if (!rep?.id) return;
    setInvite("loading");
    setInviteMsg(null);
    try {
      const res = await fetch("/api/portal/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ repId: rep.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`);
      setInvite("done");
      setInviteMsg(json.message ?? "Invite sent.");
    } catch (e) {
      setInvite("error");
      setInviteMsg(e instanceof Error ? e.message : String(e));
    }
  }

  /* ─── Loading / not-found ─── */

  if (reps === null) {
    return (
      <div className="flex items-center gap-2 p-6 text-[11px] text-ink-muted">
        <Loader2 size={13} className="animate-spin" /> Loading rep…
      </div>
    );
  }

  if (!rep) {
    return (
      <div className="p-5 md:px-7">
        <BackLink />
        <div className="mt-6 rounded-xl border border-line bg-surface px-6 py-14 text-center shadow-card">
          <Users size={22} className="mx-auto mb-2 text-ink-subtle" />
          <p className="text-xs font-medium text-ink">Rep not found</p>
          <p className="mt-1 text-[11px] text-ink-muted">
            {error ?? "This rep may have been removed from the roster."}
          </p>
          <Link
            href="/sales-team"
            className="mt-3 inline-block text-[11px] font-medium text-brand-700 hover:underline"
          >
            Back to the directory
          </Link>
        </div>
      </div>
    );
  }

  const seed = isSeed(rep);
  const canInvite = !seed && !!rep.email;

  return (
    <div className="w-full space-y-4 p-5 md:px-7">
      <BackLink />

      {/* ─── Identity header ─── */}
      <header className="flex flex-wrap items-start gap-4 rounded-xl border border-line bg-surface p-4 shadow-card">
        <RepAvatar rep={rep} size={48} />

        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight text-ink">{rep.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-muted">
            {rep.agency && (
              <span className="inline-flex items-center gap-1">
                <Building2 size={11} className="text-ink-subtle" />
                {rep.agency}
                {!!rep.agencyCode && (
                  <span className="text-ink-subtle">· {rep.agencyCode}</span>
                )}
              </span>
            )}
            {rep.territory && (
              <span className="inline-flex items-center gap-1">
                <Map size={11} className="text-ink-subtle" />
                {rep.territory}
              </span>
            )}
            {location(rep) && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} className="text-ink-subtle" />
                {location(rep)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          {rep.email && (
            <button
              type="button"
              onClick={() => setEmailOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-700 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-brand-800"
            >
              <Mail size={12} /> Email
            </button>
          )}
          {canInvite && (
            <button
              type="button"
              onClick={sendInvite}
              disabled={invite === "loading"}
              className={
                "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition " +
                (invite === "done"
                  ? "border-positive/25 bg-positive-soft text-positive"
                  : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink")
              }
            >
              {invite === "loading" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : invite === "done" ? (
                <Check size={12} />
              ) : (
                <UserPlus size={12} />
              )}
              {invite === "done" ? "Invited" : "Invite to portal"}
            </button>
          )}
          {!seed && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-ink-secondary transition hover:border-line-strong hover:text-ink"
            >
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>
      </header>

      {inviteMsg && (
        <div
          className={
            "flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] " +
            (invite === "done"
              ? "border-positive/20 bg-positive-soft text-positive"
              : "border-critical/20 bg-critical-soft text-critical")
          }
        >
          {invite === "done" ? (
            <Check size={13} className="mt-px shrink-0" />
          ) : (
            <AlertTriangle size={13} className="mt-px shrink-0" />
          )}
          {inviteMsg}
        </div>
      )}

      {(seed || readOnly) && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning-soft px-3 py-2 text-[11px] text-warning">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          <span>
            This rep comes from the built-in roster, so editing and portal invites
            are unavailable. Run the{" "}
            <code className="rounded bg-warning-soft px-1 font-mono">sales_reps</code>{" "}
            migration to manage reps from here.
          </span>
        </div>
      )}

      {/* ─── Detail cards ─── */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Contact" icon={Mail}>
          <Field label="Email">
            {rep.email ? (
              <span className="break-all">{rep.email}</span>
            ) : (
              <Empty>No email on file</Empty>
            )}
          </Field>
          <Field label="Phone">
            {rep.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone size={11} className="text-ink-subtle" />
                {rep.phone}
              </span>
            ) : (
              <Empty>No phone on file</Empty>
            )}
          </Field>
          <Field label="Address">
            {rep.address || location(rep) || rep.zip ? (
              /* Rendered as a mailing block — this is what gets copied onto a
                 sample or catalog shipment. */
              <address className="not-italic leading-relaxed">
                {rep.address && (
                  <>
                    {rep.address}
                    <br />
                  </>
                )}
                {location(rep)}
                {rep.zip && <span className="text-ink-muted"> {rep.zip}</span>}
              </address>
            ) : (
              <Empty>Not on file</Empty>
            )}
          </Field>
        </Card>

        <Card title="Assignment" icon={Map}>
          <Field label="Agency">
            {rep.agency ? <span>{rep.agency}</span> : <Empty>Unassigned</Empty>}
          </Field>
          <Field label="Agency code">
            {rep.agencyCode ? (
              <span className="inline-flex items-center gap-1 tabular">
                <Hash size={10} className="text-ink-subtle" />
                {rep.agencyCode}
              </span>
            ) : (
              <Empty>—</Empty>
            )}
          </Field>
          <Field label="Territory">
            {rep.territory ? <span>{rep.territory}</span> : <Empty>Not set</Empty>}
          </Field>
          <Field label="Samples tier">
            {rep.samples ? (
              <span className="inline-flex items-center gap-1 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
                <Package size={10} />
                {rep.samples}
              </span>
            ) : (
              <Empty>Not set</Empty>
            )}
          </Field>
        </Card>

        <Card title={`Agency team${teammates.length ? ` · ${teammates.length}` : ""}`} icon={Users}>
          {teammates.length === 0 ? (
            <Empty>No other reps at this agency.</Empty>
          ) : (
            <ul className="-mx-1 max-h-56 overflow-y-auto">
              {teammates.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/sales-team/${t.id}`}
                    className="flex items-center gap-2 rounded-lg px-1 py-1.5 transition hover:bg-surface-muted"
                  >
                    <RepAvatar rep={t} size={20} />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">
                      {t.name}
                    </span>
                    <span className="shrink-0 truncate text-[10px] text-ink-subtle">
                      {t.territory || location(t) || ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ─── Placeholders for the fuller build-out ─── */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Placeholder
          icon={TrendingUp}
          title="Sales performance"
          body="Revenue, order count and YoY trend for this rep's accounts."
        />
        <Placeholder
          icon={ShoppingBag}
          title="Accounts"
          body="Wholesale customers assigned to this rep, with order history."
        />
        <Placeholder
          icon={Activity}
          title="Activity"
          body="Portal logins, emails sent and sample requests."
        />
      </div>

      <RepFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        rep={rep}
        onSaved={load}
      />
      <RepEmailModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        reps={rep.email ? [rep] : []}
      />
    </div>
  );
}

/* ─── Building blocks ─── */

function BackLink() {
  return (
    <Link
      href="/sales-team"
      className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted transition hover:text-brand-700"
    >
      <ArrowLeft size={12} /> Rep Directory
    </Link>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Mail;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-3.5 shadow-card">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
        <Icon size={11} />
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[76px_1fr] items-start gap-2">
      <span className="pt-px text-[10px] font-medium uppercase tracking-[0.08em] text-ink-subtle">
        {label}
      </span>
      <span className="min-w-0 break-words text-[11px] text-ink">{children}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-ink-subtle">{children}</span>;
}

function Placeholder({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof TrendingUp;
  title: string;
  body: string;
}) {
  return (
    <section className="rounded-xl border border-dashed border-line-strong bg-surface-muted/60 p-3.5">
      <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
        <Icon size={11} />
        {title}
      </h3>
      <p className="mt-1.5 text-[11px] text-ink-muted">{body}</p>
      <span className="mt-2 inline-block rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle">
        Coming soon
      </span>
    </section>
  );
}
