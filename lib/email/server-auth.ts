import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

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

export type AuthProfile = {
  id: string;
  email: string | null;
  access: string | null;
  rep_agency_code: number | null;
};

/**
 * Verify the caller's token AND load their profile (role + rep agency) via the
 * service-role client. Returns null if unauthenticated. Use as the basis for
 * the role guards below.
 */
export async function getAuthProfile(request: Request): Promise<AuthProfile | null> {
  const user = await getAuthUser(request);
  if (!user) return null;

  // Read the role (+ rep agency). The portal columns may not be migrated yet, so
  // fall back to the base columns if rep_agency_code is missing — otherwise every
  // internal route that uses these guards would fail until the migration is run.
  const full = await supabaseServer
    .from("profiles")
    .select("id, email, access, rep_agency_code")
    .eq("id", user.id)
    .maybeSingle();

  let row = full.data as
    | { id: string; email: string | null; access: string | null; rep_agency_code: number | null }
    | null;

  if (full.error && /rep_agency_code/i.test(full.error.message)) {
    const base = await supabaseServer
      .from("profiles")
      .select("id, email, access")
      .eq("id", user.id)
      .maybeSingle();
    const b = base.data as { id: string; email: string | null; access: string | null } | null;
    row = b ? { ...b, rep_agency_code: null } : null;
  }

  if (!row) return { id: user.id, email: user.email, access: null, rep_agency_code: null };
  return {
    id: row.id,
    email: row.email ?? user.email,
    access: row.access ?? null,
    rep_agency_code: row.rep_agency_code ?? null,
  };
}

/**
 * Guard for INTERNAL-only API routes. Returns the profile for a signed-in team
 * member, or null for anonymous callers AND external reps (access='rep').
 * External reps must never reach internal endpoints, which run with the
 * service-role key and would otherwise expose all-agency data.
 */
export async function requireInternalUser(request: Request): Promise<AuthProfile | null> {
  const profile = await getAuthProfile(request);
  if (!profile || profile.access === "rep" || profile.access === null) return null;
  return profile;
}

/**
 * Is this email address a fully-provisioned INTERNAL FMG team member?
 *
 * Used by the Slack assistant, which has no Supabase session to guard — it
 * resolves the Slack user's verified email and must decide whether to answer.
 * The rule mirrors `requireInternalUser`: a profile must exist with a non-null
 * access role that is NOT 'rep'. Anyone without a matching internal profile
 * (external reps, unknown addresses) is rejected. Email match is
 * case-insensitive; a blank/absent email is never internal.
 */
export async function isInternalEmail(email: string | null | undefined): Promise<boolean> {
  const clean = (email ?? "").trim().toLowerCase();
  if (!clean) return false;

  const { data, error } = await supabaseServer
    .from("profiles")
    .select("access")
    .ilike("email", clean)
    .maybeSingle();

  if (error || !data) return false;
  const access = (data as { access: string | null }).access;
  return access != null && access !== "rep";
}

/**
 * Guard for the rep PORTAL API routes. Returns the rep's id + agency code, or
 * null unless the caller is a fully-provisioned rep (access='rep' with an
 * agency assigned). The agency code comes from the profile — NEVER from the
 * request — so a rep can only ever see their own agency.
 */
export async function requireRep(
  request: Request,
): Promise<{ id: string; agencyCode: number } | null> {
  const profile = await getAuthProfile(request);
  if (!profile || profile.access !== "rep" || profile.rep_agency_code == null) return null;
  return { id: profile.id, agencyCode: profile.rep_agency_code };
}

/**
 * Resolve WHICH agency's portal data to serve — the single, deliberate
 * exception to the profile-only rule above.
 *
 * - A provisioned rep always gets their own agency from their profile. Any
 *   ?agencyCode= they send is ignored outright, so the isolation boundary in
 *   `requireRep` is unchanged for every real portal user.
 * - An internal OWNER or ADMIN may pass ?agencyCode= to preview a rep's view
 *   from Team → Rep Portal Preview. This grants no new data: those two roles
 *   already read every agency's customers through the internal endpoints. It
 *   only re-slices what they can already see, so support can answer "what does
 *   this rep actually see?".
 *
 * Note the ordering — the rep branch is checked FIRST and returns before the
 * request is ever consulted. Everyone else (viewers, sales, marketing,
 * anonymous) gets null.
 */
export async function resolvePortalAgency(
  request: Request,
): Promise<{ agencyCode: number; preview: boolean } | null> {
  const profile = await getAuthProfile(request);
  if (!profile) return null;

  if (profile.access === "rep") {
    if (profile.rep_agency_code == null) return null;
    return { agencyCode: profile.rep_agency_code, preview: false };
  }

  if (profile.access !== "owner" && profile.access !== "admin") return null;

  const raw = new URL(request.url).searchParams.get("agencyCode");
  const code = Number(raw);
  if (!raw || !Number.isInteger(code)) return null;

  return { agencyCode: code, preview: true };
}
