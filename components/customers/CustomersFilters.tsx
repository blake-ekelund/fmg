"use client";

import { Search } from "lucide-react";
import clsx from "clsx";
import type { CustomerViewMode } from "./constants";

type Option = { label: string; value: string };

export default function CustomersFilters({
  viewMode = "wholesale",
  search,
  setSearch,
  status,
  setStatus,
  statusOptions,
  channel,
  setChannel,
  channelOptions,
}: {
  viewMode?: CustomerViewMode;
  search: string;
  setSearch: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  statusOptions: Option[];
  channel: string;
  setChannel: (v: string) => void;
  channelOptions: Option[];
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Search */}
      <div className="relative flex-1 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={viewMode === "d2c" ? "Search name or email…" : "Search customer…"}
          className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
        />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-3">
        {/* Status pills */}
        <div className="flex gap-1">
          <PillButton active={status === ""} onClick={() => setStatus("")}>
            All
          </PillButton>
          {statusOptions.map((opt) => (
            <PillButton
              key={opt.value}
              active={status === opt.value}
              onClick={() => setStatus(status === opt.value ? "" : opt.value)}
              color={
                opt.value === "active" ? "green" :
                opt.value === "at_risk" ? "amber" :
                opt.value === "churned" ? "gray" : undefined
              }
            >
              {opt.label}
            </PillButton>
          ))}
        </div>

        {/* Channel select (wholesale only) */}
        {viewMode === "wholesale" && channelOptions.length > 0 && (
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
          >
            <option value="">All Channels</option>
            {channelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function PillButton({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: "green" | "amber" | "gray" | "blue";
  children: React.ReactNode;
}) {
  let activeClasses = "bg-gray-900 text-white border-gray-900";
  if (color === "green") activeClasses = "bg-green-50 text-green-700 border-green-200";
  if (color === "amber") activeClasses = "bg-amber-50 text-amber-700 border-amber-200";
  if (color === "gray") activeClasses = "bg-gray-100 text-gray-600 border-gray-300";
  if (color === "blue") activeClasses = "bg-blue-50 text-blue-700 border-blue-200";

  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-lg px-3 py-2 text-xs font-medium border transition",
        active ? activeClasses : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
      )}
    >
      {children}
    </button>
  );
}
