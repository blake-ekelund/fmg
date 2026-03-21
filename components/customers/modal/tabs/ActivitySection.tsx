"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  Send,
  PhoneCall,
  CalendarPlus,
  StickyNote,
  ClipboardList,
  RotateCcw,
  Trash2,
  Plus,
  Check,
  Clock,
  MapPin,
  AlertCircle,
  Paperclip,
} from "lucide-react";
import clsx from "clsx";

import type {
  CustomerActivity,
  ActivityType,
  ActivityStatus,
  NewActivity,
} from "../hooks/useCustomerActivities";
import ActivityModal from "./ActivityModal";

/* ─── Activity quick-action config (exported for header buttons) ─── */

export const ACTIVITY_TYPES: {
  value: ActivityType;
  label: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    value: "task",
    label: "Task",
    icon: <ClipboardList size={13} />,
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  {
    value: "call",
    label: "Call",
    icon: <PhoneCall size={13} />,
    color: "text-green-600 bg-green-50 border-green-200",
  },
  {
    value: "meeting",
    label: "Meeting",
    icon: <CalendarPlus size={13} />,
    color: "text-purple-600 bg-purple-50 border-purple-200",
  },
  {
    value: "follow_up",
    label: "Follow-up",
    icon: <RotateCcw size={13} />,
    color: "text-orange-600 bg-orange-50 border-orange-200",
  },
  {
    value: "email",
    label: "Email",
    icon: <Send size={13} />,
    color: "text-cyan-600 bg-cyan-50 border-cyan-200",
  },
  {
    value: "note",
    label: "Note",
    icon: <StickyNote size={13} />,
    color: "text-amber-600 bg-amber-50 border-amber-200",
  },
];

function getActivityConfig(type: ActivityType) {
  return ACTIVITY_TYPES.find((t) => t.value === type) ?? ACTIVITY_TYPES[5];
}

/* ─── Ref handle for external trigger ─── */

export type ActivitySectionHandle = {
  openForm: (type: ActivityType) => void;
};

/* ─── Modal state type ─── */

type ModalState =
  | { mode: "create"; type: ActivityType }
  | { mode: "edit"; activity: CustomerActivity }
  | null;

/* ─── Main Component ─── */

const ActivitySection = forwardRef<
  ActivitySectionHandle,
  {
    activities: CustomerActivity[];
    loading: boolean;
    onAdd: (a: NewActivity) => Promise<void>;
    onUpdate: (id: string, updates: Partial<NewActivity>) => Promise<void>;
    onToggleComplete: (id: string, status: ActivityStatus) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
  }
>(function ActivitySection({ activities, loading, onAdd, onUpdate, onToggleComplete, onDelete }, ref) {
  const [modal, setModal] = useState<ModalState>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    openForm(type: ActivityType) {
      setModal({ mode: "create", type });
    },
  }));

  // Split activities into open tasks and completed/logged history
  const openItems = activities.filter(
    (a) => a.status === "open" && ["task", "call", "meeting", "follow_up"].includes(a.type)
  );
  const timeline = activities.filter(
    (a) => !openItems.includes(a)
  );

  return (
    <>
      <div ref={containerRef} className="space-y-4">
        {/* ─── Open Tasks / Upcoming ─── */}
        {openItems.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Open Tasks & Upcoming
              </h3>
              <span className="text-[10px] font-medium text-gray-400 tabular-nums">
                {openItems.length} open
              </span>
            </div>

            <div className="space-y-1">
              {openItems.map((a) => {
                const cfg = getActivityConfig(a.type);
                const isOverdue = a.due_date && new Date(a.due_date) < new Date();

                return (
                  <div
                    key={a.id}
                    className={clsx(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 group transition cursor-pointer",
                      isOverdue ? "bg-red-50/50 hover:bg-red-50" : "hover:bg-gray-50"
                    )}
                    onClick={() => setModal({ mode: "edit", activity: a })}
                  >
                    {/* Complete checkbox — stop propagation so clicking it doesn't open modal */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleComplete(a.id, a.status);
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-gray-300 text-gray-300 hover:border-green-500 hover:text-green-500 transition shrink-0"
                    >
                      <Check size={10} className="opacity-0 group-hover:opacity-100" />
                    </button>

                    {/* Icon */}
                    <div
                      className={clsx(
                        "flex h-6 w-6 items-center justify-center rounded-full shrink-0",
                        cfg.color
                      )}
                    >
                      {cfg.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {a.subject}
                      </div>
                      {a.body && (
                        <div className="text-xs text-gray-500 truncate">{a.body}</div>
                      )}
                    </div>

                    {/* Meta (date, priority) */}
                    <div className="flex items-center gap-2 shrink-0">
                      {a.priority && (
                        <span
                          className={clsx("text-[10px] font-medium rounded px-1.5 py-0.5 capitalize", {
                            "bg-red-100 text-red-700": a.priority === "high",
                            "bg-amber-100 text-amber-700": a.priority === "medium",
                            "bg-gray-100 text-gray-500": a.priority === "low",
                          })}
                        >
                          {a.priority}
                        </span>
                      )}

                      {a.due_date && (
                        <span
                          className={clsx("inline-flex items-center gap-1 text-[11px] tabular-nums", {
                            "text-red-600 font-medium": isOverdue,
                            "text-gray-400": !isOverdue,
                          })}
                        >
                          {isOverdue && <AlertCircle size={10} />}
                          <Clock size={10} />
                          {formatShortDate(a.due_date)}
                        </span>
                      )}

                      {a.location && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                          <MapPin size={10} />
                          <span className="max-w-[80px] truncate">{a.location}</span>
                        </span>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(a.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Activity Timeline ─── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Timeline
            </h3>
            <button
              onClick={() => setModal({ mode: "create", type: "note" })}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600 transition"
            >
              <Plus size={12} /> Add
            </button>
          </div>

          {loading ? (
            <div className="py-4 text-sm text-gray-400">Loading…</div>
          ) : timeline.length === 0 && openItems.length === 0 ? (
            <div className="py-6 text-center">
              <div className="text-sm text-gray-400">No activity logged yet</div>
              <button
                onClick={() => setModal({ mode: "create", type: "note" })}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition"
              >
                <Plus size={12} /> Log your first activity
              </button>
            </div>
          ) : timeline.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-400">
              No completed or logged activity yet.
            </div>
          ) : (
            <div className="relative space-y-0">
              {/* Vertical timeline line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200" />

              {timeline.map((a) => {
                const cfg = getActivityConfig(a.type);
                const isCompleted = a.status === "completed";

                return (
                  <div
                    key={a.id}
                    className="relative flex gap-3 py-2.5 group cursor-pointer hover:bg-gray-50/50 rounded-lg -mx-1 px-1 transition"
                    onClick={() => setModal({ mode: "edit", activity: a })}
                  >
                    {/* Dot */}
                    <div
                      className={clsx(
                        "relative z-10 mt-0.5 flex h-[30px] w-[30px] items-center justify-center rounded-full border shrink-0",
                        isCompleted
                          ? "bg-green-50 text-green-600 border-green-200"
                          : cfg.color
                      )}
                    >
                      {isCompleted ? <Check size={13} /> : cfg.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span
                            className={clsx("text-sm font-medium", {
                              "text-gray-900": !isCompleted,
                              "text-gray-500 line-through": isCompleted,
                            })}
                          >
                            {a.subject}
                          </span>
                          <span className="ml-2 text-[10px] text-gray-400">
                            {formatRelativeTime(a.completed_at ?? a.created_at)}
                          </span>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(a.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition shrink-0 mt-0.5"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {a.body && (
                        <p className="mt-0.5 text-xs text-gray-500 whitespace-pre-wrap">
                          {a.body}
                        </p>
                      )}

                      {/* Metadata row */}
                      {(a.due_date || a.location || (a.attachments && a.attachments.length > 0)) && (
                        <div className="flex items-center flex-wrap gap-3 mt-1">
                          {a.due_date && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                              <Clock size={9} />
                              {formatShortDate(a.due_date)}
                            </span>
                          )}
                          {a.location && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                              <MapPin size={9} />
                              {a.location}
                            </span>
                          )}
                          {a.attachments && a.attachments.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                              <Paperclip size={9} />
                              {a.attachments.length} file{a.attachments.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Attachment links */}
                      {a.attachments && a.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {a.attachments.map((att, i) => (
                            <a
                              key={i}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-100 transition truncate max-w-[200px]"
                            >
                              <Paperclip size={9} className="shrink-0" />
                              {att.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Modal ─── */}
      {modal?.mode === "create" && (
        <ActivityModal
          initialType={modal.type}
          onSave={onAdd}
          onUpdate={onUpdate}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.mode === "edit" && (
        <ActivityModal
          activity={modal.activity}
          onSave={onAdd}
          onUpdate={onUpdate}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
});

export default ActivitySection;

/* ─── Helpers ─── */

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;

  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: diffDays > 365 ? "numeric" : undefined,
  });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}
