"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

      // Small pause so the success state is visible
      setTimeout(() => {
        router.push("/auth/sign-in");
      }, 1500);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <div className="border border-gray-200 rounded-2xl p-6 space-y-5">
          <h1 className="text-xl font-semibold">Set a new password</h1>

          {success ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-700">
                Your password has been updated successfully.
              </p>
              <p className="text-xs text-gray-500">
                Redirecting you to sign in…
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Choose a new password for your account.
              </p>

              <input
                type="password"
                className="w-full rounded-xl border border-gray-300 px-3 py-2"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <input
                type="password"
                className="w-full rounded-xl border border-gray-300 px-3 py-2"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />

              {error && (
                <p className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                onClick={updatePassword}
                disabled={loading || verifying || !ready}
                className="w-full rounded-xl bg-orange-800 py-2 text-white hover:bg-orange-700 disabled:opacity-60"
              >
                {verifying
                  ? "Verifying link…"
                  : loading
                    ? "Updating…"
                    : "Update password"}
              </button>
            </>
          )}

          {/* Recovery / escape paths */}
          {!success && (
            <div className="pt-3 text-center space-y-2">
              <p className="text-sm text-gray-500">
                Remembered your password?{" "}
                <Link
                  href="/auth/sign-in"
                  className="underline hover:text-gray-900"
                >
                  Sign in
                </Link>
              </p>

              <p className="text-xs text-gray-400">
                Opened this by mistake? You can safely return to{" "}
                <Link
                  href="/auth/sign-in"
                  className="underline hover:text-gray-700"
                >
                  the sign-in page
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
