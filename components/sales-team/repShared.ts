import { supabaseBrowser } from "@/lib/supabase/browser";
import { SALES_REPS, type SalesRep } from "./reps";

/** Bearer header for the /api/sales-reps + /api/portal routes. */
export async function authHeader(): Promise<Record<string, string>> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Map a DB row (snake_case) to the SalesRep shape the UI uses. */
export function fromRow(r: Record<string, unknown>): SalesRep {
  return {
    id: r.id as string,
    agencyCode: (r.agency_code as number) ?? 0,
    agency: (r.agency as string) ?? "",
    name: (r.name as string) ?? "",
    email: (r.email as string) ?? "",
    phone: (r.phone as string) ?? "",
    address: (r.address as string) ?? "",
    city: (r.city as string) ?? "",
    state: (r.state as string) ?? "",
    zip: (r.zip as string) ?? "",
    territory: (r.territory as string) ?? "",
    samples: (r.samples as string) ?? "",
  };
}

/**
 * Fallback roster used until the sales_reps migration is pushed. Rows get a
 * stable synthetic id so they can still be linked to and rendered on a detail
 * page — they're just read-only (no edit, no portal invite).
 */
export const SEED_REPS: SalesRep[] = SALES_REPS.map((r, i) => ({ ...r, id: `seed-${i}` }));

export const isSeed = (rep: SalesRep) => !rep.id || rep.id.startsWith("seed-");

/** Load the roster, falling back to the built-in one when the table is absent. */
export async function loadReps(): Promise<{ reps: SalesRep[]; readOnly: boolean }> {
  const res = await fetch("/api/sales-reps", { headers: await authHeader() });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Failed to load (${res.status})`);
  if (json.notReady) return { reps: SEED_REPS, readOnly: true };
  return { reps: (json.reps as Record<string, unknown>[]).map(fromRow), readOnly: false };
}

/** Up to two initials, e.g. "Carol Seward Paltsios" → "CP". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

/**
 * Stable per-agency tint so a scanning eye can group rows without reading the
 * agency column. All five stay inside the brand family — this is a grouping
 * cue, not a status color.
 */
const TINTS = [
  "bg-brand-100 text-brand-700",
  "bg-accent-100 text-accent-700",
  "bg-brand-700 text-white",
  "bg-surface-sunken text-ink-secondary",
  "bg-brand-200 text-brand-800",
] as const;

export function agencyTint(rep: Pick<SalesRep, "agencyCode" | "agency">): string {
  const seed = rep.agencyCode || [...rep.agency].reduce((a, c) => a + c.charCodeAt(0), 0);
  return TINTS[Math.abs(seed) % TINTS.length];
}

/** "Chanhassen, MN" — empty string when neither is on file. */
export function location(rep: SalesRep): string {
  return [rep.city, rep.state].filter(Boolean).join(", ");
}
