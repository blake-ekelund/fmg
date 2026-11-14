"use client";

import { useState, useEffect } from "react";
import { Mail } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Link from "next/link";
import { LogoMark } from "@/components/ui/Logo";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";

export default function ForgotPasswordPage() {
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Reset password · FMG Portal";
  }, []);

  async function sendReset() {
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loading) sendReset();
  }

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-[1.05fr_minmax(420px,0.95fr)]">
      {/* LEFT — catalog lifestyle photography + FMG lockup */}
      <AuthBrandPanel />

      {/* RIGHT — reset password */}
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
                  Password Reset
                </span>
              </div>
              <h1 className="text-[1.7rem] leading-tight font-semibold tracking-tight text-ink">
                Reset your password
              </h1>
              <p className="mt-1.5 text-sm text-ink-muted">
                {sent
                  ? "Check your inbox for the link."
                  : "We'll email you a link to set a new one."}
              </p>
            </div>

            {sent ? (
              <div className="space-y-3 rounded-xl border border-line bg-surface-muted p-4">
                <p className="text-sm text-ink-secondary">
                  If an account exists for{" "}
                  <span className="font-medium text-ink">{email}</span>, a password
                  reset link will be sent.
                </p>
                <p className="text-xs text-ink-muted">
                  Check your inbox and spam folder. The link will expire after a
                  short time.
                </p>
              </div>
            ) : (
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
                      aria-describedby={error ? "reset-error" : undefined}
                      className="w-full rounded-lg border border-line bg-surface pl-9 pr-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-400 transition"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                {error && (
                  <p
                    id="reset-error"
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
                  {loading ? "Sending…" : "Send reset link"}
                </button>
              </form>
            )}

            <div className="mt-6 text-center">
              <Link
                href="/auth/sign-in"
                className="text-sm text-ink-muted hover:text-brand-700 transition"
              >
                Remembered your password? Sign in
              </Link>
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
