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
  Instagram: "bg-fuchsia-50 text-fuchsia-600",
  Facebook:  "bg-blue-50 text-blue-600",
  TikTok:    "bg-gray-100 text-gray-700",
};

type Props = {
  post: SocialPost;
  isDragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
};

export default function SocialKanbanCard({ post, isDragging, onClick, onDragStart, onDragEnd }: Props) {
  const caption = post.caption ?? "(No caption)";

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
