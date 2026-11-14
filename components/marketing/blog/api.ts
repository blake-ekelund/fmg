import { supabaseBrowser } from "@/lib/supabase/browser";
import type { BlogBrand, BlogPostRow, BlogPostSummary, BlogStatus } from "@/lib/blogPosts";
import type { BlogBlock } from "@/lib/blog/blocks";
import type { HeroCredit } from "@/lib/blog/render";
import type { BlogAudience, BlogPurpose } from "@/lib/blog/meta";
import { uploadToFolder } from "@/lib/images/client";

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

/** The Unsplash cover credit a save would add for this hero (null if none). */
export async function getHeroCredit(heroUrl: string): Promise<HeroCredit | null> {
  const res = await fetch(`/api/marketing/blog/hero-credit?url=${encodeURIComponent(heroUrl)}`, {
    headers: await authHeader(),
  });
  return (await readJson<{ credit: HeroCredit | null }>(res)).credit;
}

export type ListResult ={ posts: BlogPostSummary[]; notReady?: boolean; hint?: string };

export async function listPosts(brand: BlogBrand | "all"): Promise<ListResult> {
  const res = await fetch(`/api/marketing/blog?brand=${encodeURIComponent(brand)}`, {
    headers: await authHeader(),
    cache: "no-store",
  });
  return readJson<ListResult>(res);
}

/** Everything the new-post wizard collects. Only brand is required. */
export type NewPostInput = {
  brand: BlogBrand;
  title?: string;
  blocks?: BlogBlock[];
  audience?: BlogAudience;
  purpose?: BlogPurpose;
  description?: string;
  seo_meta?: string;
  tags?: string[];
  hero_image_url?: string;
};

export async function createPost(input: NewPostInput): Promise<BlogPostRow> {
  const res = await fetch("/api/marketing/blog", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(input),
  });
  return (await readJson<{ post: BlogPostRow }>(res)).post;
}

export type GeneratedPost = {
  blocks: BlogBlock[];
  seo_meta: string;
  tags: string[];
  hero_image_url: string;
};

/** AI-write a post in the brand format. Doesn't save anything. */
export async function generatePost(input: {
  brand: BlogBrand;
  audience: BlogAudience;
  purpose: BlogPurpose;
  title: string;
  description: string;
  prompt: string;
}): Promise<GeneratedPost> {
  const res = await fetch("/api/marketing/blog/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(input),
  });
  return readJson<GeneratedPost>(res);
}

/** A post plus its "Preview on site" link (null when the server can't sign
 *  one), and a setup hint when the builder migration isn't applied yet. */
export type PostWithPreview = { post: BlogPostRow; previewUrl: string | null; hint?: string };

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
  /** Builder source; the server compiles body from it. null detaches. */
  blocks: BlogBlock[] | null;
  audience: BlogAudience;
  purpose: BlogPurpose;
  description: string | null;
}>;

export async function updatePost(id: string, patch: PostPatch): Promise<PostWithPreview> {
  const res = await fetch(`/api/marketing/blog/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(patch),
  });
  const json = await readJson<{ post: BlogPostRow; previewUrl?: string | null; hint?: string }>(res);
  return { post: json.post, previewUrl: json.previewUrl ?? null, hint: json.hint };
}

export async function deletePost(id: string): Promise<void> {
  const res = await fetch(`/api/marketing/blog/${id}`, {
    method: "DELETE",
    headers: await authHeader(),
  });
  await readJson<{ ok: true }>(res);
}

/**
 * Blog image upload (hero and in-post images). Goes to the public `email-assets` bucket (the one the Image
 * Library browses) under the Blog uploads inbox (or a chosen folder), at full resolution — the storefront renders
 * heroes edge-to-edge at ~770px CSS width, so the 800px email resize would
 * look soft on a retina screen.
 */
export async function uploadBlogImage(file: File, folder = "blog-uploads"): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Keep hero images under 8 MB.");
  // Shared upload path: de-duplicated, capped at 2400px (still crisp for a
  // retina hero), readable file name, described by Sage.
  const res = await uploadToFolder(file, folder);
  if ("error" in res) throw new Error(res.error);
  return res.url;
}

/** Same upload, in the { url } | { error } shape MediaLibraryModal takes. */
export async function uploadBlogImageResult(
  file: File,
  folder?: string,
): Promise<{ url: string } | { error: string }> {
  try {
    return { url: await uploadBlogImage(file, folder) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed." };
  }
}
