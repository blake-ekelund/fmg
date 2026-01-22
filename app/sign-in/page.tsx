"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignInPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 🔍 CLIENT-ONLY LOGGING
  useEffect(() => {
    console.log("[SIGN-IN] location.href:", window.location.href);
    console.log("[SIGN-IN] location.hash:", window.location.hash);

    supabase.auth.getSession().then(({ data, error }) => {
      console.log("[SIGN-IN] getSession() error:", error);
      console.log("[SIGN-IN] getSession() data:", data);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[AUTH EVENT]", event);
        console.log("[SESSION]", session);
      }
    );

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signIn() {
    console.log("[SIGN-IN] Attempting password login:", email);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log("[SIGN-IN] signInWithPassword data:", data);
    console.log("[SIGN-IN] signInWithPassword error:", error);

    if (error) {
      setError(error.message);
      return;
    }

    console.log("[SIGN-IN] Password login successful → /");
    router.replace("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-xl p-8">
        <h1 className="text-xl font-semibold">Sign in</h1>

        <input
          className="mt-6 w-full border rounded-lg px-3 py-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="mt-4 w-full border rounded-lg px-3 py-2"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={signIn}
          className="mt-4 w-full bg-black text-white rounded-lg py-2"
        >
          Sign in
        </button>

        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}
      </div>
    </main>
  );
}
