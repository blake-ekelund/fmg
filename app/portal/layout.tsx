"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useUser } from "@/components/UserContext";
import { getDefaultRoute } from "@/components/navConfig";
import { LogoMark } from "@/components/ui/Logo";

const TABS = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/customers", label: "My Customers" },
  { href: "/portal/orders", label: "Orders" },
  { href: "/portal/sales-hub", label: "Sales Hub" },
  { href: "/portal/assets", label: "Brand Assets" },
  { href: "/portal/contact", label: "Contact" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

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

  /* Close the mobile menu whenever the route changes — including back/forward,
     which an onClick on the links alone would miss. Adjusted during render
     rather than in an effect, so the new page never paints with the menu still
     covering it. */
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

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

  /** Carry the preview agency across tabs, or the next click 401s. */
  function tabHref(href: string) {
    return previewAgency
      ? `${href}?previewAgency=${encodeURIComponent(previewAgency)}`
      : href;
  }

  function isActive(href: string) {
    return href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      {/* One row on desktop: brand left, nav centred, account right. */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 md:px-8">
          {/* Left — brand. Fixed basis on desktop so the centre nav is centred
              against the viewport, not pushed off by the brand's width. */}
          <Link
            href={tabHref("/portal")}
            className="flex shrink-0 items-center gap-3 md:basis-56"
          >
            <LogoMark size={36} className="rounded-[10px]" />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-ink">Rep Portal</div>
              <div className="hidden text-xs text-ink-muted sm:block">
                Fragrance Marketing Group
              </div>
            </div>
          </Link>

          {/* Centre — nav */}
          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={tabHref(t.href)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive(t.href)
                    ? "bg-surface-muted text-brand-700"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          {/* Right — account. Matches the left basis so the nav sits dead centre. */}
          <div className="ml-auto hidden shrink-0 items-center justify-end md:flex md:basis-56">
            <ProfileMenu
              firstName={profile.first_name}
              disabled={isPreviewer}
              onSignOut={signOut}
            />
          </div>

          {/* Mobile: one menu button. Five tabs plus a sign-out button don't fit
              a phone header, so navigation and account both live in here. */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="ml-auto rounded-lg border border-line p-2 text-ink-secondary transition hover:bg-surface-muted hover:text-ink md:hidden"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="fixed inset-0 top-16 z-30 overflow-y-auto bg-surface md:hidden">
          <nav className="px-4 py-3">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={tabHref(t.href)}
                className={`flex items-center rounded-lg px-3 py-3 text-[15px] font-medium transition ${
                  isActive(t.href)
                    ? "bg-surface-muted text-brand-700"
                    : "text-ink-secondary hover:bg-surface-muted hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            ))}

            <div className="mt-3 border-t border-line pt-3">
              <div className="px-3 pb-2 text-xs text-ink-muted">
                Signed in as {profile.first_name || "there"}
              </div>
              <button
                onClick={isPreviewer ? undefined : signOut}
                disabled={isPreviewer}
                title={isPreviewer ? "Disabled while previewing" : undefined}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-[15px] font-medium text-ink-secondary transition hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogOut size={17} />
                Sign out
              </button>
            </div>
          </nav>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
        {children}
      </main>

      <PortalFooter tabHref={tabHref} />
    </div>
  );
}

/**
 * Account control: an initial in a circle, revealing name + sign out on hover.
 *
 * Hover alone would strand keyboard and touch users, so focus-within opens it
 * too and a click toggles it — the hover is a shortcut, not the only way in.
 */
function ProfileMenu({
  firstName,
  disabled,
  onSignOut,
}: {
  firstName: string | null | undefined;
  disabled: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const initial = (firstName || "?").trim().charAt(0).toUpperCase();

  return (
    <div
      className="group relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white ring-1 ring-brand-900/10 transition hover:bg-brand-600"
      >
        {initial}
      </button>

      {/* Padded wrapper bridges the gap to the button so the menu doesn't
          vanish as the pointer travels into it. */}
      <div
        className={`absolute right-0 top-full pt-2 ${open ? "block" : "hidden"} group-focus-within:block`}
      >
        <div className="w-52 overflow-hidden rounded-xl border border-line bg-surface shadow-overlay">
          <div className="border-b border-line bg-surface-muted px-3 py-2.5">
            <div className="text-sm font-medium text-ink">
              {firstName || "Signed in"}
            </div>
            <div className="text-xs text-ink-muted">Rep Portal</div>
          </div>
          {/* Sign out is a rep control. In preview it would log the admin out
              of the internal app, so it renders inert. */}
          <button
            onClick={disabled ? undefined : onSignOut}
            disabled={disabled}
            title={disabled ? "Disabled while previewing" : undefined}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-ink-secondary transition hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function PortalFooter({ tabHref }: { tabHref: (href: string) => string }) {
  return (
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 py-6 text-center md:flex-row md:justify-between md:gap-3 md:px-8 md:text-left">
          <p className="text-xs text-ink-muted">
            © {new Date().getFullYear()} Fragrance Marketing Group. All rights
            reserved.
          </p>
          <p className="text-xs text-ink-subtle">
            Rep Portal · Questions?{" "}
            <Link
              href={tabHref("/portal/contact")}
              className="underline underline-offset-2 hover:text-ink-secondary"
            >
              Contact us
            </Link>
          </p>
        </div>
      </footer>
  );
}
