"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Lock, Mail } from "lucide-react";
import { motion } from "framer-motion";

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
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    setStatus(
      error
        ? error.message
        : "Check your email for a secure sign-in link."
    );
  }

  return (
    <main className="min-h-screen grid md:grid-cols-2">
      {/* Left panel */}
      <div className="hidden md:flex flex-col justify-center px-16 bg-slate-900 text-white">
        <h1 className="text-4xl font-semibold leading-tight">
          Fragrance Marketing Group
        </h1>
        <p className="mt-6 text-lg opacity-80 max-w-md">
          Secure internal access to dashboards, KPIs, and operational insight.
        </p>
      </div>

      {/* Right panel */}
      <div className="flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md border rounded-2xl p-8 shadow-sm bg-white"
        >
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-5 h-5 text-gray-500" />
            <h2 className="text-xl font-semibold">Sign in</h2>
          </div>

          <label className="block text-sm font-medium">Work email</label>
          <div className="mt-2 relative">
            <Mail className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <input
              className="w-full border rounded-xl pl-9 pr-3 py-2"
              placeholder="you@fragrance-marketing-group.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <button
            onClick={sendLink}
            disabled={loading || !email}
            className="mt-6 w-full rounded-xl px-3 py-2 bg-black text-white disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send secure sign-in link"}
          </button>

          {status && (
            <p className="mt-4 text-sm text-gray-600">{status}</p>
          )}
        </motion.div>
      </div>
    </main>
  );
}
