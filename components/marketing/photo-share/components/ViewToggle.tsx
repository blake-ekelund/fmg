import { Grid, Table as TableIcon } from "lucide-react";

type Props = {
  view: "grid" | "table";
  onChange: (v: "grid" | "table") => void;
};

export default function ViewToggle({ view, onChange }: Props) {
  return (
    <div
      className="
        inline-flex
        rounded-xl
        border border-gray-200
        bg-white
        p-1
        shadow-sm
      "
    >
      <button
        onClick={() => onChange("grid")}
        className={`
          inline-flex items-center gap-2
          rounded-lg
          px-3 py-2
          text-sm
          transition
          ${
            view === "grid"
              ? "bg-gray-900 text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-100"
          }
        `}
        aria-label="Grid view"
      >
        <Grid size={16} />
        <span className="hidden sm:inline">Grid</span>
      </button>

      <button
        onClick={() => onChange("table")}
        className={`
          inline-flex items-center gap-2
          rounded-lg
          px-3 py-2
          text-sm
          transition
          ${
            view === "table"
              ? "bg-gray-900 text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-100"
          }
        `}
        aria-label="Table view"
      >
        <TableIcon size={16} />
        <span className="hidden sm:inline">Table</span>
      </button>
    </div>
  );
}
