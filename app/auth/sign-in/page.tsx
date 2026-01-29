"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) setError(error.message);
    else router.push("/workspace");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">

        <div className="border border-gray-200 rounded-2xl p-6 space-y-5">
          <h1 className="text-xl font-semibold">Sign in</h1>

          <input
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={signIn}
            disabled={loading}
            className="w-full rounded-xl bg-orange-800 py-2 text-white hover:bg-orange-700"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="flex justify-between text-sm text-gray-500">
            <a href="/auth/sign-up" className="hover:text-gray-900">
              Create account
            </a>
            <a href="/auth/forgot-password" className="hover:text-gray-900">
              Forgot password?
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
