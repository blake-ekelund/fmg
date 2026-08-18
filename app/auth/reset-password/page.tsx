"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/ui/Logo";

export default function ResetPasswordPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  /** Exchanging the token_hash for a session — the form stays locked until this
   *  finishes, so a fast submit can't fire updateUser() before we have a
   *  session ("Auth session missing!"). */
  const [verifying, setVerifying] = useState(false);
  /** Session established (token verified, or legacy hash flow) → safe to save. */
  const [ready, setReady] = useState(false);

  // Token-hash flow: the recovery email links straight to our own domain with
  // ?token_hash=…&type=recovery (so the clickable link is app.fragrance…, not
  // supabase.co). Exchange it for a session on load so updateUser() works. The
  // legacy hash flow (session already in the URL) still works untouched.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    if (!tokenHash || !type) {
      // No token in the URL → legacy hash flow (session set by the client) or a
      // page open with an existing session. Let the form through.
      setReady(true);
      return;
    }
    setVerifying(true);
    supabase.auth
      .verifyOtp({ type: type as "recovery", token_hash: tokenHash })
      .then(({ error }) => {
        if (error) {
          setError(
            "This reset link is invalid or has expired — request a new one from the forgot-password page."
          );
        } else {
          setReady(true);
        }
        // Drop the token from the URL so a refresh/back can't replay it.
        window.history.replaceState({}, "", "/auth/reset-password");
      })
      .finally(() => setVerifying(false));
    // supabase client is stable for the page's lifetime; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updatePassword() {
    setError(null);

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => router.push("/auth/sign-in"), 1500);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !loading && !verifying && ready) updatePassword();
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
          <p className="mt-2 text-sm text-white/50">Set a new password</p>
        </div>

        <div className="bg-white/95 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4 shadow-overlay">
          {success ? (
            <div className="space-y-2 text-center py-2">
              <p className="text-sm font-medium text-ink">
                Your password has been updated.
              </p>
              <p className="text-xs text-ink-muted">Redirecting you to sign in…</p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label htmlFor="password" className="block text-xs font-medium text-ink-secondary">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-400 transition"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="confirm" className="block text-xs font-medium text-ink-secondary">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-400 transition"
                  placeholder="Re-enter your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                onClick={updatePassword}
                disabled={loading || verifying || !ready}
                className="w-full rounded-lg bg-brand-700 py-2.5 text-sm font-medium text-white hover:bg-brand-800 hover:shadow-raised active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {verifying ? "Verifying link…" : loading ? "Updating…" : "Update password"}
              </button>

              <div className="text-center">
                <a
                  href="/auth/sign-in"
                  className="text-sm text-ink-muted hover:text-brand-700 transition"
                >
                  Back to sign in
                </a>
              </div>
            </>
          )}
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
