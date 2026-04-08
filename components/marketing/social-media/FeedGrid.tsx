"use client";

import { Instagram, Facebook, Play, ImageIcon } from "lucide-react";
import clsx from "clsx";

import type { SocialPost, SocialPlatform } from "./SocialMediaSection";

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

const STATUS_STYLES: Record<string, string> = {
  planned: "bg-amber-50 text-amber-700",
  posted: "bg-emerald-50 text-emerald-700",
};

function statusLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  switch (platform) {
    case "Instagram":
      return <Instagram size={12} />;
    case "Facebook":
      return <Facebook size={12} />;
  }
}

function PostTypeLabel({ type }: { type: string }) {
  return (
    <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 backdrop-blur-sm">
      {type}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   PLACEHOLDER GRADIENT
   ═══════════════════════════════════════════════════════════ */

const GRADIENTS = [
  "from-violet-400 to-fuchsia-400",
  "from-sky-400 to-cyan-400",
  "from-orange-400 to-rose-400",
  "from-emerald-400 to-teal-400",
  "from-pink-400 to-purple-400",
  "from-amber-400 to-yellow-300",
];

function gradient(id: string) {
  const idx =
    id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) %
    GRADIENTS.length;
  return GRADIENTS[idx];
}

/* ═══════════════════════════════════════════════════════════
   FEED CELL (shared inner component)
   ═══════════════════════════════════════════════════════════ */

function FeedCell({
  post,
  aspect,
  onClick,
}: {
  post: SocialPost;
  aspect: string; // Tailwind aspect-ratio class
  onClick: () => void;
}) {
  const hasImage = !!post.image_url;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "group relative w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-gray-900/10",
        aspect
      )}
    >
      {/* Image or gradient placeholder */}
      {hasImage ? (
        <img
          src={post.image_url!}
          alt={post.caption ?? ""}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className={clsx(
            "absolute inset-0 bg-gradient-to-br",
            gradient(post.id)
          )}
        >
          <ImageIcon
            size={28}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/40"
          />
        </div>
      )}

      {/* Top-left badges */}
      <div className="absolute top-2 left-2 flex items-center gap-1">
        <span
          className={clsx(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm",
            STATUS_STYLES[post.status] ?? "bg-gray-100 text-gray-600"
          )}
        >
          <PlatformIcon platform={post.platform as SocialPlatform} />
          {statusLabel(post.status)}
        </span>
      </div>

      {/* Top-right post type */}
      <div className="absolute top-2 right-2">
        <PostTypeLabel type={post.post_type} />
      </div>

      {/* Caption overlay on hover */}
      {post.caption && (
        <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 transition-transform group-hover:translate-y-0">
          <p className="line-clamp-3 text-left text-xs text-white/90">
            {post.caption}
          </p>
        </div>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   FEED GRID
   ═══════════════════════════════════════════════════════════ */

type FeedGridProps = {
  posts: SocialPost[];
  platform: SocialPlatform;
  onSelect: (post: SocialPost) => void;
};

export default function FeedGrid({ posts, platform, onSelect }: FeedGridProps) {
  if (posts.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">
        No posts yet. Click &ldquo;New Post&rdquo; to create one.
      </div>
    );
  }

  /* Instagram: 3-col square grid */
  if (platform === "Instagram") {
    return (
      <div className="grid grid-cols-3 gap-1 md:gap-2">
        {posts.map((p) => (
          <FeedCell
            key={p.id}
            post={p}
            aspect="aspect-square"
            onClick={() => onSelect(p)}
          />
        ))}
      </div>
    );
  }

  /* Facebook: single-column card feed */
  if (platform === "Facebook") {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        {posts.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="group w-full rounded-xl border border-gray-200 bg-white text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          >
            {/* Card image */}
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-t-xl bg-gray-50">
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt={p.caption ?? ""}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className={clsx(
                    "h-full w-full bg-gradient-to-br",
                    gradient(p.id)
                  )}
                >
                  <ImageIcon
                    size={32}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/40"
                  />
                </div>
              )}

              {/* Status badge */}
              <div className="absolute top-2 left-2">
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm",
                    STATUS_STYLES[p.status] ?? "bg-gray-100 text-gray-600"
                  )}
                >
                  <PlatformIcon platform={p.platform as SocialPlatform} />
                  {statusLabel(p.status)}
                </span>
              </div>

              <div className="absolute top-2 right-2">
                <PostTypeLabel type={p.post_type} />
              </div>
            </div>

            {/* Card body */}
            <div className="p-4 space-y-1">
              <p className="text-[11px] font-medium text-gray-400">
                {p.post_date}
              </p>
              {p.caption && (
                <p className="line-clamp-3 text-sm text-gray-700">
                  {p.caption}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  }

  /* TikTok: 3-col vertical (9:16) grid */
  return (
    <div className="grid grid-cols-3 gap-1 md:gap-2">
      {posts.map((p) => (
        <FeedCell
          key={p.id}
          post={p}
          aspect="aspect-[9/16]"
          onClick={() => onSelect(p)}
        />
      ))}
    </div>
  );
}
