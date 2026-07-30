import { supabase } from "@/lib/supabaseClient";
import type { LibraryImage, MetaPatch } from "./types";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listImages(): Promise<LibraryImage[]> {
  const res = await fetch("/api/email/images", { headers: await authHeader() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Couldn't load images.");
  return (json.images ?? []) as LibraryImage[];
}

export async function updateImageMeta(path: string, patch: MetaPatch): Promise<void> {
  const res = await fetch("/api/email/images", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ path, ...patch }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? "Couldn't save changes.");
  }
}

export async function deleteImage(path: string): Promise<void> {
  const res = await fetch("/api/email/images", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? "Couldn't delete image.");
  }
}
