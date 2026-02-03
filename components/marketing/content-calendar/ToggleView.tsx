import { ViewMode } from "./types";

export default function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      className="
        hidden md:inline-flex
        rounded-xl
        border border-gray-200
        p-1
        bg-white
      "
    >
      {(["calendar", "table"] as ViewMode[]).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`
            px-3 py-1.5
            text-sm
            rounded-lg
            transition
            ${
              view === v
                ? "bg-gray-100 text-black"
                : "text-gray-500 hover:text-black"
            }
          `}
        >
          {v === "calendar" ? "Calendar" : "Table"}
        </button>
      ))}
    </div>
  );
}
