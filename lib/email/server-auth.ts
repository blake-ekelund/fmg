import { createClient } from "@supabase/supabase-js";

/**
 * Validate the Supabase access token from a request's Authorization header and
 * return the authenticated user, or null if the token is missing/invalid.
 *
 * The browser passes its current session token in the `Authorization: Bearer …`
 * header on calls to our API routes. We hand that token to Supabase to verify
 * it server-side (cheap — same as any other Supabase auth call).
 */
export async function getAuthUser(
  request: Request,
): Promise<{ id: string; email: string | null } | null> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
