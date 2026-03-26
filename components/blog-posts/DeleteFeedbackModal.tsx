"use client";

import { useState } from "react";
import { X, Trash2, MessageSquare } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  open: boolean;
  postId: string;
  postTitle: string;
  contentType: "blog" | "social";
  onClose: () => void;
  onDeleted: () => void;
};

const REASON_TAGS = [
  "Off-brand voice",
  "Inaccurate information",
  "Too generic",
  "Wrong topic",
  "Poor structure",
  "Too salesy",
  "Duplicate content",
  "Not relevant",
];

export default function DeleteFeedbackModal({
  open,
  postId,
  postTitle,
  contentType,
  onClose,
  onDeleted,
}: Props) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [deleting, setDeleting] = useState(false);

  if (!open) return null;

  function toggleReason(reason: string) {
    setReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  }

  async function handleDelete() {
    setDeleting(true);

    // Save feedback
    await supabase.from("content_feedback").insert({
      content_type: contentType,
      content_id: postId,
      action: "delete",
      reasons,
      comment: comment.trim() || null,
    });

    // Soft-delete: set status to "deleted"
    const table = contentType === "blog" ? "blog_posts" : "social_media_posts";
    await supabase
      .from(table)
      .update({ status: "deleted", updated_at: new Date().toISOString() })
      .eq("id", postId);

    setDeleting(false);
    setReasons([]);
    setComment("");
    onDeleted();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
              <Trash2 size={17} className="text-red-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Delete Post</h3>
              <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1 max-w-[250px]">
                {postTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={deleting}
            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {/* Question */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <MessageSquare size={13} className="text-gray-500" />
              <span className="text-xs font-semibold text-gray-700">
                Why are you deleting this post?
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              This helps improve future AI-generated content.
            </p>

            {/* Reason tags */}
            <div className="flex flex-wrap gap-1.5">
              {REASON_TAGS.map((reason) => {
                const selected = reasons.includes(reason);
                return (
                  <button
                    key={reason}
                    onClick={() => toggleReason(reason)}
                    disabled={deleting}
                    className={clsx(
                      "text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition",
                      selected
                        ? "bg-red-100 text-red-700 ring-1 ring-red-200"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    )}
                  >
                    {reason}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Additional feedback
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={deleting}
              placeholder="What would have made this post better? Any specifics on tone, content, or direction..."
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-200 resize-none transition disabled:opacity-50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition disabled:opacity-50"
          >
            <Trash2 size={13} />
            {deleting ? "Deleting…" : "Delete Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
