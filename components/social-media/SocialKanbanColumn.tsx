"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import clsx from "clsx";
import SocialKanbanCard from "./SocialKanbanCard";
import type { SocialPost, ColumnConfig } from "./types";

type Props = {
  column: ColumnConfig;
  posts: SocialPost[];
  draggingId: string | null;
  onCardClick: (post: SocialPost) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDrop: (status: string) => void;
};

export default function SocialKanbanColumn({
  column,
  posts,
  draggingId,
  onCardClick,
  onDragStart,
  onDragEnd,
  onDrop,
}: Props) {
  const [dragOver, setDragOver] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    onDrop(column.status);
  }

  return (
    <div
      className={clsx(
        "flex flex-col min-w-[260px] flex-1 rounded-xl transition-all",
        dragOver ? "bg-blue-50/50 ring-2 ring-blue-200" : "bg-gray-50/50"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={clsx("w-2 h-2 rounded-full shrink-0", column.accent)} />
          <span className="text-[12px] font-semibold text-gray-700 uppercase tracking-wider">
            {column.label}
          </span>
          <span className="text-[11px] font-medium text-gray-400 tabular-nums">
            {posts.length}
          </span>
        </div>
        <span className="text-[10px] font-medium text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
          {column.owner}
        </span>
      </div>

      {/* Card list */}
      <div className="flex-1 px-2 pb-2 space-y-1.5 min-h-[120px]">
        <AnimatePresence mode="popLayout">
          {posts.map((post) => (
            <SocialKanbanCard
              key={post.id}
              post={post}
              isDragging={draggingId === post.id}
              onClick={() => onCardClick(post)}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </AnimatePresence>

        {posts.length === 0 && (
          <div className="flex items-center justify-center h-20 rounded-lg border border-dashed border-gray-200 text-[11px] text-gray-400">
            Drag posts here
          </div>
        )}
      </div>
    </div>
  );
}
