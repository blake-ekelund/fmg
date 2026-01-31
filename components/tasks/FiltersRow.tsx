"use client";

type Props = {
  search: string;
  status: string;
  owner: string;
  priority: string;

  onSearchChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onOwnerChange: (v: string) => void;
  onPriorityChange: (v: string) => void;
};

export function FiltersRow({
  search,
  status,
  owner,
  priority,
  onSearchChange,
  onStatusChange,
  onOwnerChange,
  onPriorityChange,
}: Props) {
  return (
    <section className="flex flex-col md:flex-row md:items-center gap-4">
      {/* Search */}
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search tasks"
        className="
          flex-1
          rounded-xl
          border border-gray-200
          px-4 py-2
          text-sm
          focus:outline-none
          focus:ring-1 focus:ring-gray-300
        "
      />

      {/* Owner */}
      <select
        value={owner}
        onChange={(e) => onOwnerChange(e.target.value)}
        className="rounded-xl border border-gray-200 px-4 py-2 text-sm bg-white"
      >
        <option value="">All Owners</option>
        <option>Blake</option>
        <option>Brooke</option>
        <option>Julie</option>
        <option>Liz</option>
      </select>

      {/* Status */}
      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
        className="rounded-xl border border-gray-200 px-4 py-2 text-sm bg-white"
      >
        <option value="">All Statuses</option>
        <option value="open">Open</option>
        <option value="completed">Completed</option>
      </select>

      {/* Priority */}
      <select
        value={priority}
        onChange={(e) => onPriorityChange(e.target.value)}
        className="rounded-xl border border-gray-200 px-4 py-2 text-sm bg-white"
      >
        <option value="">All Priorities</option>
        <option>High</option>
        <option>Medium</option>
        <option>Low</option>
      </select>
    </section>
  );
}
