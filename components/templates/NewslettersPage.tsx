"use client";

import { useState, useCallback } from "react";
import {
  Plus,
  Send,
  Eye,
  Pencil,
  Trash2,
  Copy,
  Newspaper,
  Mail,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Store,
  ShoppingBag,
  Calendar,
} from "lucide-react";
import clsx from "clsx";

import { useTemplates } from "./useTemplates";
import type { EmailTemplate, Brand, Channel } from "./types";
import BlockRenderer from "./BlockRenderer";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

/* ─── Newsletter Send Modal ─── */
function SendModal({
  template,
  onClose,
  onSend,
}: {
  template: EmailTemplate;
  onClose: () => void;
  onSend: (opts: { brand: Brand; channel: Channel; scheduledAt?: string }) => void;
}) {
  const [brand, setBrand] = useState<Brand>(template.brand ?? "both");
  const [channel, setChannel] = useState<Channel>(template.channel ?? "both");
  const [sendType, setSendType] = useState<"now" | "scheduled">("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");

  function handleSend() {
    const scheduledAt =
      sendType === "scheduled" && scheduledDate
        ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
        : undefined;
    onSend({ brand, channel, scheduledAt });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Send size={18} className="text-blue-600" />
            Send Newsletter
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure and send "{template.name}" to your audience.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Audience */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Brand Audience</label>
            <div className="flex gap-2 mt-1.5">
              {(["both", "ni", "sassy"] as Brand[]).map((b) => (
                <button
                  key={b}
                  onClick={() => setBrand(b)}
                  className={clsx(
                    "flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition",
                    brand === b
                      ? b === "ni" ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : b === "sassy" ? "bg-pink-50 border-pink-300 text-pink-700"
                        : "bg-blue-50 border-blue-300 text-blue-700"
                      : "border-gray-200 text-gray-400 hover:bg-gray-50"
                  )}
                >
                  {b === "both" ? "Both Brands" : b === "ni" ? "Natural Inspirations" : "Sassy"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Channel</label>
            <div className="flex gap-2 mt-1.5">
              {(["both", "wholesale", "d2c"] as Channel[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={clsx(
                    "flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition flex items-center justify-center gap-1.5",
                    channel === c ? "bg-gray-900 border-gray-900 text-white" : "border-gray-200 text-gray-400 hover:bg-gray-50"
                  )}
                >
                  {c === "wholesale" && <Store size={12} />}
                  {c === "d2c" && <ShoppingBag size={12} />}
                  {c === "both" && <Users size={12} />}
                  {c === "both" ? "All" : c === "wholesale" ? "Wholesale" : "D2C"}
                </button>
              ))}
            </div>
          </div>

          {/* Timing */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">When</label>
            <div className="flex gap-2 mt-1.5">
              <button
                onClick={() => setSendType("now")}
                className={clsx(
                  "flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition flex items-center justify-center gap-1.5",
                  sendType === "now" ? "bg-gray-900 border-gray-900 text-white" : "border-gray-200 text-gray-400 hover:bg-gray-50"
                )}
              >
                <Send size={12} />
                Send Now
              </button>
              <button
                onClick={() => setSendType("scheduled")}
                className={clsx(
                  "flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition flex items-center justify-center gap-1.5",
                  sendType === "scheduled" ? "bg-gray-900 border-gray-900 text-white" : "border-gray-200 text-gray-400 hover:bg-gray-50"
                )}
              >
                <Calendar size={12} />
                Schedule
              </button>
            </div>
            {sendType === "scheduled" && (
              <div className="flex gap-2 mt-2">
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg"
                />
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-28 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg"
                />
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="rounded-xl bg-blue-50/50 border border-blue-100 px-4 py-3 text-xs text-blue-700 space-y-1">
            <div className="font-semibold">Send Summary</div>
            <div className="text-blue-600">
              Sending to {brand === "both" ? "all brand" : brand === "ni" ? "Natural Inspirations" : "Sassy"}{" "}
              {channel === "both" ? "customers" : channel === "wholesale" ? "wholesale accounts" : "D2C customers"}{" "}
              {sendType === "now" ? "immediately" : scheduledDate ? `on ${scheduledDate} at ${scheduledTime}` : "at scheduled time"}.
            </div>
          </div>
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm"
          >
            <Send size={12} />
            {sendType === "now" ? "Send Now" : "Schedule Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function NewslettersPage() {
  const { templates, loading, save, remove, duplicate } = useTemplates("newsletter");
  const [sendingTemplate, setSendingTemplate] = useState<EmailTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);

  function handleSend(opts: { brand: Brand; channel: Channel; scheduledAt?: string }) {
    // In production, this would call an API to queue the newsletter
    alert(
      `Newsletter "${sendingTemplate?.name}" queued!\n\nBrand: ${opts.brand}\nChannel: ${opts.channel}\n${opts.scheduledAt ? `Scheduled: ${opts.scheduledAt}` : "Sending immediately"}`
    );
    setSendingTemplate(null);
  }

  function handleCreateNewsletter() {
    // Create a new newsletter template and redirect to the editor
    window.location.href = "/templates";
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Newsletters</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Send branded newsletters to your Wholesale and D2C customers.
          </p>
        </div>
        <button
          onClick={handleCreateNewsletter}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition shadow-sm"
        >
          <Plus size={16} />
          New Newsletter
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Templates</div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">{templates.length}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Active</div>
          <div className="text-xl font-bold text-emerald-600 mt-0.5">
            {templates.filter((t) => t.status === "active").length}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Drafts</div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">
            {templates.filter((t) => t.status === "draft").length}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Total Sent</div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">0</div>
        </div>
      </div>

      {/* Newsletter list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading newsletters...</div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Newspaper size={48} className="text-gray-200 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">No newsletters yet</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">
            Create a newsletter template in the Email Templates editor, then send it to your customers here.
          </p>
          <button
            onClick={handleCreateNewsletter}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition"
          >
            <Plus size={16} />
            Create Newsletter
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4 px-5 py-4">
                {/* Preview thumbnail */}
                <div className="w-20 h-20 flex-shrink-0 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden flex items-center justify-center">
                  {t.blocks.length > 0 ? (
                    <div className="w-full scale-[0.25] origin-top-left pointer-events-none">
                      {t.blocks.slice(0, 2).map((b) => (
                        <BlockRenderer key={b.id} block={b} selected={false} onSelect={() => {}} />
                      ))}
                    </div>
                  ) : (
                    <Newspaper size={24} className="text-gray-200" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-800 truncate">{t.name || "Untitled"}</h3>
                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                        t.status === "draft" && "bg-gray-100 text-gray-500",
                        t.status === "active" && "bg-emerald-100 text-emerald-700",
                        t.status === "archived" && "bg-red-100 text-red-600"
                      )}
                    >
                      {t.status}
                    </span>
                    {t.brand && t.brand !== "both" && (
                      <span className={clsx("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", t.brand === "ni" ? "bg-emerald-100 text-emerald-700" : "bg-pink-100 text-pink-700")}>
                        {t.brand === "ni" ? "NI" : "Sassy"}
                      </span>
                    )}
                  </div>
                  {t.subject && <p className="text-xs text-gray-500 truncate mt-0.5">{t.subject}</p>}
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      Updated {new Date(t.updated_at).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail size={10} />
                      {t.blocks.length} blocks
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => window.location.href = "/templates"}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 transition"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                  <button
                    onClick={() => setSendingTemplate(t)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm"
                  >
                    <Send size={12} />
                    Send
                  </button>
                  <button
                    onClick={() => duplicate(t)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                    title="Duplicate"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(t)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Send Modal */}
      {sendingTemplate && (
        <SendModal
          template={sendingTemplate}
          onClose={() => setSendingTemplate(null)}
          onSend={handleSend}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name || "Untitled"}"?`}
        description="This will permanently delete this newsletter template."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            remove(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
