"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { getDefaultRoute } from "@/components/navConfig";
import { LogoMark } from "@/components/ui/Logo";
import type { UserRole } from "@/components/UserContext";

export default function SignInPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-brand-950">
      {/* Brand-tinted ambient wash */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-[460px] w-[460px] rounded-full bg-brand-500/25 blur-3xl animate-[float_8s_ease-in-out_infinite]" />
        <div className="absolute top-1/2 -right-24 h-[380px] w-[380px] rounded-full bg-accent-500/12 blur-3xl animate-[float_10s_ease-in-out_2s_infinite_reverse]" />
        <div className="absolute -bottom-20 left-1/3 h-[320px] w-[320px] rounded-full bg-brand-400/15 blur-3xl animate-[float_12s_ease-in-out_4s_infinite]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-8">
          <LogoMark size={52} className="mb-5 rounded-[15px] ring-1 ring-white/15 shadow-raised" />
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Fragrance Marketing Group
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Sign in to the internal portal
          </p>
        </div>

        <div className="bg-white/95 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4 shadow-overlay">
          <div className="space-y-1">
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

          <div className="space-y-1">
            <label htmlFor="password" className="block text-xs font-medium text-ink-secondary">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-400 transition"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            onClick={signIn}
            disabled={loading}
            className="w-full rounded-lg bg-brand-700 py-2.5 text-sm font-medium text-white hover:bg-brand-800 hover:shadow-raised active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="text-center">
            <a
              href="/auth/forgot-password"
              className="text-sm text-ink-muted hover:text-brand-700 transition"
            >
              Forgot password?
            </a>
          </div>
        </div>

        {/* External link */}
        <div className="mt-6 text-center">
          <a
            href="https://naturalinspirations.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-white/40 hover:text-white/70 transition"
          >
            naturalinspirations.com &rarr;
          </a>
        </div>
      </div>

      {/* Keyframe for floating blobs */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-30px) scale(1.05); }
        }
      `}</style>
    </div>
  );
}
