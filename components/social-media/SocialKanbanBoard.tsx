"use client";

import SocialKanbanColumn from "./SocialKanbanColumn";
import type { SocialPost, SocialPostStatus } from "./types";
import { COLUMNS } from "./types";

type Props = {
  posts: SocialPost[];
  draggingId: string | null;
  onCardClick: (post: SocialPost) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDrop: (status: SocialPostStatus) => void;
};

export default function SocialKanbanBoard({
  posts,
  draggingId,
  onCardClick,
  onDragStart,
  onDragEnd,
  onDrop,
}: Props) {
  const grouped = COLUMNS.map((col) => ({
    ...col,
    posts: posts.filter((p) => p.status === col.status),
  }));

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {grouped.map((col) => (
        <SocialKanbanColumn
          key={col.status}
          column={col}
          posts={col.posts}
          draggingId={draggingId}
          onCardClick={onCardClick}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDrop={(status) => onDrop(status as SocialPostStatus)}
        />
      ))}
    </div>
  );
}
