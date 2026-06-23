"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import BlogPostModal from "@/components/blog-posts/BlogPostModal";
import DeleteFeedbackModal from "@/components/blog-posts/DeleteFeedbackModal";
import type { BlogPost } from "@/components/blog-posts/types";

// Sassy (sassyandco.com) article styling, ported 1:1 from the storefront's
// blog/[slug] page with the theme tokens inlined as literal hex so it renders
// identically here without FMG needing the storefront's Tailwind theme:
// white page, hot-pink ink (#FF3E86) headings + body, rose-deep links
// (#B3295C), blush tag chips (#F1E6E4).
const SASSY_BODY_CLASS =
  "mt-10 text-[#4b5563] " +
  "[&_a]:font-semibold [&_a]:text-[#B3295C] [&_a]:underline-offset-2 hover:[&_a]:underline " +
  "[&_blockquote]:mt-6 [&_blockquote]:border-l-2 [&_blockquote]:border-[#B3295C] [&_blockquote]:pl-5 [&_blockquote]:italic " +
  "[&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-black [&_h2]:uppercase [&_h2]:tracking-tight [&_h2]:text-[#1a1a1a] " +
  "[&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-tight [&_h3]:text-[#1a1a1a] " +
  "[&_img]:my-6 [&_img]:block [&_img]:w-full [&_img]:rounded-2xl " +
  "[&_li]:mt-1.5 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_p]:mt-4 [&_p]:text-base [&_p]:leading-relaxed " +
  "[&_strong]:font-semibold [&_strong]:text-[#1a1a1a] " +
  "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6";

export default function BlogPostPreviewPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    setPost((data as BlogPost) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (!post) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-sm text-gray-500">Post not found.</p>
        <Link href="/blog-posts" className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-800">
          ← Back to pipeline
        </Link>
      </div>
    );
  }

  const isSassy = post.brand === "Sassy";

  return (
    <div className="min-h-screen bg-white">
      {/* Admin toolbar — chrome, NOT part of the published view */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200/80 bg-white/90 px-4 py-2.5 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/blog-posts"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition hover:text-gray-800"
          >
            <ArrowLeft size={14} />
            Pipeline
          </Link>
          <span className="h-4 w-px bg-gray-200" />
          <span
            className={clsx(
              "rounded px-2 py-0.5 text-[10px] font-semibold",
              post.brand === "NI" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600"
            )}
          >
            {post.brand}
          </span>
          <span className="hidden text-[11px] text-gray-400 sm:inline">
            Exactly how it renders on {isSassy ? "sassyandco.com" : "the storefront"}
          </span>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800"
        >
          <Pencil size={13} />
          Edit
        </button>
      </div>

      {/* Faithful article — mirrors sassy/src/app/blog/[slug]/page.tsx */}
      <article className="mx-auto max-w-3xl px-6 py-12 md:py-16">
        <time className="block text-[11px] uppercase tracking-[0.25em] text-[#1a1a1a]/45">
          {new Date(post.created_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
        <h1 className="mt-2 text-balance text-4xl font-black uppercase leading-[0.95] tracking-tight text-[#1a1a1a] md:text-5xl">
          {post.title}
        </h1>

        {post.tags && post.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[#F1E6E4]/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1a1a1a]/65"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {post.hero_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.hero_image_url}
            alt={post.title}
            className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover"
          />
        ) : null}

        {/* FMG-authored HTML — same dangerouslySetInnerHTML the storefront uses */}
        <div
          className={SASSY_BODY_CLASS}
          dangerouslySetInnerHTML={{ __html: post.body || "" }}
        />
      </article>

      {/* Reused editor + delete flow (editing stays modal; the page is the view) */}
      <BlogPostModal
        open={editing}
        post={post}
        onClose={() => setEditing(false)}
        onSaved={load}
        onDeleted={() => {
          setEditing(false);
          setDeleting(true);
        }}
      />
      <DeleteFeedbackModal
        open={deleting}
        postId={post.id}
        postTitle={post.title}
        contentType="blog"
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          setDeleting(false);
          router.push("/blog-posts");
        }}
      />
    </div>
  );
}
