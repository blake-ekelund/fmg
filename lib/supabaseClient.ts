import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// NOTE: Previously untyped — the actual DB may have additional tables/columns
// not yet captured in types/supabase.ts. To regenerate, run: supabase gen types typescript
export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);
