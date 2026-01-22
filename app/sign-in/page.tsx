"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Lock, Mail } from "lucide-react";
import { motion } from "framer-motion";

export default function SignInPage() {
  const supabase = createClient();
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

    if (error) {
      setError(error.message);
      return;
    }

    // Let middleware handle auth state; client just navigates
    router.replace("/");
  }

  return (
    <main className="min-h-screen grid md:grid-cols-2">
      {/* Left panel */}
      <div className="hidden md:flex flex-col justify-center px-16 bg-slate-900 text-white">
        <h1 className="text-4xl font-semibold">
          Fragrance Marketing Group
        </h1>
        <p className="mt-6 text-lg opacity-80 max-w-md">
          Secure internal access to dashboards, KPIs, and operations.
        </p>
      </div>

      {/* Right panel */}
      <div className="flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md border rounded-2xl p-8 bg-white shadow-sm"
        >
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-5 h-5 text-gray-500" />
            <h2 className="text-xl font-semibold">Sign in</h2>
          </div>

          <label className="block text-sm font-medium">Email</label>
          <div className="mt-2 relative">
            <Mail className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <input
              type="email"
              autoComplete="email"
              className="w-full border rounded-xl pl-9 pr-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <label className="block mt-4 text-sm font-medium">Password</label>
          <input
            type="password"
            autoComplete="current-password"
            className="mt-2 w-full border rounded-xl px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={signIn}
            disabled={loading || !email || !password}
            className="mt-6 w-full rounded-xl px-3 py-2 bg-black text-white disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="mt-4 flex justify-between text-sm">
            <a
              href="/reset-password"
              className="text-gray-600 hover:underline"
            >
              Forgot password?
            </a>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-600">
              {error}
            </p>
          )}
        </motion.div>
      </div>
    </main>
  );
}
