"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { getDefaultRoute } from "@/components/navConfig";
import { LogoMark } from "@/components/ui/Logo";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import type { UserRole } from "@/components/UserContext";

export default function SignInPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Fetch role to redirect to the correct landing page
    const { data: profile } = await supabase
      .from("profiles")
      .select("access")
      .eq("id", data.user.id)
      .single();

    const row = profile as { access: string } | null;
    const role = (row?.access ?? "user") as UserRole;
    router.replace(getDefaultRoute(role));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !loading) {
      signIn();
    }
  }

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-[1.05fr_minmax(420px,0.95fr)]">
      {/* LEFT — catalog lifestyle photography + FMG lockup */}
      <AuthBrandPanel />

      {/* RIGHT — sign in */}
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-muted px-5 py-12 lg:min-h-0">
        {/* Soft brand wash on the mobile view (no left panel there) */}
        <div className="pointer-events-none absolute inset-0 lg:hidden">
          <div className="absolute -top-24 right-0 h-[320px] w-[320px] rounded-full bg-brand-500/10 blur-3xl" />
          <div className="absolute bottom-0 -left-16 h-[280px] w-[280px] rounded-full bg-accent-500/8 blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-sm">
          {/* Mobile-only brand lockup (desktop identity lives on the left panel) */}
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <LogoMark size={40} className="rounded-[12px] ring-1 ring-line shadow-raised" />
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              Fragrance Marketing Group
            </span>
          </div>

          {/* Form card */}
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-overlay sm:p-7">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">
                Welcome back
              </h1>
              <p className="mt-2 text-sm text-ink-muted">Sign in to the internal portal</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-xs font-medium text-ink-secondary">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-400 transition"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-xs font-medium text-ink-secondary">
                    Password
                  </label>
                  <a
                    href="/auth/forgot-password"
                    className="text-xs text-ink-muted hover:text-brand-700 transition"
                  >
                    Forgot?
                  </a>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="w-full rounded-lg border border-line bg-surface pl-3 pr-10 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-400 transition"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-subtle hover:text-ink-secondary transition"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-lg bg-critical-soft px-3 py-2 text-sm text-critical">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={signIn}
                disabled={loading}
                className="w-full rounded-lg bg-brand-700 py-2.5 text-sm font-medium text-white hover:bg-brand-800 hover:shadow-raised active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </div>
          </div>

          {/* External link */}
          <div className="mt-8 text-center">
            <a
              href="https://naturalinspirations.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-ink-subtle hover:text-brand-700 transition"
            >
              naturalinspirations.com &rarr;
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
