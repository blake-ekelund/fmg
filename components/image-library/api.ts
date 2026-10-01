import { supabase } from "@/lib/supabaseClient";
import type { LibraryImage, MetaPatch } from "./types";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listImages(): Promise<{ images: LibraryImage[]; folders: string[] }> {
  const res = await fetch("/api/email/images", { headers: await authHeader() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Couldn't load images.");
  return {
    images: (json.images ?? []) as LibraryImage[],
    folders: (json.folders ?? []) as string[],
  };
}

/** Create a top-level folder. Returns the URL-safe name it was saved as. */
export async function createFolder(name: string): Promise<string> {
  const res = await fetch("/api/email/images", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ name }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Couldn't create folder.");
  return json.folder as string;
}

/**
 * File many images under a folder. Only a label changes — the images keep
 * their URLs, so emails already using them are unaffected.
 */
export async function refileImages(paths: string[], folder: string): Promise<void> {
  const res = await fetch("/api/email/images", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ paths, folder }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? "Couldn't move images.");
  }
}

/** Delete an empty folder (the API refuses if it still holds images). */
export async function deleteFolder(folder: string): Promise<void> {
  const res = await fetch("/api/email/images", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ folder }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? "Couldn't delete folder.");
  }
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
