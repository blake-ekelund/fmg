"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type RepGroupRow = {
  id: string;
  name: string;
  contact_name: string;
  territory: string;
  commission_pct: number;
};

export function useDashboardRepGroups() {
  const [groups, setGroups] = useState<RepGroupRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("rep_groups")
        .select("id, name, contact_name, territory, commission_pct")
        .order("name");

      setGroups((data as RepGroupRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return { groups, loading };
}
