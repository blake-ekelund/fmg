"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Result =
  | { state: "loading" }
  | { state: "no-account" }
  | { state: "ready"; accountId: string };

/**
 * Resolve the current portal user's user_email_accounts.id. Returns "no-account"
 * if they haven't connected Outlook (or have disconnected it).
 *
 * The email tables use RLS that includes a separate "admin" override for owners
 * and admins — which means without an explicit account_id filter the inbox
 * would show every user's mailbox. Components that should be scoped to "my
 * mailbox" should consult this hook and apply .eq("account_id", id) to their
 * queries.
 */
export function useMyEmailAccountId(): Result {
  const [result, setResult] = useState<Result>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabaseBrowser();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        if (!cancelled) setResult({ state: "no-account" });
        return;
      }

      const { data } = await supabase
        .from("user_email_accounts")
        .select("id, status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (!data || data.status === "disconnected") {
        setResult({ state: "no-account" });
        return;
      }
      setResult({ state: "ready", accountId: data.id as string });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return result;
}
