"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useUser } from "@/components/UserContext";
import { getDefaultRoute } from "@/components/navConfig";
import { LogoMark } from "@/components/ui/Logo";

const TABS = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/customers", label: "My Customers" },
  { href: "/portal/assets", label: "Brand Assets" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  /* Admin preview: Team → Rep Portal Preview embeds this shell as
     /portal?previewAgency=<code>. Owners and admins are let through so they can
     see exactly what a rep sees; the data itself is still gated server-side by
     resolvePortalAgency. Everyone else internal is still bounced. */
  /* Read straight off the URL rather than useSearchParams(), which would force
     this client layout to sit inside a Suspense boundary at build time. The
     lazy initializer runs on the first client render, before the guard effect
     below, so a previewing admin is never bounced. */
  const [previewAgency] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("previewAgency"),
  );
  const isPreviewer =
    !!previewAgency && (profile?.access === "owner" || profile?.access === "admin");

  // Guard: only provisioned reps belong here. Internal users get sent to their
  // own landing page; signed-out users fall through to AuthGate → sign-in.
  useEffect(() => {
    if (loading || !profile || isPreviewer) return;
    if (profile.access !== "rep") {
      router.replace(getDefaultRoute(profile.access));
    }
  }, [loading, profile, router, isPreviewer]);

  if (loading || !profile || (profile.access !== "rep" && !isPreviewer)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-brand-700" />
      </div>
    );
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/auth/sign-in");
  }

  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <LogoMark size={36} className="rounded-[10px]" />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-ink">Rep Portal</div>
              <div className="text-xs text-ink-muted">Fragrance Marketing Group</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-ink-secondary sm:inline">
              Hi, {profile.first_name || "there"}
            </span>
            {/* Sign out is a rep control. In preview it would log the admin out
                of the internal app, so it renders inert. */}
            <button
              onClick={isPreviewer ? undefined : signOut}
              disabled={isPreviewer}
              title={isPreviewer ? "Disabled while previewing" : undefined}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-secondary transition hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              Sign out
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 px-2 md:px-6">
          {TABS.map((t) => {
            const active = t.href === "/portal" ? pathname === "/portal" : pathname.startsWith(t.href);
            // Carry the preview agency across tabs, or the second click would
            // drop back to a non-preview portal and 401.
            const href = previewAgency
              ? `${t.href}?previewAgency=${encodeURIComponent(previewAgency)}`
              : t.href;
            return (
              <Link
                key={t.href}
                href={href}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-accent-500 text-brand-700"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
