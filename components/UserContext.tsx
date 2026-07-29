"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/browser";

export type UserRole =
  | "owner"
  | "admin"
  | "user"
  | "sales"
  | "marketing"
  | "investor"
  // External independent sales reps. Isolated to /portal (no internal chrome);
  // scoped to their own agency via profiles.rep_agency_code.
  | "rep";

type UserProfile = {
  id: string;
  first_name: string;
  email: string;
  access: UserRole;
  /** Only set for access='rep': the sales agency this rep may view. */
  rep_agency_code?: number | null;
  /** Reserved for the deferred principals-see-everyone feature. */
  rep_is_principal?: boolean | null;
};

type UserContextValue = {
  profile: UserProfile | null;
  loading: boolean;
  reload: () => void;
};

const UserCtx = createContext<UserContextValue>({
  profile: null,
  loading: true,
  reload: () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch the profile row for a given auth user id. Uses the same browser
  // client instance that performs sign-in (lib/supabase/browser) so the
  // session/Authorization header are guaranteed to be in sync — the previous
  // split across two clients was why fresh sign-ins hung on the spinner.
  // Cast to the untyped client: the generated types/supabase.ts profiles Row
  // omits rep_agency_code / rep_is_principal, so a typed select would not compile.
  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const { data } = await (supabaseBrowser() as unknown as SupabaseClient)
      .from("profiles")
      .select("id, first_name, email, access, rep_agency_code, rep_is_principal")
      .eq("id", userId)
      .single();

    setProfile(data as UserProfile | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = supabaseBrowser();

    // Initial load (covers the already-authenticated first paint).
    supabase.auth.getUser().then(({ data }) => loadProfile(data.user?.id));

    // Reload whenever auth state changes — critically on SIGNED_IN after a
    // client-side sign-in navigation, which does not remount this provider.
    // Defer out of the callback with setTimeout(0): calling Supabase methods
    // synchronously inside onAuthStateChange can deadlock the auth lock.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id;
      setTimeout(() => loadProfile(userId), 0);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const reload = useCallback(() => {
    supabaseBrowser().auth.getUser().then(({ data }) => loadProfile(data.user?.id));
  }, [loadProfile]);

  return (
    <UserCtx.Provider value={{ profile, loading, reload }}>
      {children}
    </UserCtx.Provider>
  );
}

export function useUser() {
  return useContext(UserCtx);
}
