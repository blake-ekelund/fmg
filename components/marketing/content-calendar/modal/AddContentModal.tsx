"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  ContentItem,
  ContentStatus,
  Brand,
  Platform,
  ContentType,
  StrategyType,
} from "../types";

type Props = {
  date: string | null;
  item?: ContentItem | null;
  onClose: () => void;
  onSaved: () => void;
  onBack?: () => void;
};

const PLATFORMS: Platform[] = ["Instagram", "Facebook", "TikTok", "Shopify", "Subscriber-List"];
const CONTENT_TYPES: ContentType[] = ["Photo", "Carousel", "Reel", "Live", "Blog", "Newsletter"];
const STRATEGIES: StrategyType[] = ["Awareness", "Engagement", "Conversion", "Retention", "Launch", "Education"];
const BRANDS: Brand[] = ["NI", "Sassy"];

type Recurrence = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly";
const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: "none", label: "One-time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function generateDates(start: string, recurrence: Recurrence, endDate: string): string[] {
  const dates: string[] = [start];
  if (recurrence === "none") return dates;

  const s = new Date(start + "T00:00:00");
  const e = new Date(endDate + "T00:00:00");
  const current = new Date(s);

  while (true) {
    switch (recurrence) {
      case "daily": current.setDate(current.getDate() + 1); break;
      case "weekly": current.setDate(current.getDate() + 7); break;
      case "biweekly": current.setDate(current.getDate() + 14); break;
      case "monthly": current.setMonth(current.getMonth() + 1); break;
      case "yearly": current.setFullYear(current.getFullYear() + 1); break;
    }
    if (current > e) break;
    dates.push(current.toISOString().split("T")[0]);
    if (dates.length > 365) break; // safety
  }

  return dates;
}

const PLATFORM_COLORS: Record<string, string> = {
  Instagram: "border-pink-300 bg-pink-50 text-pink-700",
  Facebook: "border-blue-300 bg-blue-50 text-blue-700",
  TikTok: "border-slate-300 bg-slate-50 text-slate-700",
  Shopify: "border-emerald-300 bg-emerald-50 text-emerald-700",
  "Subscriber-List": "border-amber-300 bg-amber-50 text-amber-700",
};

async function logActivity(
  contentId: string,
  eventType: "status_changed" | "content_updated",
  eventLabel: string,
  performedBy: string,
  metadata?: { from?: ContentStatus; to?: ContentStatus }
) {
  await supabase.from("marketing_content_activity").insert({
    content_id: contentId,
    event_type: eventType,
    event_label: eventLabel,
    metadata: metadata ?? null,
    performed_by: performedBy,
  });
}

export default function AddContentModal({
  date,
  item,
  onClose,
  onSaved,
}: Props) {
  const [publishDate, setPublishDate] = useState(
    item?.publish_date ?? date ?? new Date().toISOString().split("T")[0]
  );
  const [brand, setBrand] = useState<Brand>(item?.brand ?? "NI");
  const [platform, setPlatform] = useState<Platform>(item?.platform ?? "Instagram");
  const [contentType, setContentType] = useState<ContentType | "">(item?.content_type ?? "");
  const [strategy, setStrategy] = useState<StrategyType | "">(item?.strategy ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [status, setStatus] = useState<ContentStatus>(item?.status ?? "Draft");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [recurrenceEnd, setRecurrenceEnd] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split("T")[0];
  });
  const [loading, setLoading] = useState(false);

  const isEditing = !!item;
  const canSave = publishDate && brand && platform && contentType && strategy;

  async function handleSave() {
    if (!canSave) return;
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Not authenticated");

      const payload = {
        publish_date: publishDate,
        brand,
        platform,
        content_type: contentType,
        strategy,
        description,
        status,
      };

      if (isEditing) {
        const { error } = await supabase
          .from("marketing_content")
          .update(payload)
          .eq("id", item.id);
        if (error) throw error;

        if (item.status !== status) {
          await logActivity(item.id, "status_changed",
            `Moved from ${item.status} to ${status}`, user.id,
            { from: item.status, to: status });
        }
      } else {
        const dates = generateDates(publishDate, recurrence, recurrenceEnd);
        const rows = dates.map((d) => ({
          ...payload,
          publish_date: d,
          recurrence,
          recurrence_end: recurrence !== "none" ? recurrenceEnd : null,
          created_by: user.id,
        }));

        const { data, error } = await supabase
          .from("marketing_content")
          .insert(rows)
          .select("id");
        if (error) throw error;
        if (data?.[0]) {
          await logActivity(data[0].id, "status_changed", "Draft created", user.id, { to: "Draft" });
        }
      }

      onSaved();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!item?.id || !confirm("Delete this content?")) return;
    await supabase.from("marketing_content").delete().eq("id", item.id);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            {isEditing ? "Edit Content" : "Schedule Content"}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4">
          {/* Date */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={publishDate}
              onChange={(e) => setPublishDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </div>

          {/* Recurrence — only for new items */}
          {!isEditing && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Repeat
              </label>
              <div className="flex flex-wrap gap-1.5">
                {RECURRENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setRecurrence(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      recurrence === opt.value
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {recurrence !== "none" && (
                <div className="mt-2">
                  <label className="block text-[10px] text-gray-400 mb-1">
                    Repeat until
                  </label>
                  <input
                    type="date"
                    value={recurrenceEnd}
                    onChange={(e) => setRecurrenceEnd(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  />
                  <div className="text-[10px] text-gray-400 mt-1">
                    This will create {generateDates(publishDate, recurrence, recurrenceEnd).length} entries on the calendar
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Brand */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Brand
            </label>
            <div className="flex gap-2">
              {BRANDS.map((b) => (
                <button
                  key={b}
                  onClick={() => setBrand(b)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    brand === b
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {b === "NI" ? "Natural Inspirations" : "Sassy"}
                </button>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Platform
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => {
                const isActive = platform === p;
                const color = PLATFORM_COLORS[p] ?? "border-gray-200 bg-gray-50 text-gray-600";
                return (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      isActive ? color : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content Type */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Content Type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_TYPES.map((ct) => (
                <button
                  key={ct}
                  onClick={() => setContentType(ct)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    contentType === ct
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {ct}
                </button>
              ))}
            </div>
          </div>

          {/* Strategy */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Strategy
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STRATEGIES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    strategy === s
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Note <span className="text-gray-300">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Quick note about this content..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          <div>
            {isEditing && (
              <button
                onClick={handleDelete}
                className="text-xs text-rose-500 hover:text-rose-600 font-medium transition"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !canSave}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-40 transition"
            >
              {loading ? "Saving..." : isEditing ? "Update" : "Schedule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
