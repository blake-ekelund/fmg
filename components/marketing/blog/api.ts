import { supabaseBrowser } from "@/lib/supabase/browser";
import { supabase } from "@/lib/supabaseClient";
import type { BlogBrand, BlogPostRow, BlogPostSummary, BlogStatus } from "@/lib/blogPosts";

/** Browser-side client for the blog API routes. Every call carries the
 *  current session token; the routes verify it and use the service role. */

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readJson<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export type ListResult = { posts: BlogPostSummary[]; notReady?: boolean; hint?: string };

export async function listPosts(brand: BlogBrand | "all"): Promise<ListResult> {
  const res = await fetch(`/api/marketing/blog?brand=${encodeURIComponent(brand)}`, {
    headers: await authHeader(),
    cache: "no-store",
  });
  return readJson<ListResult>(res);
}

export async function createPost(brand: BlogBrand, title?: string): Promise<BlogPostRow> {
  const res = await fetch("/api/marketing/blog", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ brand, title }),
  });
  return (await readJson<{ post: BlogPostRow }>(res)).post;
}

/** A post plus its "Preview on site" link (null when the server can't sign one). */
export type PostWithPreview = { post: BlogPostRow; previewUrl: string | null };

export async function getPost(id: string): Promise<PostWithPreview> {
  const res = await fetch(`/api/marketing/blog/${id}`, {
    headers: await authHeader(),
    cache: "no-store",
  });
  const json = await readJson<{ post: BlogPostRow; previewUrl?: string | null }>(res);
  return { post: json.post, previewUrl: json.previewUrl ?? null };
}

export type PostPatch = Partial<{
  title: string;
  slug: string;
  body: string;
  seo_meta: string | null;
  tags: string[];
  hero_image_url: string;
  brand: BlogBrand;
  status: BlogStatus;
  publish_at: string | null;
}>;

export async function updatePost(id: string, patch: PostPatch): Promise<PostWithPreview> {
  const res = await fetch(`/api/marketing/blog/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(patch),
  });
  const json = await readJson<{ post: BlogPostRow; previewUrl?: string | null }>(res);
  return { post: json.post, previewUrl: json.previewUrl ?? null };
}

export async function deletePost(id: string): Promise<void> {
  const res = await fetch(`/api/marketing/blog/${id}`, {
    method: "DELETE",
    headers: await authHeader(),
  });
  await readJson<{ ok: true }>(res);
}

/**
 * Hero upload. Goes to the public `email-assets` bucket (the one the Image
 * Library browses) under blog/, at full resolution — the storefront renders
 * heroes edge-to-edge at ~770px CSS width, so the 800px email resize would
 * look soft on a retina screen.
 */
export async function uploadHeroImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Keep hero images under 8 MB.");
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `blog/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("email-assets").upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from("email-assets").getPublicUrl(path).data.publicUrl;
}
