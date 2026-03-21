"use client";

import { useRef, useState } from "react";
import { X, Paperclip, FileText, Trash2 } from "lucide-react";
import clsx from "clsx";

import type {
  ActivityType,
  ActivityPriority,
  CustomerActivity,
  NewActivity,
} from "../hooks/useCustomerActivities";
import { ACTIVITY_TYPES } from "./ActivitySection";

/* ─── Type-specific field config ─── */

const HAS_DUE_DATE: ActivityType[] = ["task", "follow_up", "call"];
const HAS_MEETING_DATE: ActivityType[] = ["meeting"];
const HAS_PRIORITY: ActivityType[] = ["task", "follow_up"];
const HAS_LOCATION: ActivityType[] = ["meeting"];

function needsDueDate(type: ActivityType) {
  return HAS_DUE_DATE.includes(type);
}
function needsMeetingDate(type: ActivityType) {
  return HAS_MEETING_DATE.includes(type);
}
function needsPriority(type: ActivityType) {
  return HAS_PRIORITY.includes(type);
}
function needsLocation(type: ActivityType) {
  return HAS_LOCATION.includes(type);
}

function getDateLabel(type: ActivityType) {
  if (type === "call") return "Scheduled Date";
  if (type === "meeting") return "Meeting Date";
  return "Due Date";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Parse an ISO date string into separate date + time parts */
function parseDateParts(isoStr: string | null | undefined): { date: string; time: string } {
  if (!isoStr) return { date: "", time: "" };
  try {
    const d = new Date(isoStr);
    const date = d.toISOString().split("T")[0]; // YYYY-MM-DD
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    const time = hours === "00" && mins === "00" ? "" : `${hours}:${mins}`;
    return { date, time };
  } catch {
    return { date: "", time: "" };
  }
}

/* ─── Component ─── */

export default function ActivityModal({
  initialType,
  activity,
  onSave,
  onUpdate,
  onClose,
}: {
  initialType?: ActivityType;
  /** If provided, we're editing an existing activity */
  activity?: CustomerActivity;
  onSave: (activity: NewActivity) => Promise<void>;
  onUpdate?: (id: string, updates: Partial<NewActivity>) => Promise<void>;
  onClose: () => void;
}) {
  const isEditing = !!activity;
  const dateParts = parseDateParts(activity?.due_date);

  const [type, setType] = useState<ActivityType>(activity?.type ?? initialType ?? "task");
  const [subject, setSubject] = useState(activity?.subject ?? "");
  const [body, setBody] = useState(activity?.body ?? "");
  const [dueDate, setDueDate] = useState(dateParts.date);
  const [dueTime, setDueTime] = useState(dateParts.time);
  const [priority, setPriority] = useState<ActivityPriority>(activity?.priority ?? "medium");
  const [location, setLocation] = useState(activity?.location ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickingFile = useRef(false);

  const activeCfg = ACTIVITY_TYPES.find((t) => t.value === type);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    pickingFile.current = false;
    const selected = e.target.files;
    if (!selected) return;
    setFiles((prev) => [...prev, ...Array.from(selected)]);
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;

    setSaving(true);

    const payload: NewActivity = {
      type,
      subject: subject.trim(),
      body: body.trim() || undefined,
      due_date:
        (needsDueDate(type) || needsMeetingDate(type)) && dueDate
          ? dueTime
            ? `${dueDate}T${dueTime}`
            : `${dueDate}T00:00`
          : null,
      priority: needsPriority(type) ? priority : null,
      location: needsLocation(type) ? location.trim() || null : null,
      files: files.length > 0 ? files : undefined,
    };

    if (isEditing && onUpdate) {
      await onUpdate(activity.id, payload);
    } else {
      await onSave(payload);
    }

    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => {
          if (!pickingFile.current) onClose();
        }}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            {isEditing && activeCfg && (
              <span className={clsx("inline-flex items-center justify-center h-6 w-6 rounded-full", activeCfg.color)}>
                {activeCfg.icon}
              </span>
            )}
            <span className="text-sm font-semibold text-gray-900">
              {isEditing ? `Edit ${activeCfg?.label ?? "Action"}` : "New Action"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — scrollable */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Type selector pills */}
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              Type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ACTIVITY_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                    type === t.value
                      ? t.color
                      : "text-gray-400 bg-white border-gray-200 hover:border-gray-300"
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              Subject
            </label>
            <input
              autoFocus
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={
                type === "call"
                  ? "e.g. Follow up on Q1 order"
                  : type === "meeting"
                  ? "e.g. Quarterly business review"
                  : type === "task"
                  ? "e.g. Send updated price list"
                  : type === "follow_up"
                  ? "e.g. Check on sample delivery"
                  : "Subject…"
              }
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          {/* Date + Time fields (conditional) */}
          {(needsDueDate(type) || needsMeetingDate(type)) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                  {getDateLabel(type)}
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Time <span className="normal-case text-gray-300">(optional)</span>
                </label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
            </div>
          )}

          {/* Priority + Location row */}
          {(needsPriority(type) || needsLocation(type)) && (
            <div className={clsx("grid gap-4", needsPriority(type) && needsLocation(type) ? "grid-cols-2" : "grid-cols-1")}>
              {needsPriority(type) && (
                <div>
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Priority
                  </label>
                  <div className="flex gap-1.5">
                    {(["low", "medium", "high"] as ActivityPriority[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={clsx(
                          "flex-1 py-1.5 rounded-lg border text-xs font-medium capitalize transition",
                          priority === p
                            ? p === "high"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : p === "medium"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-gray-100 text-gray-600 border-gray-300"
                            : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {needsLocation(type) && (
                <div>
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Location
                  </label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Zoom, Office…"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
              )}
            </div>
          )}

          {/* Notes / Body */}
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              {type === "note" || type === "email" ? "Details" : "Notes"}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                type === "email"
                  ? "Email summary or talking points…"
                  : "Additional details (optional)…"
              }
              rows={3}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
            />
          </div>

          {/* Existing attachments (edit mode) */}
          {isEditing && activity.attachments && activity.attachments.length > 0 && (
            <div>
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                Current Attachments
              </label>
              <div className="space-y-1.5">
                {activity.attachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 hover:bg-gray-100 transition"
                  >
                    <Paperclip size={14} className="text-gray-400 shrink-0" />
                    <span className="text-xs font-medium text-gray-700 truncate flex-1">
                      {att.name}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {formatFileSize(att.size)}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* New Attachments */}
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              {isEditing && activity.attachments?.length ? "Add Attachments" : "Attachments"}
            </label>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              onBlur={() => { pickingFile.current = false; }}
              className="hidden"
            />

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {files.map((file, i) => (
                  <div
                    key={`${file.name}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                  >
                    <FileText size={14} className="text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-700 truncate">
                        {file.name}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-gray-400 hover:text-red-500 transition shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                pickingFile.current = true;
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700 transition w-full justify-center"
            >
              <Paperclip size={13} />
              {files.length > 0 ? "Add more files" : "Attach files"}
            </button>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !subject.trim()}
              className="px-5 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40"
            >
              {saving ? "Saving…" : isEditing ? "Update" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
