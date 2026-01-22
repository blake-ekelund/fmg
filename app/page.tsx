"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignInPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendLink() {
    setLoading(true);
    setStatus(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setLoading(false);
    setStatus(error ? error.message : "Check your email for the sign-in link.");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-2xl p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">FMG Portal</h1>
        <p className="mt-2 text-sm opacity-70">
          Sign in to access company KPIs and dashboards.
        </p>

        <label className="block mt-6 text-sm font-medium">Email</label>
        <input
          className="mt-2 w-full border rounded-xl px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@fragrance-marketing-group.com"
        />

        <button
          className="mt-4 w-full rounded-xl px-3 py-2 border"
          onClick={sendLink}
          disabled={loading || !email}
        >
          {loading ? "Sending..." : "Send sign-in link"}
        </button>

        {status && <p className="mt-4 text-sm">{status}</p>}
      </div>
    </main>
  );
}
