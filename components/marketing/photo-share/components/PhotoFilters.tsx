type Props = {
  search: string;
  onSearch: (v: string) => void;
  thirdParty: "all" | "yes" | "no";
  onThirdPartyChange: (v: "all" | "yes" | "no") => void;
};

export default function PhotoFilters({
  search,
  onSearch,
  thirdParty,
  onThirdPartyChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative">
        <input
          placeholder="Search photos…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="
            w-72
            rounded-xl
            border border-gray-200
            bg-white
            px-4 py-2
            text-sm
            placeholder-gray-400
            shadow-sm
            transition
            focus:border-gray-400
            focus:outline-none
            focus:ring-2
            focus:ring-gray-200
          "
        />
      </div>

      {/* Usage filter */}
      <div className="relative">
        <select
          value={thirdParty}
          onChange={(e) =>
            onThirdPartyChange(e.target.value as Props["thirdParty"])
          }
          className="
            rounded-xl
            border border-gray-200
            bg-white
            px-4 py-2
            text-sm
            shadow-sm
            transition
            focus:border-gray-400
            focus:outline-none
            focus:ring-2
            focus:ring-gray-200
          "
        >
          <option value="all">All usage</option>
          <option value="yes">Third-party approved</option>
          <option value="no">Internal only</option>
        </select>
      </div>
    </div>
  );
}
