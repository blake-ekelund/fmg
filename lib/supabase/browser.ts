import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

export type TypedSupabaseClient = SupabaseClient<Database>;

declare global {
  // eslint-disable-next-line no-var
  var __supabase: TypedSupabaseClient | undefined;
}

export function supabaseBrowser(): TypedSupabaseClient {
  if (!globalThis.__supabase) {
    globalThis.__supabase = createClient<Database>(
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
