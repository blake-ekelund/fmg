import { supabaseBrowser } from "@/lib/supabase/browser";
import type { SiteBrand } from "@/lib/site/registry";

/** One page's publish state, from GET /api/site-pages/<brand>. */
export type PageStatus = {
  slug: string;
  publishedAt: string | null;
  updatedAt: string | null;
  unpublished: boolean;
  /** The draft on the store (signed), for thumbnails. Null without the store key. */
  previewUrl?: string | null;
};

export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function call<T>(brand: SiteBrand, slug: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/site-pages/${brand}/${slug}`, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

/** Every page with its publish state (null on failure). */
export async function fetchStatuses(brand: SiteBrand): Promise<PageStatus[] | null> {
  try {
    const res = await fetch(`/api/site-pages/${brand}`, { headers: await authHeader() });
    return res.ok ? ((await res.json()) as { pages: PageStatus[] }).pages : null;
  } catch {
    return null;
  }
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
