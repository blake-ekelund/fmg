"use client";

export type InventoryFiltersState = {
  search: string;
  onlyShort: boolean;
};

export default function InventoryFilters({
  filters,
  setFilters,
}: {
  filters: InventoryFiltersState;
  setFilters: (f: InventoryFiltersState) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <input
        type="text"
        placeholder="Search part or description…"
        value={filters.search}
        onChange={(e) =>
          setFilters({ ...filters, search: e.target.value })
        }
        className="
          w-64 rounded-xl px-3 py-2 text-sm
          bg-gray-50 ring-1 ring-inset ring-gray-200
          focus:bg-white focus:ring-2 focus:ring-orange-400/40
          outline-none
        "
      />

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={filters.onlyShort}
          onChange={(e) =>
            setFilters({
              ...filters,
              onlyShort: e.target.checked,
            })
          }
        />
        Only shortages
      </label>
    </div>
  );
}
