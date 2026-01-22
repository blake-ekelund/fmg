"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const supabase = createClient();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function updatePassword() {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Password updated + session upgraded
    router.replace("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-xl p-8">
        <h1 className="text-xl font-semibold">Set new password</h1>

        <input
          type="password"
          className="mt-6 w-full border rounded-lg px-3 py-2"
          placeholder="New password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={updatePassword}
          disabled={password.length < 8 || loading}
          className="mt-4 w-full bg-black text-white rounded-lg py-2"
        >
          {loading ? "Saving…" : "Update password"}
        </button>

        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}
      </div>
    </main>
  );
}
