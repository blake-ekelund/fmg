"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Plus,
  Search,
  Clock,
  AlertCircle,
  Trash2,
  ChevronUp,
  ChevronDown,
  X,
  Check,
  Minus,
} from "lucide-react";
import clsx from "clsx";

import { supabase } from "@/lib/supabaseClient";
import { AddTaskModal, type Task, type TaskStatus } from "@/components/tasks/AddTaskModal";
import { DeleteTaskModal } from "@/components/tasks/DeleteTaskModal";
import { useTeamOwners, getOwnerColor } from "@/lib/team-owners";

/* ─── Main Page ─── */

export default function TaskListPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { owners } = useTeamOwners();

  // Filters
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [showDone, setShowDone] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>("todo");
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);

  // Multi-select: ids of checked tasks, plus the last one clicked (shift-click
  // selects the range between it and the next one, in on-screen order).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadTasks = useCallback(async () => {
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    setTasks((data as Task[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  /* ─── Filtering ─── */

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!showDone && (t.status ?? "todo") === "done") return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (ownerFilter && t.owner !== ownerFilter) return false;
      return true;
    });
  }, [tasks, search, ownerFilter, showDone]);

  // Selection only ever covers tasks you can see (filters drop hidden ones).
  const visibleIds = useMemo(() => new Set(filteredTasks.map((t) => t.id)), [filteredTasks]);
  const selectedIds = useMemo(() => [...selected].filter((id) => visibleIds.has(id)), [selected, visibleIds]);

  /* ─── Bulk actions ─── */

  async function bulkUpdate(patch: Partial<Pick<Task, "status" | "priority" | "owner" | "due_date" | "completed">>) {
    const ids = selectedIds;
    if (!ids.length) return;
    setBulkBusy(true);
    const idSet = new Set(ids);
    setTasks((prev) => prev.map((t) => (idSet.has(t.id) ? { ...t, ...patch } : t)));
    const { error } = await supabase.from("tasks").update(patch).in("id", ids);
    setBulkBusy(false);
    if (error) {
      alert(`Couldn't update the selected tasks: ${error.message}`);
      loadTasks();
    }
  }

  async function confirmBulkDelete() {
    const ids = selectedIds;
    if (!ids.length) return;
    setBulkBusy(true);
    const { error } = await supabase.from("tasks").delete().in("id", ids);
    setBulkBusy(false);
    setBulkDeleteOpen(false);
    if (error) {
      alert(`Couldn't delete the selected tasks: ${error.message}`);
    } else {
      setSelected(new Set());
    }
    loadTasks();
  }

  /* ─── Actions ─── */

  function openNewTask(status: TaskStatus = "todo") {
    setEditTask(null);
    setDefaultStatus(status);
    setModalOpen(true);
  }

  function openEditTask(task: Task) {
    setEditTask(task);
    setModalOpen(true);
  }

  async function changeStatus(task: Task, newStatus: TaskStatus) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, status: newStatus, completed: newStatus === "done" } : t
      )
    );
    await supabase
      .from("tasks")
      .update({ status: newStatus, completed: newStatus === "done" })
      .eq("id", task.id);
  }

  async function confirmDelete() {
    if (!deleteTask) return;
    await supabase.from("tasks").delete().eq("id", deleteTask.id);
    setDeleteTask(null);
    loadTasks();
  }

  return (
    <>
      <div className="px-4 md:px-8 py-4 md:py-5 space-y-3">
        {/* Filter bar + actions (single row) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-[260px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          {/* Owner pills */}
          <div className="flex gap-1">
            {owners.map((o) => (
              <button
                key={o}
                onClick={() => setOwnerFilter(ownerFilter === o ? "" : o)}
                className={clsx(
                  "rounded-lg border px-2 py-1 text-xs font-medium transition inline-flex items-center gap-1.5",
                  ownerFilter === o
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                )}
              >
                <span className={clsx("h-2 w-2 rounded-full", getOwnerColor(o))} />
                {o}
              </button>
            ))}
          </div>

          {/* Show completed toggle */}
          <button
            onClick={() => setShowDone(!showDone)}
            className={clsx(
              "rounded-lg border px-2 py-1 text-xs font-medium transition",
              showDone
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
            )}
            title={showDone ? "Hiding nothing — showing completed" : "Hiding completed tasks"}
          >
            {showDone ? "Hide completed" : "Show completed"}
          </button>

          {/* New task */}
          <button
            onClick={() => openNewTask("todo")}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-gray-800 transition"
          >
            <Plus size={14} />
            New task
          </button>
        </div>

        {/* ─── Bulk action bar (only while tasks are selected) ─── */}
        {selectedIds.length > 0 && (
          <BulkBar
            count={selectedIds.length}
            owners={owners}
            busy={bulkBusy}
            onStatus={(status) => {
              void bulkUpdate({ status, completed: status === "done" });
              // Finished tasks drop out of view — don't leave them silently ticked.
              if (status === "done" && !showDone) setSelected(new Set());
            }}
            onPriority={(priority) => bulkUpdate({ priority })}
            onOwner={(owner) => bulkUpdate({ owner })}
            onDueDate={(due_date) => bulkUpdate({ due_date })}
            onDelete={() => setBulkDeleteOpen(true)}
            onClear={() => setSelected(new Set())}
          />
        )}

        {/* ─── Content ─── */}
        <ListView
          tasks={filteredTasks}
          loading={loading}
          selected={selected}
          onSelectionChange={setSelected}
          onClickTask={openEditTask}
          onStatusChange={changeStatus}
          onDelete={(t) => setDeleteTask(t)}
          onAdd={openNewTask}
        />
      </div>

      {/* Modals */}
      <AddTaskModal
        open={modalOpen}
        task={editTask}
        defaultStatus={defaultStatus}
        onClose={() => setModalOpen(false)}
        onSaved={loadTasks}
      />
      <DeleteTaskModal
        open={!!deleteTask}
        taskName={deleteTask?.name}
        onCancel={() => setDeleteTask(null)}
        onConfirm={confirmDelete}
      />
      <DeleteTaskModal
        open={bulkDeleteOpen}
        taskName={`${selectedIds.length} selected task${selectedIds.length === 1 ? "" : "s"}`}
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={confirmBulkDelete}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════
   LIST VIEW — single flat table
   ═══════════════════════════════════════════════════ */

type SortKey = "name" | "status" | "priority" | "due_date" | "owner";
type SortDir = "asc" | "desc";

const STATUS_WEIGHT: Record<string, number> = { in_progress: 0, todo: 1, done: 2 };
const PRIORITY_WEIGHT: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

function compareNullable(
  a: string | null | undefined,
  b: string | null | undefined,
  cmp: (x: string, y: string) => number,
): number {
  const ae = a == null || a === "";
  const be = b == null || b === "";
  if (ae && be) return 0;
  if (ae) return 1;  // empty values always last
  if (be) return -1;
  return cmp(a as string, b as string);
}

function defaultSort(a: Task, b: Task): number {
  const sa = STATUS_WEIGHT[a.status ?? "todo"] ?? 1;
  const sb = STATUS_WEIGHT[b.status ?? "todo"] ?? 1;
  if (sa !== sb) return sa - sb;
  const pa = PRIORITY_WEIGHT[a.priority ?? "Medium"] ?? 1;
  const pb = PRIORITY_WEIGHT[b.priority ?? "Medium"] ?? 1;
  if (pa !== pb) return pa - pb;
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function ListView({
  tasks,
  loading,
  selected,
  onSelectionChange,
  onClickTask,
  onStatusChange,
  onDelete,
  onAdd,
}: {
  tasks: Task[];
  loading: boolean;
  selected: Set<string>;
  onSelectionChange: (update: (prev: Set<string>) => Set<string>) => void;
  onClickTask: (t: Task) => void;
  onStatusChange: (t: Task, s: TaskStatus) => void;
  onDelete: (t: Task) => void;
  onAdd: (status: TaskStatus) => void;
}) {
  // sortKey === null means "use the smart default sort" (status → priority → due).
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedTasks = useMemo(() => {
    if (sortKey === null) {
      return [...tasks].sort(defaultSort);
    }
    const mult = sortDir === "asc" ? 1 : -1;
    return [...tasks].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "status": {
          const sa = STATUS_WEIGHT[a.status ?? "todo"] ?? 1;
          const sb = STATUS_WEIGHT[b.status ?? "todo"] ?? 1;
          cmp = sa - sb;
          break;
        }
        case "priority": {
          const pa = PRIORITY_WEIGHT[a.priority ?? "Medium"] ?? 1;
          const pb = PRIORITY_WEIGHT[b.priority ?? "Medium"] ?? 1;
          cmp = pa - pb;
          break;
        }
        case "due_date":
          // For dates we don't multiply nulls — empty values always trail.
          return compareNullable(a.due_date, b.due_date, (x, y) =>
            (x.localeCompare(y)) * mult,
          );
        case "owner":
          return compareNullable(a.owner, b.owner, (x, y) =>
            (x.localeCompare(y)) * mult,
          );
      }
      if (cmp !== 0) return cmp * mult;
      // Stable tiebreaker on name so the order doesn't jitter.
      return a.name.localeCompare(b.name);
    });
  }, [tasks, sortKey, sortDir]);

  // Shift-click range anchor (a task id, in on-screen order).
  const [anchor, setAnchor] = useState<string | null>(null);
  const visibleSelected = sortedTasks.filter((t) => selected.has(t.id)).length;
  const allState: "none" | "some" | "all" =
    visibleSelected === 0 ? "none" : visibleSelected === sortedTasks.length ? "all" : "some";

  // Updaters build on the latest selection, so quick successive clicks
  // never overwrite each other.
  function toggleOne(task: Task, shift: boolean) {
    const ids = sortedTasks.map((t) => t.id);
    const a = shift && anchor ? ids.indexOf(anchor) : -1;
    const b = ids.indexOf(task.id);
    onSelectionChange((prev) => {
      const next = new Set(prev);
      if (a !== -1 && b !== -1) {
        const on = !prev.has(task.id);
        for (const id of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) {
          if (on) next.add(id);
          else next.delete(id);
        }
      } else if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
    setAnchor(task.id);
  }

  function toggleAll() {
    const all = allState === "all";
    onSelectionChange((prev) => {
      const next = new Set(prev);
      for (const t of sortedTasks) {
        if (all) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });
  }

  const tableHeader = (
    <div className="hidden md:grid grid-cols-[20px_1fr_120px_72px_92px_44px_28px] gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50/50 items-center">
      <Checkbox
        state={allState}
        onToggle={toggleAll}
        label={allState === "all" ? "Unselect all tasks" : "Select all tasks"}
        disabled={sortedTasks.length === 0}
      />
      <SortHeader label="Task" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
      <SortHeader label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
      <SortHeader label="Priority" sortKey="priority" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
      <SortHeader label="Due Date" sortKey="due_date" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
      <SortHeader label="Owner" sortKey="owner" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
      <span />
    </div>
  );

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div className="px-4 py-6 text-center text-sm text-gray-400">
        Loading tasks…
      </div>
    );
  } else if (sortedTasks.length === 0) {
    body = (
      <button
        type="button"
        onClick={() => onAdd("todo")}
        className="w-full flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition"
      >
        <Plus size={14} />
        Create task
      </button>
    );
  } else {
    body = (
      <div className="divide-y divide-gray-100">
        {sortedTasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            selected={selected.has(task.id)}
            onToggleSelect={(shift) => toggleOne(task, shift)}
            onClick={() => onClickTask(task)}
            onStatusChange={(s) => onStatusChange(task, s)}
            onDelete={() => onDelete(task)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {tableHeader}
      {body}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={clsx(
        "inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider transition text-left",
        active ? "text-gray-700" : "text-gray-400 hover:text-gray-600",
      )}
    >
      <span>{label}</span>
      {active ? (
        dir === "asc" ? (
          <ChevronUp size={11} />
        ) : (
          <ChevronDown size={11} />
        )
      ) : (
        <ChevronUp size={11} className="opacity-0 group-hover:opacity-30" />
      )}
    </button>
  );
}

/* ─── Task Row ─── */

const STATUS_DROPDOWN: { value: TaskStatus; label: string; dot: string }[] = [
  { value: "todo", label: "To Do", dot: "bg-gray-400" },
  { value: "in_progress", label: "In Progress", dot: "bg-blue-500" },
  { value: "done", label: "Done", dot: "bg-green-500" },
];

function TaskRow({
  task,
  selected,
  onToggleSelect,
  onClick,
  onStatusChange,
  onDelete,
}: {
  task: Task;
  selected: boolean;
  onToggleSelect: (shift: boolean) => void;
  onClick: () => void;
  onStatusChange: (s: TaskStatus) => void;
  onDelete: () => void;
}) {
  const isDone = task.status === "done";
  const isOverdue = task.due_date && new Date(task.due_date + "T23:59:59") < new Date() && !isDone;
  const currentStatus = STATUS_DROPDOWN.find((s) => s.value === (task.status ?? "todo")) ?? STATUS_DROPDOWN[0];

  return (
    <div
      onClick={onClick}
      className={clsx(
        "grid grid-cols-[20px_1fr] md:grid-cols-[20px_1fr_120px_72px_92px_44px_28px] gap-2 md:gap-3 px-4 py-2 group cursor-pointer transition items-center",
        selected
          ? "bg-blue-50/70 hover:bg-blue-50"
          : isOverdue
            ? "bg-red-50/40 hover:bg-red-50/60"
            : "hover:bg-gray-50"
      )}
    >
      {/* Select */}
      <Checkbox
        state={selected ? "all" : "none"}
        onToggle={(shift) => onToggleSelect(shift)}
        label={selected ? `Unselect ${task.name}` : `Select ${task.name}`}
      />

      {/* Task name + description */}
      <div className="min-w-0">
        <div className={clsx("text-sm font-medium truncate", isDone ? "text-gray-400 line-through" : "text-gray-900")}>
          {task.name}
        </div>
        {task.description && (
          <div className="text-xs text-gray-500 truncate mt-0.5">{task.description}</div>
        )}
      </div>

      {/* Status dropdown */}
      <div onClick={(e) => e.stopPropagation()} className="col-start-2 md:col-start-auto">
        <select
          value={task.status ?? "todo"}
          onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
          className={clsx(
            "w-full rounded-md border px-2 py-1 text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-300 transition",
            task.status === "done"
              ? "border-green-200 bg-green-50 text-green-700"
              : task.status === "in_progress"
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-gray-200 bg-gray-50 text-gray-700"
          )}
        >
          {STATUS_DROPDOWN.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Priority */}
      <div className="col-start-2 md:col-start-auto">
        {task.priority ? (
          <span
            className={clsx("text-[10px] font-medium rounded px-1.5 py-0.5", {
              "bg-red-100 text-red-700": task.priority === "High",
              "bg-amber-100 text-amber-700": task.priority === "Medium",
              "bg-gray-100 text-gray-500": task.priority === "Low",
            })}
          >
            {task.priority}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </div>

      {/* Due date */}
      <div className="col-start-2 md:col-start-auto">
        {task.due_date ? (
          <span
            className={clsx("inline-flex items-center gap-1 text-[11px] tabular-nums whitespace-nowrap", {
              "text-red-600 font-medium": isOverdue,
              "text-gray-500": !isOverdue,
            })}
          >
            {isOverdue && <AlertCircle size={10} />}
            <Clock size={10} />
            {formatDate(task.due_date)}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </div>

      {/* Owner avatar */}
      <div className="col-start-2 md:col-start-auto">
        {task.owner ? (
          <span
            className={clsx(
              "inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold text-white",
              getOwnerColor(task.owner)
            )}
            title={task.owner}
          >
            {task.owner[0]}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </div>

      {/* Delete */}
      <div className="col-start-2 md:col-start-auto">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/* ─── Selection checkbox ─── */

function Checkbox({
  state,
  onToggle,
  label,
  disabled,
}: {
  state: "none" | "some" | "all";
  onToggle: (shift: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(e.shiftKey);
      }}
      className={clsx(
        "flex h-4 w-4 items-center justify-center rounded border transition disabled:opacity-30",
        state === "none"
          ? "border-gray-300 bg-white hover:border-gray-500"
          : "border-gray-900 bg-gray-900 text-white"
      )}
    >
      {state === "all" ? <Check size={11} strokeWidth={3} /> : state === "some" ? <Minus size={11} strokeWidth={3} /> : null}
    </button>
  );
}

/* ─── Bulk action bar ─── */

const PRIORITIES = ["High", "Medium", "Low"] as const;

function BulkBar({
  count,
  owners,
  busy,
  onStatus,
  onPriority,
  onOwner,
  onDueDate,
  onDelete,
  onClear,
}: {
  count: number;
  owners: string[];
  busy: boolean;
  onStatus: (s: TaskStatus) => void;
  onPriority: (p: string) => void;
  onOwner: (o: string | null) => void;
  onDueDate: (d: string | null) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const selectClass =
    "rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/30 [&>option]:text-gray-900";
  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-white shadow-lg">
      <span className="px-1 text-sm font-medium tabular-nums">
        {count} selected
      </span>
      <span className="h-4 w-px bg-white/20" />
      <select
        aria-label="Set status"
        value=""
        disabled={busy}
        onChange={(e) => e.target.value && onStatus(e.target.value as TaskStatus)}
        className={selectClass}
      >
        <option value="">Status…</option>
        {STATUS_DROPDOWN.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <select
        aria-label="Set priority"
        value=""
        disabled={busy}
        onChange={(e) => e.target.value && onPriority(e.target.value)}
        className={selectClass}
      >
        <option value="">Priority…</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <select
        aria-label="Set owner"
        value=""
        disabled={busy}
        onChange={(e) => {
          if (!e.target.value) return;
          onOwner(e.target.value === "__none" ? null : e.target.value);
        }}
        className={selectClass}
      >
        <option value="">Owner…</option>
        {owners.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value="__none">No owner</option>
      </select>
      <label className="inline-flex items-center gap-1.5 text-xs text-white/70">
        Due
        <input
          type="date"
          aria-label="Set due date"
          disabled={busy}
          onChange={(e) => e.target.value && onDueDate(e.target.value)}
          className="rounded-lg border border-white/15 bg-white/10 px-2 py-0.5 text-xs text-white [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-white/30"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => onDueDate(null)}
          className="rounded px-1 text-white/60 hover:text-white"
          title="Clear the due date"
        >
          clear
        </button>
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-white/10 hover:text-rose-200"
      >
        <Trash2 size={13} /> Delete
      </button>
      <button
        type="button"
        onClick={onClear}
        className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
        aria-label="Clear selection"
        title="Clear selection"
      >
        <X size={15} />
      </button>
    </div>
  );
}

/* ─── Helpers ─── */

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
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
