import {
  Image as ImageIcon,
  FileText,
  CheckCircle,
} from "lucide-react";
import { Section, AssetMeta } from "./types";
import { sectionLabels } from "./sectionLabels";

type Props = {
  active: Section;
  assets: Record<Section, AssetMeta>;
  part: string;
  displayName: string;
  fragrance?: string;
  onSelect: (s: Section) => void;
};

export function ModalNav({
  active,
  assets,
  part,
  displayName,
  fragrance,
  onSelect,
}: Props) {
  const sections: Section[] = [
    "description",
    "front",
    "benefits",
    "lifestyle",
    "ingredients",
    "fragrance",
    "other",
    "notes",
  ];

  function iconForSection(section: Section) {
    if (section === "description" || section === "notes") {
      return <FileText size={16} />;
    }
    return <ImageIcon size={16} />;
  }

  return (
    <aside className="w-72 bg-gray-50 border-r border-gray-100 flex flex-col">
      {/* Nav header (identity) */}
      <div className="px-4 pt-6 pb-4">
        <div className="space-y-0.5">
          <div className="text-xs font-mono text-gray-500">
            {part}
          </div>
          <div className="font-semibold text-gray-900">
            {displayName}
          </div>
          {fragrance && (
            <div className="text-sm text-gray-500">
              {fragrance}
            </div>
          )}
        </div>
      </div>

      {/* Separator */}
      <div className="h-px bg-gray-200 mx-4" />

      {/* Nav items */}
      <div className="px-4 py-4 space-y-1 flex-1 overflow-y-auto">
        {sections.map((section) => {
          const meta = assets[section];
          const isComplete = meta?.exists === true;
          const updatedLabel =
            isComplete && meta.updatedAt
              ? new Date(meta.updatedAt).toLocaleDateString(
                  undefined,
                  { month: "short", day: "numeric" }
                )
              : null;

          return (
            <button
              key={section}
              onClick={() => onSelect(section)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition ${
                active === section
                  ? "bg-white shadow-sm ring-1 ring-yellow-400/40"
                  : "hover:bg-white/70"
              }`}
            >
              {/* Icon */}
              {iconForSection(section)}

              {/* Label */}
              <span className="flex-1 text-left">
                {sectionLabels[section]}
              </span>

              {/* Status */}
              {isComplete ? (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <CheckCircle
                    size={14}
                    className="text-yellow-500"
                  />
                  {updatedLabel && <span>{updatedLabel}</span>}
                </span>
              ) : (
                <span
                  className="w-2 h-2 rounded-full border border-gray-400"
                  aria-label="Not completed"
                />
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
