import { ViewMode } from "./types";

/** Calendar / Table switch — the same segmented control as the other marketing pages. */
export default function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="hidden gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm md:inline-flex">
      {(["calendar", "table"] as ViewMode[]).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            view === v ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          {v === "calendar" ? "Calendar" : "Table"}
        </button>
      ))}
    </div>
  );
}
