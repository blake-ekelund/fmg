"use client";

import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import clsx from "clsx";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called when the generation finishes (with the placeholder ID to remove) */
  onGenerated: (placeholderId: string) => void;
  /** Called immediately on submit so page can show placeholder */
  onSubmitted: (info: { id: string; title: string; brand: "NI" | "Sassy" }) => void;
};

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aXNqdWJ3ZXpoeGZ4b2NvYXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwNDcyNDMsImV4cCI6MjA4NDYyMzI0M30.F7-Yg5JVryMzueXtaOz8TIunbhC-QxUgJz89ZWKxO6Q";

let counter = 0;

export default function GeneratePostModal({ open, onClose, onGenerated, onSubmitted }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState<"NI" | "Sassy">("NI");

  if (!open) return null;

  function handleSubmit() {
    if (!title.trim() || !description.trim()) return;

    const placeholderId = `generating-${++counter}-${Date.now()}`;
    const submitTitle = title.trim();
    const submitDescription = description.trim();
    const submitBrand = brand;

    // Notify parent immediately → shows placeholder card
    onSubmitted({ id: placeholderId, title: submitTitle, brand: submitBrand });

    // Reset form & close modal
    setTitle("");
    setDescription("");
    onClose();

    // Fire request in background
    fetch("https://vxisjubwezhxfxocoawk.supabase.co/functions/v1/generate-blog-posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        mode: "single",
        brand: submitBrand,
        title: submitTitle,
        description: submitDescription,
      }),
    })
      .then((res) => res.json())
      .then(() => onGenerated(placeholderId))
      .catch(() => onGenerated(placeholderId));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Sparkles size={16} className="text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Generate with AI</h2>
              <p className="text-[11px] text-gray-500">Tell Claude what to write about</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Brand selector */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Brand
            </label>
            <div className="flex gap-2">
              {(["NI", "Sassy"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBrand(b)}
                  className={clsx(
                    "flex-1 py-2 rounded-lg text-sm font-medium transition",
                    brand === b
                      ? b === "NI"
                        ? "bg-blue-100 text-blue-700 ring-2 ring-blue-200"
                        : "bg-pink-100 text-pink-700 ring-2 ring-pink-200"
                      : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                  )}
                >
                  {b === "NI" ? "Natural Inspirations" : "Sassy"}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Post Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Science Behind Cold-Pressed Seed Oils"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 transition"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              What should this post cover?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe the angle, key points, or direction you want. e.g. Focus on how cold-pressing preserves antioxidants, mention our ExSeed complex, include tips for choosing quality skincare products..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 transition resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || !description.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 transition disabled:opacity-50"
          >
            <Sparkles size={14} />
            Generate Post
          </button>
        </div>
      </div>
    </div>
  );
}
