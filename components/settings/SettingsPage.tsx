"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  User,
  Save,
  PenLine,
  Palette,
  Users as UsersIcon,
  KeyRound,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useUser } from "@/components/UserContext";

import TeamSection from "@/components/company/team/TeamSection";
import PlatformsSection from "@/components/company/platform/PlatformsSection";

type SectionKey =
  | "profile"
  | "email-signature"
  | "email-connection"
  | "team"
  | "platforms"
  | "brands";

type SectionDef = {
  key: SectionKey;
  label: string;
  group: "personal" | "company";
  icon: React.ReactNode;
  render: () => React.ReactNode;
};

type OutlookStatus =
  | { state: "loading" }
  | { state: "disconnected" }
  | {
      state: "connected";
      email: string;
      displayName: string | null;
      status: "connected" | "needs_reconnect";
      lastError: string | null;
      connectedAt: string | null;
    };

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const SECTIONS: SectionDef[] = [
  {
    key: "profile",
    label: "Profile",
    group: "personal",
    icon: <User size={14} />,
    render: () => <ProfileCard />,
  },
  {
    key: "email-signature",
    label: "Email signature",
    group: "personal",
    icon: <PenLine size={14} />,
    render: () => <EmailSignatureCard />,
  },
  {
    key: "email-connection",
    label: "Email connection",
    group: "personal",
    icon: <Mail size={14} />,
    render: () => <OutlookCard />,
  },
  {
    key: "team",
    label: "Team",
    group: "company",
    icon: <UsersIcon size={14} />,
    render: () => (
      <CardShell
        icon={<UsersIcon size={15} />}
        title="Team"
        subtitle="Invite teammates and set their access level"
      >
        <TeamSection />
      </CardShell>
    ),
  },
  {
    key: "platforms",
    label: "Platforms & logins",
    group: "company",
    icon: <KeyRound size={14} />,
    render: () => (
      <CardShell
        icon={<KeyRound size={15} />}
        title="Platforms & logins"
        subtitle="Shared credentials for the tools your team uses"
      >
        <PlatformsSection />
      </CardShell>
    ),
  },
  {
    key: "brands",
    label: "Brand settings",
    group: "company",
    icon: <Palette size={14} />,
    render: () => <BrandSettingsCard />,
  },
];

export default function SettingsPage() {
  const { profile } = useUser();
  const isAdmin = profile?.access === "owner" || profile?.access === "admin";
  const params = useSearchParams();

  const visibleSections = useMemo(
    () =>
      SECTIONS.filter((s) => (s.group === "company" ? isAdmin : true)),
    [isAdmin],
  );

  // Determine active section from URL. Default to "profile". If an OAuth
  // return param is present and no explicit section was set, deep-link to the
  // email-connection panel so the success/error banner is visible.
  const requested = params.get("section") as SectionKey | null;
  const hasOutlookParam = params.get("outlook") !== null;
  const fallback: SectionKey = hasOutlookParam ? "email-connection" : "profile";
  const active =
    visibleSections.find((s) => s.key === requested) ??
    visibleSections.find((s) => s.key === fallback) ??
    visibleSections[0];

  const personal = visibleSections.filter((s) => s.group === "personal");
  const company = visibleSections.filter((s) => s.group === "company");

  return (
    <div className="px-4 md:px-8 py-6 md:py-8">
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 md:gap-8">
        {/* Side nav */}
        <nav className="md:sticky md:top-20 md:self-start">
          {/* Mobile: horizontal scrolling pill row */}
          <div className="md:hidden -mx-4 px-4 overflow-x-auto">
            <div className="flex gap-1.5 pb-1">
              {visibleSections.map((s) => (
                <SectionLink
                  key={s.key}
                  section={s}
                  active={active.key === s.key}
                  variant="pill"
                />
              ))}
            </div>
          </div>

          {/* Desktop: grouped vertical nav */}
          <div className="hidden md:block space-y-5">
            <NavGroup label="Personal">
              {personal.map((s) => (
                <SectionLink
                  key={s.key}
                  section={s}
                  active={active.key === s.key}
                  variant="list"
                />
              ))}
            </NavGroup>
            {company.length > 0 && (
              <NavGroup label="Company">
                {company.map((s) => (
                  <SectionLink
                    key={s.key}
                    section={s}
                    active={active.key === s.key}
                    variant="list"
                  />
                ))}
              </NavGroup>
            )}
          </div>
        </nav>

        {/* Active section content */}
        <div className="min-w-0">{active.render()}</div>
      </div>
    </div>
  );
}

/* ─── Side nav primitives ─── */

function NavGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="px-2 mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SectionLink({
  section,
  active,
  variant,
}: {
  section: SectionDef;
  active: boolean;
  variant: "list" | "pill";
}) {
  if (variant === "pill") {
    return (
      <Link
        href={`/settings?section=${section.key}`}
        scroll={false}
        className={clsx(
          "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition",
          active
            ? "bg-gray-900 text-white border-gray-900"
            : "bg-white text-gray-600 border-gray-200 hover:text-gray-900",
        )}
      >
        {section.icon}
        {section.label}
      </Link>
    );
  }
  return (
    <Link
      href={`/settings?section=${section.key}`}
      scroll={false}
      className={clsx(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-gray-100 text-gray-900 font-medium"
          : "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
      )}
    >
      <span className={active ? "text-gray-900" : "text-gray-400"}>
        {section.icon}
      </span>
      <span className="truncate">{section.label}</span>
    </Link>
  );
}

function CardShell({
  icon,
  title,
  subtitle,
  children,
  iconTone = "gray",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  iconTone?: "gray" | "blue" | "amber" | "violet";
}) {
  const toneClasses =
    iconTone === "blue"
      ? "bg-blue-50 text-blue-600"
      : iconTone === "amber"
        ? "bg-amber-50 text-amber-600"
        : iconTone === "violet"
          ? "bg-violet-50 text-violet-600"
          : "bg-gray-100 text-gray-600";
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
        <div
          className={
            "h-8 w-8 rounded-lg flex items-center justify-center " + toneClasses
          }
        >
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle && (
            <p className="text-[11px] text-gray-500">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-700 mb-1 block">
        {label}
        {hint && (
          <span className="ml-1.5 font-normal text-gray-400">— {hint}</span>
        )}
      </label>
      {children}
    </div>
  );
}

function Banner({
  banner,
}: {
  banner: { kind: "ok" | "error"; text: string } | null;
}) {
  if (!banner) return null;
  return (
    <div
      className={
        "rounded-lg border px-3 py-2 text-xs " +
        (banner.kind === "ok"
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-red-200 bg-red-50 text-red-700")
      }
    >
      {banner.text}
    </div>
  );
}

/* ─── Profile ─── */

function ProfileCard() {
  const { profile, reload } = useUser();
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setFirstName(profile?.first_name ?? "");
  }, [profile?.first_name]);

  const dirty = firstName.trim() !== (profile?.first_name ?? "").trim();

  async function save() {
    if (!profile || !dirty) return;
    setSaving(true);
    setBanner(null);
    const { error } = await supabase
      .from("profiles")
      .update({ first_name: firstName.trim() })
      .eq("id", profile.id);
    if (error) {
      setBanner({ kind: "error", text: error.message });
    } else {
      setBanner({ kind: "ok", text: "Saved." });
      reload();
    }
    setSaving(false);
  }

  return (
    <CardShell
      icon={<User size={15} />}
      title="Profile"
      subtitle="How you appear inside the portal"
    >
      <div className="space-y-4">
        <Banner banner={banner} />

        <Field label="Display name">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Your first name"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </Field>

        <Field label="Email">
          <input
            value={profile?.email ?? ""}
            readOnly
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
          />
        </Field>

        <Field label="Role">
          <div className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 capitalize">
            {profile?.access ?? "—"}
          </div>
        </Field>

        <div className="flex justify-end pt-1">
          <SaveButton onClick={save} disabled={!dirty} saving={saving} />
        </div>
      </div>
    </CardShell>
  );
}

/* ─── Email signature ─── */

function EmailSignatureCard() {
  const { profile, reload } = useUser();
  const [signature, setSignature] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("email_signature")
        .eq("id", profile.id)
        .single();
      if (cancelled) return;
      if (error) {
        setBanner({ kind: "error", text: error.message });
        setLoading(false);
        return;
      }
      const sig = (data as { email_signature: string | null } | null)
        ?.email_signature ?? "";
      setSignature(sig);
      setOriginal(sig);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const dirty = signature !== original;

  async function save() {
    if (!profile || !dirty) return;
    setSaving(true);
    setBanner(null);
    const value = signature.trim().length === 0 ? null : signature;
    const { error } = await supabase
      .from("profiles")
      .update({ email_signature: value })
      .eq("id", profile.id);
    if (error) {
      setBanner({ kind: "error", text: error.message });
    } else {
      setBanner({ kind: "ok", text: "Saved." });
      setOriginal(value ?? "");
      reload();
    }
    setSaving(false);
  }

  return (
    <CardShell
      icon={<PenLine size={15} />}
      title="Email signature"
      subtitle="Appended to emails you send from the portal"
    >
      <div className="space-y-4">
        <Banner banner={banner} />

        {loading ? (
          <div className="text-xs text-gray-400 inline-flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Field
              label="Signature"
              hint="Plain text. Newlines are preserved."
            >
              <textarea
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                rows={5}
                placeholder={`Best,\n${profile?.first_name ?? "Your name"}\nFragrance Marketing Group`}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y font-mono"
              />
            </Field>

            <div className="flex justify-end">
              <SaveButton
                onClick={save}
                disabled={!dirty}
                saving={saving}
              />
            </div>
          </>
        )}
      </div>
    </CardShell>
  );
}

/* ─── Outlook ─── */

function OutlookCard() {
  const [outlook, setOutlook] = useState<OutlookStatus>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [banner, setBanner] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/email/outlook/status", {
        headers: await authHeader(),
      });
      if (!res.ok) {
        setOutlook({ state: "disconnected" });
        return;
      }
      const json = await res.json();
      if (json?.connected) {
        setOutlook({
          state: "connected",
          email: json.email,
          displayName: json.displayName ?? null,
          status: json.status,
          lastError: json.lastError ?? null,
          connectedAt: json.connectedAt ?? null,
        });
      } else {
        setOutlook({ state: "disconnected" });
      }
    } catch {
      setOutlook({ state: "disconnected" });
    }
  }, []);

  useEffect(() => {
    refresh();
    const params = new URLSearchParams(window.location.search);
    const result = params.get("outlook");
    const reason = params.get("reason");
    if (result === "connected") {
      setBanner({ kind: "ok", text: "Outlook connected." });
    } else if (result === "error") {
      setBanner({
        kind: "error",
        text: reason
          ? `Couldn't connect Outlook: ${reason}`
          : "Couldn't connect Outlook.",
      });
    }
    if (result) {
      const url = new URL(window.location.href);
      url.searchParams.delete("outlook");
      url.searchParams.delete("reason");
      window.history.replaceState(null, "", url.toString());
    }
  }, [refresh]);

  async function connect() {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch("/api/email/outlook/connect", {
        method: "POST",
        headers: {
          ...(await authHeader()),
          "Content-Type": "application/json",
        },
      });
      const json = await res.json();
      if (!res.ok || !json?.url) {
        setBanner({
          kind: "error",
          text: `Could not start: ${json?.error ?? res.status}`,
        });
        setBusy(false);
        return;
      }
      window.location.href = json.url;
    } catch (e) {
      setBanner({
        kind: "error",
        text: e instanceof Error ? e.message : String(e),
      });
      setBusy(false);
    }
  }

  async function performDisconnect() {
    setConfirmDisconnect(false);
    setBusy(true);
    try {
      const res = await fetch("/api/email/outlook/disconnect", {
        method: "POST",
        headers: await authHeader(),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setBanner({
          kind: "error",
          text: `Disconnect failed: ${json?.error ?? res.status}`,
        });
      } else {
        setBanner({ kind: "ok", text: "Outlook disconnected." });
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const connectedEmail =
    outlook.state === "connected" ? outlook.email : null;

  return (
    <>
      <DisconnectModal
        open={confirmDisconnect}
        email={connectedEmail}
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={performDisconnect}
      />
      <CardShell
        icon={<Mail size={15} />}
        iconTone="blue"
        title="Email connection"
        subtitle="Send and receive customer email through your own mailbox"
      >
      <div className="space-y-4">
        <Banner banner={banner} />

        <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 px-4 py-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
              <Mail size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-gray-900">
                  Microsoft Outlook
                </div>
                <StatusPill status={outlook} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5 max-w-md">
                Replies thread back into the customer record. Email still lands
                in your normal Outlook inbox — colleagues never see your
                mailbox.
              </p>
              {outlook.state === "connected" && (
                <div className="mt-2 text-xs text-gray-600">
                  Connected as{" "}
                  <span className="font-medium text-gray-900">
                    {outlook.email}
                  </span>
                  {outlook.connectedAt && (
                    <span className="text-gray-400">
                      {" "}
                      · since{" "}
                      {new Date(outlook.connectedAt).toLocaleDateString()}
                    </span>
                  )}
                  {outlook.status === "needs_reconnect" &&
                    outlook.lastError && (
                      <div className="text-amber-600 mt-0.5">
                        Needs reconnect: {outlook.lastError}
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {outlook.state === "loading" && (
              <div className="inline-flex items-center gap-2 text-xs text-gray-400">
                <Loader2 size={14} className="animate-spin" />
                Checking…
              </div>
            )}
            {outlook.state === "disconnected" && (
              <button
                onClick={connect}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3.5 py-2 text-xs font-medium hover:bg-gray-800 transition disabled:opacity-50"
              >
                {busy ? "Starting…" : "Connect Outlook"}
                <ExternalLink size={12} />
              </button>
            )}
            {outlook.state === "connected" && (
              <>
                {outlook.status === "needs_reconnect" && (
                  <button
                    onClick={connect}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 text-white px-3.5 py-2 text-xs font-medium hover:bg-amber-600 transition disabled:opacity-50"
                  >
                    Reconnect
                  </button>
                )}
                <button
                  onClick={() => setConfirmDisconnect(true)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition disabled:opacity-50"
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      </CardShell>
    </>
  );
}

function DisconnectModal({
  open,
  email,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  email: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Disconnect Outlook?
          </h2>
        </div>

        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-gray-600">
            You&apos;re about to disconnect:
          </p>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-900 inline-flex items-center gap-2">
            <Mail size={14} className="text-gray-400" />
            {email ?? "your Outlook mailbox"}
          </div>
          <ul className="text-xs text-gray-500 space-y-1 pl-1 mt-2">
            <li>· You won&apos;t be able to send portal emails until you reconnect.</li>
            <li>· Incoming replies will stop threading into customer records.</li>
            <li>· Email already in your inbox is untouched.</li>
          </ul>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-700 transition"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: OutlookStatus }) {
  if (status.state === "loading") return null;
  if (status.state === "disconnected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
        Not connected
      </span>
    );
  }
  if (status.status === "needs_reconnect") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        <AlertTriangle size={10} />
        Needs reconnect
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
      <CheckCircle2 size={10} />
      Connected
    </span>
  );
}

/* ─── Brand settings ─── */

type BrandKey = "NI" | "Sassy";
type BrandRow = {
  brand: BrandKey;
  display_name: string;
  primary_color: string;
  sender_name: string;
};

const BRAND_KEYS: BrandKey[] = ["NI", "Sassy"];

function BrandSettingsCard() {
  const [rows, setRows] = useState<Record<BrandKey, BrandRow> | null>(null);
  const [originals, setOriginals] = useState<Record<BrandKey, BrandRow> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("brand_settings")
        .select("brand, display_name, primary_color, sender_name");
      if (cancelled) return;
      if (error) {
        setBanner({ kind: "error", text: error.message });
        setLoading(false);
        return;
      }
      const map = {} as Record<BrandKey, BrandRow>;
      for (const b of BRAND_KEYS) {
        map[b] = {
          brand: b,
          display_name: "",
          primary_color: "",
          sender_name: "",
        };
      }
      for (const r of (data ?? []) as Array<{
        brand: BrandKey;
        display_name: string | null;
        primary_color: string | null;
        sender_name: string | null;
      }>) {
        if (!BRAND_KEYS.includes(r.brand)) continue;
        map[r.brand] = {
          brand: r.brand,
          display_name: r.display_name ?? "",
          primary_color: r.primary_color ?? "",
          sender_name: r.sender_name ?? "",
        };
      }
      setRows(map);
      setOriginals(JSON.parse(JSON.stringify(map)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => {
    if (!rows || !originals) return false;
    return BRAND_KEYS.some((b) => {
      const a = rows[b];
      const o = originals[b];
      return (
        a.display_name !== o.display_name ||
        a.primary_color !== o.primary_color ||
        a.sender_name !== o.sender_name
      );
    });
  }, [rows, originals]);

  function update(brand: BrandKey, key: keyof BrandRow, value: string) {
    if (!rows) return;
    setRows({ ...rows, [brand]: { ...rows[brand], [key]: value } });
  }

  async function save() {
    if (!rows || !dirty) return;
    setSaving(true);
    setBanner(null);
    const payload = BRAND_KEYS.map((b) => ({
      brand: b,
      display_name: rows[b].display_name.trim() || null,
      primary_color: rows[b].primary_color.trim() || null,
      sender_name: rows[b].sender_name.trim() || null,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("brand_settings")
      .upsert(payload, { onConflict: "brand" });
    if (error) {
      setBanner({ kind: "error", text: error.message });
    } else {
      setBanner({ kind: "ok", text: "Saved." });
      setOriginals(JSON.parse(JSON.stringify(rows)));
    }
    setSaving(false);
  }

  return (
    <CardShell
      icon={<Palette size={15} />}
      iconTone="violet"
      title="Brand settings"
      subtitle="Display name, accent color, and sender name per brand"
    >
      <div className="space-y-4">
        <Banner banner={banner} />

        {loading || !rows ? (
          <div className="text-xs text-gray-400 inline-flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {BRAND_KEYS.map((b) => (
                <BrandRowEditor
                  key={b}
                  row={rows[b]}
                  onChange={(key, val) => update(b, key, val)}
                />
              ))}
            </div>

            <div className="flex justify-end pt-1">
              <SaveButton
                onClick={save}
                disabled={!dirty}
                saving={saving}
              />
            </div>
          </>
        )}
      </div>
    </CardShell>
  );
}

function BrandRowEditor({
  row,
  onChange,
}: {
  row: BrandRow;
  onChange: (key: keyof BrandRow, val: string) => void;
}) {
  const swatch = row.primary_color || "#e5e7eb";
  return (
    <div className="rounded-lg border border-gray-100 px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <div
          className="h-5 w-5 rounded-full border border-gray-200 shrink-0"
          style={{ background: swatch }}
        />
        <div className="text-sm font-semibold text-gray-900">{row.brand}</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Display name">
          <input
            value={row.display_name}
            onChange={(e) => onChange("display_name", e.target.value)}
            placeholder={row.brand}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </Field>

        <Field label="Primary color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={row.primary_color || "#000000"}
              onChange={(e) => onChange("primary_color", e.target.value)}
              className="h-9 w-12 rounded-md border border-gray-200 cursor-pointer p-0.5 bg-white shrink-0"
            />
            <input
              value={row.primary_color}
              onChange={(e) => onChange("primary_color", e.target.value)}
              placeholder="#ff6b35"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 font-mono"
            />
          </div>
        </Field>

        <Field label="Sender name">
          <input
            value={row.sender_name}
            onChange={(e) => onChange("sender_name", e.target.value)}
            placeholder="Marketing Team"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </Field>
      </div>
    </div>
  );
}

/* ─── Save button (shared) ─── */

function SaveButton({
  onClick,
  disabled,
  saving,
}: {
  onClick: () => void;
  disabled: boolean;
  saving: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || saving}
      className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {saving ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <Save size={13} />
      )}
      {saving ? "Saving…" : "Save changes"}
    </button>
  );
}
