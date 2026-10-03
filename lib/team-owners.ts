"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Task ownership is stored as a free-form string (currently matching the user's
 * first_name from the profiles table). This hook + helpers centralize that
 * mapping so we don't keep hardcoding team rosters in every form.
 *
 * Known limitation: if a user renames themselves, existing tasks keep the old
 * string and become unfilterable from the new pill. Fixing that means storing
 * owner_id (FK to profiles) instead of a string — a real schema change, out of
 * scope here.
 */

const COLOR_PALETTE = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-emerald-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-fuchsia-500",
  "bg-indigo-500",
  "bg-teal-500",
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h * 31) + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Deterministic background color for an owner name (stable across renders). */
export function getOwnerColor(name: string | null | undefined): string {
  if (!name) return "bg-gray-400";
  return COLOR_PALETTE[hashName(name) % COLOR_PALETTE.length];
}

type ProfileRow = { first_name: string | null; access: string | null };

/**
 * Returns the list of selectable owner names — one per team member: a profile
 * with a staff role (not an external rep, not role-less) AND a first name.
 * Nameless accounts (sign-ups / subscribers that only have an email) used to
 * show up as their email's local part; they aren't teammates, so they're out.
 */
export function useTeamOwners() {
  const [owners, setOwners] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, access")
        .order("first_name", { ascending: true });
      if (cancelled) return;
      const names = ((data ?? []) as ProfileRow[])
        .filter((r) => !!r.access && r.access !== "rep")
        .map((r) => r.first_name?.trim() || null)
        .filter((n): n is string => !!n);
      setOwners(Array.from(new Set(names)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { owners, loading };
}
