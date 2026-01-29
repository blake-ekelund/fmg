"use client";

import { useState } from "react";
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
                disabled={loading}
                className="w-full rounded-xl bg-orange-800 py-2 text-white hover:bg-orange-700 disabled:opacity-60"
              >
                {loading ? "Updating…" : "Update password"}
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
