import { supabase } from "@/lib/supabaseClient";

/**
 * Browser side of the one upload path (/api/images/upload): every editor,
 * the Image Library and the product page send images through it, so each file
 * is fingerprinted (an identical file is reused, never stored twice),
 * optimized for web, given a readable name, and described by Sage.
 */

export type UploadOk = {
  url: string;
  path: string;
  bucket: string;
  deduped: boolean;
  sharedWith?: { fragrance: string; products: number };
  photoId?: string;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function uploadImage(
  file: Blob,
  target:
    | { kind: "folder"; folder: string }
    | { kind: "product"; part: string; assetType: string; share?: boolean }
    | { kind: "fragrance"; brand: string; fragrance: string; assetType?: string },
  fileName?: string,
): Promise<UploadOk | { error: string }> {
  if (!file.type.startsWith("image/")) return { error: "That file isn't an image." };
  const body = new FormData();
  body.append("file", file, fileName ?? (file as File).name ?? "image");
  body.append("target", JSON.stringify(target));
  try {
    const res = await fetch("/api/images/upload", { method: "POST", headers: await authHeader(), body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? "Upload failed." };
    return json as UploadOk;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed." };
  }
}

/** Upload into an Image Library folder (or a product / collection folder). */
export function uploadToFolder(file: Blob, folder: string, fileName?: string) {
  return uploadImage(file, { kind: "folder", folder }, fileName);
}
