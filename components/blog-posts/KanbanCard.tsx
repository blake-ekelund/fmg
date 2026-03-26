"use client";

import { motion } from "framer-motion";
import { GripVertical } from "lucide-react";
import clsx from "clsx";
import type { BlogPost } from "./types";

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

type Props = {
  post: BlogPost;
  isDragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
};

export default function KanbanCard({ post, isDragging, onClick, onDragStart, onDragEnd }: Props) {
  const tags = post.tags ?? [];

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
      {/* Drag handle + title */}
      <div className="flex items-start gap-1.5">
        <GripVertical
          size={14}
          className="shrink-0 mt-0.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
        />
        <h4 className="text-[13px] font-medium text-gray-800 leading-snug line-clamp-2 flex-1">
          {post.title}
        </h4>
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

        {/* Tags */}
        {tags.slice(0, 2).map((tag) => (
          <span key={tag} className="text-[10px] text-gray-400 bg-gray-50 rounded px-1.5 py-0.5">
            {tag}
          </span>
        ))}
        {tags.length > 2 && (
          <span className="text-[10px] text-gray-400">+{tags.length - 2}</span>
        )}

        {/* Date */}
        <span className="text-[10px] text-gray-400 ml-auto">
          {timeAgo(post.created_at)}
        </span>
      </div>
    </motion.div>
  );
}
