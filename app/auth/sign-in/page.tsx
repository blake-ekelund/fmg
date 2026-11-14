"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
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

  useEffect(() => {
    document.title = "Sign in · FMG Portal";
  }, []);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loading) signIn();
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
          {/* Form card */}
          <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-7 shadow-[0_28px_70px_-28px_rgba(10,27,39,0.5)]">
            {/* Gold hairline accent */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-accent-400 via-accent-500 to-transparent" />

            <div className="mb-7">
              <div className="mb-5 flex items-center gap-2.5">
                <LogoMark size={34} className="rounded-[10px] ring-1 ring-line shadow-raised" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-600">
                  Internal Portal
                </span>
              </div>
              <h1 className="text-[1.7rem] leading-tight font-semibold tracking-tight text-ink">
                Welcome back
              </h1>
              <p className="mt-1.5 text-sm text-ink-muted">
                Sign in to continue to your dashboard.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-xs font-medium text-ink-secondary">
                  Email
                </label>
                <div className="relative">
                  <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    aria-describedby={error ? "signin-error" : undefined}
                    className="w-full rounded-lg border border-line bg-surface pl-9 pr-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-400 transition"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
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
                  <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    aria-describedby={error ? "signin-error" : undefined}
                    className="w-full rounded-lg border border-line bg-surface pl-9 pr-10 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-400 transition"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                <p
                  id="signin-error"
                  role="alert"
                  className="rounded-lg bg-critical-soft px-3 py-2 text-sm text-critical"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full rounded-lg bg-brand-700 py-2.5 text-sm font-medium text-white shadow-[0_12px_28px_-12px_rgba(27,60,83,0.7)] hover:bg-brand-800 hover:shadow-[0_16px_34px_-12px_rgba(27,60,83,0.85)] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
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
