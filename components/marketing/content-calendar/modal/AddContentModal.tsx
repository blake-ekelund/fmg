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
const CONTENT_TYPES: ContentType[] = ["Photo", "Carousel", "Reel", "Blog", "Newsletter"];
const STRATEGIES: StrategyType[] = ["Awareness", "Engagement", "Conversion", "Retention", "Launch", "Education"];
const BRANDS: Brand[] = ["NI", "Sassy"];

type Recurrence = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly";

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: "One-time",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  yearly: "Yearly",
};

function generateDates(start: string, recurrence: Recurrence, endDate: string): string[] {
  const dates: string[] = [start];
  if (recurrence === "none") return dates;
  const e = new Date(endDate + "T00:00:00");
  const current = new Date(start + "T00:00:00");
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
    if (dates.length > 365) break;
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

export default function AddContentModal({ date, item, onClose, onSaved }: Props) {
  const [publishDate, setPublishDate] = useState(
    item?.publish_date ?? date ?? new Date().toISOString().split("T")[0]
  );
  const [brand, setBrand] = useState<Brand>(item?.brand ?? "NI");
  const [platform, setPlatform] = useState<Platform>(item?.platform ?? "Instagram");
  const [contentType, setContentType] = useState<ContentType | "">(item?.content_type ?? "");
  const [strategy, setStrategy] = useState<StrategyType | "">(item?.strategy ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [status] = useState<ContentStatus>(item?.status ?? "Draft");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [recurrenceEnd, setRecurrenceEnd] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split("T")[0];
  });
  const [loading, setLoading] = useState(false);

  const isEditing = !!item;
  const canSave = publishDate && brand && platform && contentType && strategy;
  const dateCount = !isEditing && recurrence !== "none"
    ? generateDates(publishDate, recurrence, recurrenceEnd).length
    : 1;

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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            {isEditing ? "Edit Content" : "Schedule Content"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4">

          {/* ─── Row 1: Date + Frequency + Until ─── */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Schedule
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={publishDate}
                onChange={(e) => setPublishDate(e.target.value)}
                className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              />
              {!isEditing && (
                <>
                  <select
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value as Recurrence)}
                    className="rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 bg-white"
                  >
                    {Object.entries(RECURRENCE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                  {recurrence !== "none" && (
                    <>
                      <span className="text-[11px] text-gray-400 shrink-0">until</span>
                      <input
                        type="date"
                        value={recurrenceEnd}
                        onChange={(e) => setRecurrenceEnd(e.target.value)}
                        className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                      />
                    </>
                  )}
                </>
              )}
            </div>
            {!isEditing && recurrence !== "none" && (
              <div className="text-[10px] text-gray-400 mt-1 tabular-nums">
                {dateCount} entries will be created
              </div>
            )}
          </div>

          {/* ─── Row 2: Brand (tag selection) ─── */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Brand
            </label>
            <div className="flex gap-2">
              {BRANDS.map((b) => (
                <button
                  key={b}
                  onClick={() => setBrand(b)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium border transition ${
                    brand === b
                      ? b === "NI"
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-violet-400 bg-violet-50 text-violet-700"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {b === "NI" ? "Natural Inspirations" : "Sassy"}
                </button>
              ))}
            </div>
          </div>

          {/* ─── Row 3: Platform (chips) ─── */}
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

          {/* ─── Row 4: Content Type (dropdown) ─── */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Content Type
            </label>
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 bg-white"
            >
              <option value="">Select type...</option>
              {CONTENT_TYPES.map((ct) => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>
          </div>

          {/* ─── Row 5: Strategy (dropdown) ─── */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Strategy
            </label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as StrategyType)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 bg-white"
            >
              <option value="">Select strategy...</option>
              {STRATEGIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* ─── Row 6: Note ─── */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Note <span className="text-gray-300">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief direction for the AI or team..."
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 resize-none"
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
              {loading ? "Saving..." : isEditing ? "Update" : dateCount > 1 ? `Schedule ${dateCount} entries` : "Schedule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
