"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Link from "next/link";
import { LogoMark } from "@/components/ui/Logo";

export default function ForgotPasswordPage() {
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !loading) {
      sendReset();
    }
  }

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-[1.05fr_minmax(420px,0.95fr)]">
      {/* ════════════════════════════════════════════════
          LEFT — the essence of FMG: scent, rising
          ════════════════════════════════════════════════ */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-brand-950 p-12 xl:p-16">
        {/* Deep navy wash */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-900 via-brand-950 to-[#061018]" />

        {/* Ambient brand glows */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-28 -left-24 h-[460px] w-[460px] rounded-full bg-brand-500/20 blur-3xl animate-[float_9s_ease-in-out_infinite]" />
          <div className="absolute top-1/3 -right-16 h-[380px] w-[380px] rounded-full bg-accent-500/10 blur-3xl animate-[float_12s_ease-in-out_3s_infinite_reverse]" />
          <div className="absolute -bottom-24 left-1/4 h-[340px] w-[340px] rounded-full bg-brand-400/12 blur-3xl animate-[float_11s_ease-in-out_5s_infinite]" />
        </div>

        {/* Rising scent ribbons — the signature of fragrance, drawn in gold */}
        <svg
          aria-hidden="true"
          viewBox="0 0 400 620"
          preserveAspectRatio="xMidYMax slice"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.55]"
        >
          <defs>
            <linearGradient id="scent" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="var(--color-accent-500)" stopOpacity="0" />
              <stop offset="0.35" stopColor="var(--color-accent-400)" stopOpacity="0.7" />
              <stop offset="0.7" stopColor="var(--color-accent-300)" stopOpacity="0.5" />
              <stop offset="1" stopColor="var(--color-accent-200)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <g fill="none" stroke="url(#scent)" strokeWidth="1.6" strokeLinecap="round">
            <path
              className="animate-[sway_7s_ease-in-out_infinite]"
              d="M118 620 C 64 500 184 452 112 332 S 60 184 134 44"
            />
            <path
              className="animate-[sway_9s_ease-in-out_1s_infinite_reverse]"
              d="M210 620 C 162 496 266 448 202 320 S 150 168 224 32"
            />
            <path
              className="animate-[sway_8s_ease-in-out_0.6s_infinite]"
              d="M300 620 C 252 508 356 460 288 328 S 236 172 312 48"
            />
          </g>
        </svg>

        {/* Floating scent particles */}
        <div className="pointer-events-none absolute inset-0">
          {[
            { left: "22%", bottom: "18%", size: 5, delay: "0s", dur: "9s" },
            { left: "54%", bottom: "12%", size: 4, delay: "1.4s", dur: "11s" },
            { left: "71%", bottom: "26%", size: 6, delay: "2.8s", dur: "10s" },
            { left: "38%", bottom: "30%", size: 3, delay: "0.8s", dur: "12s" },
            { left: "63%", bottom: "40%", size: 4, delay: "3.6s", dur: "9s" },
          ].map((p, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-accent-300/70 shadow-[0_0_12px_rgba(247,215,95,0.6)] animate-[rise_var(--dur)_ease-in-out_var(--delay)_infinite]"
              style={
                {
                  left: p.left,
                  bottom: p.bottom,
                  width: p.size,
                  height: p.size,
                  "--delay": p.delay,
                  "--dur": p.dur,
                } as React.CSSProperties
              }
            />
          ))}
        </div>

        {/* Brand lockup */}
        <div className="relative z-10 flex items-center gap-3">
          <LogoMark size={44} className="rounded-[13px] ring-1 ring-white/15 shadow-raised" />
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
            Fragrance Marketing Group
          </span>
        </div>

        {/* Headline */}
        <div className="relative z-10 max-w-md">
          <div className="mb-6 h-px w-14 bg-gradient-to-r from-accent-400 to-transparent" />
          <h2 className="text-4xl xl:text-[2.75rem] font-semibold leading-[1.1] tracking-tight text-white">
            Where scent
            <br />
            becomes a brand.
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-white/55">
            The house that crafts fragrance and body care, and markets it end
            to end — from the bench to the shelf.
          </p>
        </div>

        {/* House brands */}
        <div className="relative z-10 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.16em] text-white/40">
          <span>Natural Inspirations</span>
          <span className="h-1 w-1 rounded-full bg-accent-400/70" />
          <span>Sassy</span>
          <span className="h-1 w-1 rounded-full bg-accent-400/70" />
          <span className="text-white/30">&amp; the brands to come</span>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════
          RIGHT — reset password
          ════════════════════════════════════════════════ */}
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
                Reset your password
              </h1>
              <p className="mt-2 text-sm text-ink-muted">
                {sent
                  ? "Check your inbox for the link"
                  : "We'll email you a link to set a new one"}
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

              {error && (
                <p className="rounded-lg bg-critical-soft px-3 py-2 text-sm text-critical">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={sendReset}
                disabled={loading}
                className="w-full rounded-lg bg-brand-700 py-2.5 text-sm font-medium text-white hover:bg-brand-800 hover:shadow-raised active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </div>
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

      {/* Keyframes */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-30px) scale(1.05); }
        }
        @keyframes sway {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(14px); }
        }
        @keyframes rise {
          0%   { transform: translateY(0) scale(1); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 0.8; }
          100% { transform: translateY(-220px) scale(0.6); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="animate-"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
