"use client";

import { motion } from "framer-motion";
import { Search, ArrowUp, ArrowDown } from "lucide-react";
import clsx from "clsx";

export default function CustomersFilters({
  search,
  setSearch,
  sortDir,
  setSortDir,
}: {
  search: string;
  setSearch: (v: string) => void;
  sortDir: "asc" | "desc";
  setSortDir: (v: "asc" | "desc") => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.25 }}
      className="flex items-center justify-between"
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

      {/* Sort Direction Toggle */}
      <button
        onClick={() =>
          setSortDir(sortDir === "asc" ? "desc" : "asc")
        }
        className={clsx(
          "ml-6 flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition",
          "text-slate-600"
        )}
      >
        {sortDir === "asc" ? (
          <>
            <ArrowUp size={14} />
            Asc
          </>
        ) : (
          <>
            <ArrowDown size={14} />
            Desc
          </>
        )}
      </button>
    </motion.div>
  );
}