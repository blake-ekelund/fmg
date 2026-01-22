import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  );

  // 🔍 DEBUG: log auth state changes
  client.auth.onAuthStateChange((event, session) => {
    console.log("[AUTH EVENT]", event);
    console.log("[SESSION]", session);
  });

  return client;
}
