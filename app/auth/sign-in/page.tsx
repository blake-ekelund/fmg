"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { getDefaultRoute } from "@/components/navConfig";
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
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-[#fafafa]">
      {/* Animated gradient blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full bg-amber-200/40 blur-3xl animate-[float_8s_ease-in-out_infinite]" />
        <div className="absolute top-1/2 -right-24 h-[360px] w-[360px] rounded-full bg-rose-200/30 blur-3xl animate-[float_10s_ease-in-out_2s_infinite_reverse]" />
        <div className="absolute -bottom-20 left-1/3 h-[300px] w-[300px] rounded-full bg-violet-200/25 blur-3xl animate-[float_12s_ease-in-out_4s_infinite]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-900 text-white text-xl font-bold mb-4 shadow-lg">
            F
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Fragrance Marketing Group
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Sign in to your workspace
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl p-6 space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
          <div className="space-y-1">
            <label htmlFor="email" className="block text-xs font-medium text-gray-600">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="w-full rounded-lg border border-gray-200 bg-white/70 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-xs font-medium text-gray-600">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="w-full rounded-lg border border-gray-200 bg-white/70 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="button"
            onClick={signIn}
            disabled={loading}
            className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-700 hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="text-center">
            <a
              href="/auth/forgot-password"
              className="text-sm text-gray-400 hover:text-gray-900 transition"
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
            className="text-sm text-gray-400 hover:text-gray-600 transition"
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
