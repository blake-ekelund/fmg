"use client";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;

  showMissingCopy: boolean;
  onToggleMissingCopy: (value: boolean) => void;

  showMissingAssets: boolean;
  onToggleMissingAssets: (value: boolean) => void;

  resultCount: number;
};

export function FiltersBar({
  search,
  onSearchChange,
  showMissingCopy,
  onToggleMissingCopy,
  showMissingAssets,
  onToggleMissingAssets,
  resultCount,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by SKU, name, or fragrance…"
        className="w-72 px-3 py-2 rounded-lg border border-gray-300 text-sm
                   focus:outline-none focus:ring-2 focus:ring-yellow-400"
      />

      {/* Missing Copy */}
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={showMissingCopy}
          onChange={(e) => onToggleMissingCopy(e.target.checked)}
          className="h-4 w-4 accent-yellow-500"
        />
        Missing copy
      </label>

      {/* Missing Assets */}
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={showMissingAssets}
          onChange={(e) => onToggleMissingAssets(e.target.checked)}
          className="h-4 w-4 accent-yellow-500"
        />
        Missing assets
      </label>

      {/* Result count */}
      <div className="ml-auto text-sm text-gray-500">
        {resultCount} products
      </div>
    </div>
  );
}
