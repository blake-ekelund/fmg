"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useUser } from "@/components/UserContext";
import { getDefaultRoute } from "@/components/navConfig";

const TABS = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/customers", label: "My Customers" },
  { href: "/portal/assets", label: "Brand Assets" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  // Guard: only provisioned reps belong here. Internal users get sent to their
  // own landing page; signed-out users fall through to AuthGate → sign-in.
  useEffect(() => {
    if (loading || !profile) return;
    if (profile.access !== "rep") {
      router.replace(getDefaultRoute(profile.access));
    }
  }, [loading, profile, router]);

  if (loading || !profile || profile.access !== "rep") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/auth/sign-in");
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-sm font-bold text-white">
              F
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Rep Portal</div>
              <div className="text-xs text-gray-500">Fragrance Marketing Group</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-gray-600 sm:inline">
              Hi, {profile.first_name || "there"}
            </span>
            <button
              onClick={signOut}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
            >
              Sign out
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 px-2 md:px-6">
          {TABS.map((t) => {
            const active = t.href === "/portal" ? pathname === "/portal" : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-800"
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
