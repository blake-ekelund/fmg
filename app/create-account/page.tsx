"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateAccountPage() {
  const supabase = createClient();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createAccount() {
    setLoading(true);
    setError(null);

    // User is already authenticated via invite
    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Supabase automatically promotes session → full login
    router.replace("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-xl p-8">
        <h1 className="text-xl font-semibold">Create your account</h1>
        <p className="mt-2 text-sm text-gray-600">
          Set a password to finish creating your account.
        </p>

        <input
          type="password"
          className="mt-6 w-full border rounded-lg px-3 py-2"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={createAccount}
          disabled={loading || password.length < 8}
          className="mt-4 w-full bg-black text-white rounded-lg py-2"
        >
          {loading ? "Creating…" : "Create account"}
        </button>

        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}
      </div>
    </main>
  );
}
