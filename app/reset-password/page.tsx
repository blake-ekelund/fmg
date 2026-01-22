"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function sendReset() {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/reset-password/update`,
    });

    setStatus(
      error ? error.message : "Check your email for a password reset link."
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-2xl p-8">
        <h1 className="text-xl font-semibold">Reset password</h1>

        <input
          className="mt-6 w-full border rounded-xl px-3 py-2"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button
          onClick={sendReset}
          className="mt-4 w-full bg-black text-white rounded-xl py-2"
        >
          Send reset link
        </button>

        {status && (
          <p className="mt-4 text-sm text-gray-600">{status}</p>
        )}
      </div>
    </main>
  );
}
