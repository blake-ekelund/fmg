"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { UserRole } from "./UserContext";
import { getDefaultRoute } from "./navConfig";

export default function AuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const pathname = usePathname();

  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const isAuthRoute = pathname.startsWith("/auth");

      // Not signed in → must be on auth pages
      if (!session && !isAuthRoute) {
        router.replace("/auth/sign-in");
        return;
      }

      // Signed in → should not be on auth pages
      if (session && isAuthRoute) {
        // Fetch role to determine correct landing page
        const { data: profile } = await supabase
          .from("profiles")
          .select("access")
          .eq("id", session.user.id)
          .single();

        const row = profile as { access: string } | null;
        const role = (row?.access ?? "user") as UserRole;
        router.replace(getDefaultRoute(role));
        return;
      }

      setChecked(true);
    }

    checkAuth();
  }, [pathname, router, supabase]);

  // Block render until auth is resolved
  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
