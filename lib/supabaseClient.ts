import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Intentionally untyped — the manually-maintained types/supabase.ts schema
// doesn't fully satisfy the generic constraints of @supabase/supabase-js v2.91+.
// The typed client (lib/supabase/browser.ts) is used for auth; this one is for data queries.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
