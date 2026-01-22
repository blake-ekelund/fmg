"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function updatePassword() {
    const { error } = await supabase.auth.updateUser({ password });
    setStatus(error ? error.message : "Password updated. You may sign in.");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-2xl p-8">
        <h1 className="text-xl font-semibold">Set new password</h1>

        <input
          type="password"
          className="mt-6 w-full border rounded-xl px-3 py-2"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={updatePassword}
          className="mt-4 w-full bg-black text-white rounded-xl py-2"
        >
          Update password
        </button>

        {status && (
          <p className="mt-4 text-sm text-gray-600">{status}</p>
        )}
      </div>
    </main>
  );
}
