import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { blogPreviewUrl } from "@/lib/blogPreview";
import {
  isBlogBrand,
  isBlogStatus,
  normalizeTags,
  slugify,
  type BlogPostRow,
  type BlogStatus,
} from "@/lib/blogPosts";

export const runtime = "nodejs";

/**
 * One blog post.
 *
 *   GET    — the full row, body included.
 *   PATCH  — save fields and/or change status. Status is where the rules live:
 *              scheduled  needs a publish_at; if that time is already past the
 *                         post is simply published instead of queued
 *              published  "publish now": stamps published_at (once) and, when
 *                         no date was set, publish_at too, so the storefront
 *                         shows a sensible post date
 *              draft / archived / ai_draft / human_review / ready
 *                         no side effects; published_at is kept as history
 *   DELETE — soft delete (status='deleted'). The row stays, so the AI
 *            generator's "already written" list keeps seeing the title.
 *
 * The one thing that can fail on a save is the slug: two LIVE posts on a brand
 * can't share one. That comes back as 409 with a plain message, not a 500.
 */

type PatchBody = {
  title?: unknown;
  slug?: unknown;
  body?: unknown;
  seo_meta?: unknown;
  tags?: unknown;
  hero_image_url?: unknown;
  brand?: unknown;
  status?: unknown;
  publish_at?: unknown;
};

const UUID = /^[0-9a-f-]{36}$/i;

/** Statuses the editor may set. `generating` and `deleted` are not choices. */
const SETTABLE: readonly BlogStatus[] = [
  "ai_draft",
  "human_review",
  "ready",
  "draft",
  "scheduled",
  "published",
  "archived",
];

function parseDate(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("blog_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.status === "deleted") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const post = data as unknown as BlogPostRow;
  return NextResponse.json({ post, previewUrl: blogPreviewUrl(post.brand, post.id) });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let input: PatchBody;
  try {
    input = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: current, error: loadError } = await supabaseServer
    .from("blog_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!current || current.status === "deleted") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const existing = current as unknown as BlogPostRow;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.title !== undefined) {
    if (typeof input.title !== "string" || !input.title.trim()) {
      return NextResponse.json({ error: "A title is required" }, { status: 400 });
    }
    patch.title = input.title.trim();
  }
  if (input.body !== undefined) {
    if (typeof input.body !== "string") {
      return NextResponse.json({ error: "Body must be HTML text" }, { status: 400 });
    }
    patch.body = input.body;
  }
  if (input.seo_meta !== undefined) {
    patch.seo_meta =
      typeof input.seo_meta === "string" && input.seo_meta.trim() ? input.seo_meta.trim() : null;
  }
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
  if (input.hero_image_url !== undefined) {
    patch.hero_image_url =
      typeof input.hero_image_url === "string" ? input.hero_image_url.trim() : "";
  }
  if (input.brand !== undefined) {
    if (!isBlogBrand(input.brand)) {
      return NextResponse.json({ error: "Brand must be Sassy or NI" }, { status: 400 });
    }
    patch.brand = input.brand;
  }

  // Slug: whatever was sent, normalized; empty falls back to the title.
  if (input.slug !== undefined || input.title !== undefined) {
    const raw = typeof input.slug === "string" ? input.slug : (existing.slug ?? "");
    const titleForSlug = (patch.title as string | undefined) ?? existing.title;
    const slug = slugify(raw) || slugify(titleForSlug);
    if (!slug) return NextResponse.json({ error: "Could not derive a URL slug" }, { status: 400 });
    patch.slug = slug;
  }

  const publishAt = parseDate(input.publish_at);
  if (input.publish_at !== undefined && publishAt === undefined) {
    return NextResponse.json({ error: "Publish date is not a valid date" }, { status: 400 });
  }
  if (publishAt !== undefined) patch.publish_at = publishAt;

  if (input.status !== undefined) {
    if (!isBlogStatus(input.status) || !SETTABLE.includes(input.status)) {
      return NextResponse.json({ error: "That status can't be set here" }, { status: 400 });
    }
    let status: BlogStatus = input.status;
    const effectivePublishAt =
      publishAt !== undefined ? publishAt : existing.publish_at;
    const nowIso = new Date().toISOString();

    if (status === "scheduled") {
      if (!effectivePublishAt) {
        return NextResponse.json(
          { error: "Pick a publish date before scheduling" },
          { status: 400 },
        );
      }
      // A date already behind us means "publish now", not "queue forever".
      if (effectivePublishAt <= nowIso) {
        status = "published";
        patch.published_at = existing.published_at ?? effectivePublishAt;
      }
    }
    if (status === "published") {
      if (!effectivePublishAt) patch.publish_at = nowIso;
      if (!patch.published_at) patch.published_at = existing.published_at ?? nowIso;
    }
    patch.status = status;
  }

  const { data, error } = await supabaseServer
    .from("blog_posts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Another live post on this brand already uses that URL slug" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const saved = data as unknown as BlogPostRow;
  return NextResponse.json({ post: saved, previewUrl: blogPreviewUrl(saved.brand, saved.id) });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { error } = await supabaseServer
    .from("blog_posts")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
