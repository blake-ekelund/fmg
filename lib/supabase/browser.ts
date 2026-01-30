// lib/supabase/browser.ts
import { createClient } from "@supabase/supabase-js";

declare global {
  // eslint-disable-next-line no-var
  var __supabase: ReturnType<typeof createClient> | undefined;
}

export function supabaseBrowser() {
  if (!globalThis.__supabase) {
    globalThis.__supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
  }

  return globalThis.__supabase;
}
