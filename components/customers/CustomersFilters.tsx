"use client";

import { motion } from "framer-motion";
import { Search } from "lucide-react";

type Option = { label: string; value: string };

export default function CustomersFilters({
  search,
  setSearch,
  status,
  setStatus,
  statusOptions,
  channel,
  setChannel,
  channelOptions,
}: {
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
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.25 }}
      className="flex items-center justify-between gap-6 flex-wrap"
    >
      {/* Search */}
      <div className="relative w-full max-w-md">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer..."
          className="w-full bg-white border border-slate-200/70 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/60 transition"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={statusOptions}
        />

        <FilterSelect
          label="Channel"
          value={channel}
          onChange={setChannel}
          options={channelOptions}
        />
      </div>
    </motion.div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div className="flex flex-col text-xs">
      <span className="text-slate-400 mb-1">{label}</span>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300/60 transition"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}