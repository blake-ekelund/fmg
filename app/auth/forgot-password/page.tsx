"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Link from "next/link";

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <div className="border border-gray-200 rounded-2xl p-6 space-y-5">
          <h1 className="text-xl font-semibold">Forgot your password?</h1>

          {sent ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                If an account exists for <span className="font-medium">{email}</span>,
                a password reset link will be sent.
              </p>

              <p className="text-xs text-gray-500">
                Check your inbox and spam folder. The link will expire after a short time.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Enter your email address and we’ll send you a link to reset your password.
              </p>

              <input
                type="email"
                className="w-full rounded-xl border border-gray-300 px-3 py-2"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              {error && (
                <p className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                onClick={sendReset}
                disabled={loading}
                className="w-full rounded-xl bg-orange-800 py-2 text-white hover:bg-orange-700 disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </>
          )}

          {/* Recovery paths */}
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
          </div>
        </div>
      </div>
    </div>
  );
}
