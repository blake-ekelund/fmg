"use client";

import { useState, useRef, useEffect } from "react";
import { Download } from "lucide-react";

/**
 * Compact export-CSV button with a column-picker dropdown. Stats moved into
 * the status pills in `CustomersFilters` — this component is now just the
 * download affordance, rendered alongside the filters in one toolbar row.
 */
export default function CustomersHeader({
  onDownload,
  downloading,
  exportColumns,
  setExportColumns,
}: {
  onDownload: () => void;
  downloading?: boolean;
  exportColumns: Record<string, boolean>;
  setExportColumns: (cols: Record<string, boolean>) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    if (showPicker) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPicker]);

  function toggleColumn(key: string) {
    setExportColumns({ ...exportColumns, [key]: !exportColumns[key] });
  }

  const selectedCount = Object.values(exportColumns).filter(Boolean).length;

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => setShowPicker((v) => !v)}
        disabled={downloading}
        title={downloading ? "Exporting…" : "Export to CSV"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300 transition disabled:opacity-50"
      >
        <Download size={14} />
        <span className="text-xs font-medium hidden lg:inline">Export</span>
      </button>

      {showPicker && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg z-50 py-2">
          <div className="px-3 pb-2 border-b border-gray-100">
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
              Pick columns
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
                setShowPicker(false);
                onDownload();
              }}
              disabled={selectedCount === 0 || downloading}
              className="w-full rounded-lg bg-gray-900 text-white px-3 py-2 text-xs font-medium hover:bg-gray-800 transition disabled:opacity-50"
            >
              Download CSV ({selectedCount})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
