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
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-gray-500 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 md:min-h-0 md:px-2.5 md:py-1.5"
      >
        <Download size={14} />
        {/* Label is hidden on desktop until lg (space is tight in the toolbar),
            but on phones this button sits in its own row with room to spare. */}
        <span className="text-xs font-medium md:hidden lg:inline">Export</span>
      </button>

      {showPicker && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(14rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
          <div className="px-3 pb-2 border-b border-gray-100">
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
              Pick columns
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {Object.keys(exportColumns).map((col) => (
              <label
                key={col}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-gray-50 md:py-1.5"
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
