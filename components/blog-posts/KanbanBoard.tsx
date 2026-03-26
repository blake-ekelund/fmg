"use client";

import KanbanColumn from "./KanbanColumn";
import type { BlogPost, BlogPostStatus } from "./types";
import { COLUMNS } from "./types";

type Props = {
  posts: BlogPost[];
  draggingId: string | null;
  onCardClick: (post: BlogPost) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDrop: (status: BlogPostStatus) => void;
};

export default function KanbanBoard({
  posts,
  draggingId,
  onCardClick,
  onDragStart,
  onDragEnd,
  onDrop,
}: Props) {
  // Group posts by status
  const grouped = COLUMNS.map((col) => ({
    ...col,
    posts: posts.filter((p) => p.status === col.status),
  }));

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {grouped.map((col) => (
        <KanbanColumn
          key={col.status}
          column={col}
          posts={col.posts}
          draggingId={draggingId}
          onCardClick={onCardClick}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDrop={(status) => onDrop(status as BlogPostStatus)}
        />
      ))}
    </div>
  );
}
