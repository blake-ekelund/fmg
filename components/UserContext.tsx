"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export type UserRole = "owner" | "admin" | "user" | "sales" | "marketing" | "investor";

type UserProfile = {
  id: string;
  first_name: string;
  email: string;
  access: UserRole;
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

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, email, access")
      .eq("id", user.id)
      .single();

    setProfile(data as UserProfile | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <UserCtx.Provider value={{ profile, loading, reload: load }}>
      {children}
    </UserCtx.Provider>
  );
}

export function useUser() {
  return useContext(UserCtx);
}
