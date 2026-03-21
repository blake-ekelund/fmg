"use client";

import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown } from "lucide-react";
import clsx from "clsx";

export type CustomersHeaderStats = {
  active: number;
  atRisk: number;
  churned: number;
};

export default function CustomersHeader({
  stats,
  onDownload,
  downloading,
  exportColumns,
  setExportColumns,
}: {
  stats: CustomersHeaderStats;
  onDownload: () => void;
  downloading?: boolean;
  exportColumns: Record<string, boolean>;
  setExportColumns: (cols: Record<string, boolean>) => void;
}) {
  const total = stats.active + stats.atRisk + stats.churned;
  const [showExportPicker, setShowExportPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  /* Close on outside click */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowExportPicker(false);
      }
    }
    if (showExportPicker) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showExportPicker]);

  function toggleColumn(key: string) {
    setExportColumns({ ...exportColumns, [key]: !exportColumns[key] });
  }

  const selectedCount = Object.values(exportColumns).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* KPI chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <KpiChip label="Total" value={total} />
        <KpiChip label="Active" value={stats.active} color="green" />
        <KpiChip label="At Risk" value={stats.atRisk} color="amber" />
        <KpiChip label="Churned" value={stats.churned} color="gray" />
      </div>

      {/* Export with column picker */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowExportPicker((v) => !v)}
          disabled={downloading}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition disabled:opacity-50"
        >
          <Download size={14} />
          {downloading ? "Exporting\u2026" : "Export CSV"}
          <ChevronDown size={12} />
        </button>

        {showExportPicker && (
          <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg z-50 py-2">
            <div className="px-3 pb-2 border-b border-gray-100">
              <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                Select columns
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto py-1">
              {Object.keys(exportColumns).map((col) => (
                <label
                  key={col}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={exportColumns[col]}
                    onChange={() => toggleColumn(col)}
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-300"
                  />
                  <span className="text-xs text-gray-700">{col}</span>
                </label>
              ))}
            </div>

            <div className="px-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => {
                  setShowExportPicker(false);
                  onDownload();
                }}
                disabled={selectedCount === 0 || downloading}
                className="w-full rounded-lg bg-gray-900 text-white px-3 py-2 text-xs font-medium hover:bg-gray-800 transition disabled:opacity-50"
              >
                Export Selected ({selectedCount})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "green" | "amber" | "gray";
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span
        className={clsx(
          "text-sm font-semibold tabular-nums",
          color === "green" && "text-green-600",
          color === "amber" && "text-amber-600",
          color === "gray" && "text-gray-400",
          !color && "text-gray-900"
        )}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}
