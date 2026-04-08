"use client";

import { motion } from "framer-motion";
import { GripVertical } from "lucide-react";
import clsx from "clsx";
import type { SocialPost } from "./types";

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PLATFORM_STYLE: Record<string, string> = {
  "Instagram / Facebook": "bg-purple-50 text-purple-600",
};

type Props = {
  post: SocialPost;
  isDragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
};

export default function SocialKanbanCard({ post, isDragging, onClick, onDragStart, onDragEnd }: Props) {
  const isGenerating = post.status === ("generating" as string);
  const caption = isGenerating ? "Generating..." : (post.caption ?? "(No caption)");

  if (isGenerating) {
    return (
      <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-lg border border-purple-200 px-3 py-4 animate-pulse">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 rounded-full bg-purple-300 animate-spin" />
          <span className="text-xs font-medium text-purple-600">Generating with AI...</span>
        </div>
        <div className="space-y-1.5">
          <div className="h-2.5 bg-purple-200/50 rounded w-3/4" />
          <div className="h-2.5 bg-purple-200/50 rounded w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      layoutId={post.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15, layout: { duration: 0.2 } }}
      draggable
      onDragStart={(e) => onDragStart(e as unknown as React.DragEvent, post.id)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={clsx(
        "group bg-white rounded-lg border border-gray-200 px-3 py-2.5 cursor-pointer",
        "hover:border-gray-300 hover:shadow-sm transition-all",
        isDragging && "shadow-lg ring-2 ring-blue-200"
      )}
    >
      {/* Image thumbnail */}
      {(() => {
        const carouselThumb = post.carousel_slides?.[0]?.rendered_image_url;
        const thumbUrl = carouselThumb || post.image_ref_url || post.image_url;
        if (!thumbUrl) return null;
        return (
          <div className="rounded-lg overflow-hidden mb-2 border border-gray-100 relative">
            <img
              src={thumbUrl}
              alt=""
              className="w-full h-24 object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            {post.carousel_slides && post.carousel_slides.length > 1 && (
              <span className="absolute top-1 right-1 bg-black/60 text-white text-[9px] font-bold rounded px-1.5 py-0.5">
                {post.carousel_slides.length} slides
              </span>
            )}
          </div>
        );
      })()}

      {/* Drag handle + caption preview */}
      <div className="flex items-start gap-1.5">
        <GripVertical
          size={14}
          className="shrink-0 mt-0.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
        />
        <p className="text-[13px] font-medium text-gray-800 leading-snug line-clamp-2 flex-1">
          {caption}
        </p>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {/* Brand badge */}
        <span
          className={clsx(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded",
            post.brand === "NI"
              ? "bg-blue-50 text-blue-600"
              : "bg-pink-50 text-pink-600"
          )}
        >
          {post.brand}
        </span>

        {/* Platform badge */}
        <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded", PLATFORM_STYLE[post.platform] ?? "bg-gray-50 text-gray-500")}>
          {post.platform}
        </span>

        {/* Post type */}
        <span className="text-[10px] text-gray-400 bg-gray-50 rounded px-1.5 py-0.5">
          {post.post_type}
        </span>

        {/* Date */}
        <span className="text-[10px] text-gray-400 ml-auto">
          {timeAgo(post.created_at)}
        </span>
      </div>
    </motion.div>
  );
}
