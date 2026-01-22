"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSetPassword() {
    setLoading(true);
    setError(null);

    // 1️⃣ Set password in Supabase Auth
    const { error: authError } =
      await supabase.auth.updateUser({ password });

    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    // 2️⃣ Mark password as set in profiles table
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from("profiles")
        .update({ has_password: true })
        .eq("id", user.id);
    }

    setLoading(false);
    router.replace("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-2xl p-8 bg-white shadow-sm">
        <h1 className="text-xl font-semibold">Set your password</h1>
        <p className="mt-2 text-sm text-gray-600">
          This password will be used for future sign-ins.
        </p>

        <input
          type="password"
          className="mt-6 w-full border rounded-xl px-3 py-2"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleSetPassword}
          disabled={loading || password.length < 8}
          className="mt-4 w-full bg-black text-white rounded-xl py-2 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Set password"}
        </button>

        {error && (
          <p className="mt-4 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
