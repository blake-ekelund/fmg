import { supabaseBrowser } from "@/lib/supabase/browser";
import { supabase } from "@/lib/supabaseClient";
import { SOCIAL_BUCKET, type InstagramFeed, type MetaConnectionStatus, type SocialBrand, type SocialPlatform, type SocialPost } from "@/lib/social/types";
import type { PostDesign } from "@/lib/social/design";

/** Browser-side client for /api/social. Every call carries the session token. */

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

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(await authHeader()) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return readJson<T>(res);
}

export type ListResult = { posts: SocialPost[]; notReady?: boolean; hint?: string };
export type PostFields = Partial<
  Pick<SocialPost, "title" | "design" | "brand" | "platforms" | "post_type" | "caption" | "media" | "scheduled_at">
>;

export const listSocialPosts = () => call<ListResult>("GET", "/api/social/posts?brand=all");
export const getSocialStatus = () => call<MetaConnectionStatus>("GET", "/api/social/status");

export async function createSocialPost(fields: PostFields): Promise<SocialPost> {
  return (await call<{ post: SocialPost }>("POST", "/api/social/posts", fields)).post;
}

export async function updateSocialPost(
  id: string,
  fields: PostFields & { action?: "draft" | "schedule" | "retry"; render?: boolean },
): Promise<SocialPost> {
  return (await call<{ post: SocialPost }>("PATCH", `/api/social/posts/${id}`, fields)).post;
}

export async function publishSocialPostNow(id: string, fields: PostFields): Promise<SocialPost> {
  return (await call<{ post: SocialPost }>("POST", `/api/social/posts/${id}/publish`, fields)).post;
}

export async function deleteSocialPost(id: string): Promise<void> {
  await call<{ ok: true }>("DELETE", `/api/social/posts/${id}`);
}

/** Full-resolution image upload into the Image Library (Social uploads inbox). */
export async function uploadSocialImage(
  file: File,
  folder = "social-uploads",
): Promise<{ url: string } | { error: string }> {
  if (!file.type.startsWith("image/")) return { error: "That file isn't an image." };
  if (file.size > 15 * 1024 * 1024) return { error: "Keep images under 15 MB." };
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("email-assets").upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (error) return { error: error.message };
  return { url: supabase.storage.from("email-assets").getPublicUrl(path).data.publicUrl };
}

/** Reel video upload straight to storage through a signed URL. */
export async function uploadSocialVideo(file: File): Promise<string> {
  if (!/\.(mp4|mov|m4v)$/i.test(file.name)) throw new Error("Upload an .mp4 or .mov video.");
  const { path, token, publicUrl } = await call<{ path: string; token: string; publicUrl: string }>(
    "POST",
    "/api/social/upload-url",
    { filename: file.name },
  );
  const { error } = await supabase.storage
    .from(SOCIAL_BUCKET)
    .uploadToSignedUrl(path, token, file, { contentType: file.type || "video/mp4" });
  if (error) {
    throw new Error(/exceeded|too large|413/i.test(error.message) ? "That video is over the storage size limit." : error.message);
  }
  return publicUrl;
}

export async function getSocialPost(id: string): Promise<SocialPost> {
  return (await call<{ post: SocialPost }>("GET", `/api/social/posts/${id}`)).post;
}

export type ProductOption = import("@/lib/social/design").ProductOption;

export async function listSocialProducts(brand: SocialBrand): Promise<ProductOption[]> {
  return (await call<{ products: ProductOption[] }>("GET", `/api/social/products?brand=${brand}`)).products;
}

export type GenerateInput = {
  brand: SocialBrand;
  purpose: string;
  platforms: SocialPlatform[];
  format: "carousel" | "single";
  slideCount: number;
  prompt: string;
  parts: string[];
  /** Write the post from this blog article. */
  blogId?: string | null;
};

export async function generateSocialPost(
  input: GenerateInput,
): Promise<{ title: string; design: PostDesign; scheduleSuggestion?: string | null }> {
  return call<{ title: string; design: PostDesign; scheduleSuggestion?: string | null }>("POST", "/api/social/generate", input);
}

export const getInstagramFeed = (brand: SocialBrand) => call<InstagramFeed>("GET", `/api/social/feed?brand=${brand}`);

export type BlogOption = import("@/lib/blogPosts").BlogPostSummary;

export async function listBlogPostsForSocial(brand: SocialBrand): Promise<BlogOption[]> {
  return (await call<{ posts: BlogOption[] }>("GET", `/api/social/blog-posts?brand=${brand}`)).posts;
}
