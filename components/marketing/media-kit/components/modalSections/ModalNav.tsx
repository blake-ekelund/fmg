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
  /* ============================
     Desktop sections (unchanged)
  ============================ */
  const desktopSections: Section[] = [
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

  /* ============================
     Mobile top-level buckets
  ============================ */
  const mobileTabs = [
    {
      key: "info",
      label: "Product Info",
      icon: <FileText size={16} />,
      // representative section
      section: "description" as Section,
    },
    {
      key: "images",
      label: "Images",
      icon: <ImageIcon size={16} />,
      section: "front" as Section,
    },
    {
      key: "notes",
      label: "Notes",
      icon: <FileText size={16} />,
      section: "notes" as Section,
    },
  ];

  return (
    <>
      {/* ============================
         MOBILE: coarse nav (3 tabs)
      ============================ */}
      <div className="md:hidden border-b border-gray-200 bg-white">
        <div className="flex px-4 py-3 gap-2">
          {mobileTabs.map((tab) => {
            const isActive =
              active === tab.section ||
              (tab.key === "images" &&
                ["front", "lifestyle", "ingredients", "fragrance", "other"].includes(active));

            return (
              <button
                key={tab.key}
                onClick={() => onSelect(tab.section)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition ${
                  isActive
                    ? "bg-yellow-400 text-black"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================
         DESKTOP: detailed sidebar
      ============================ */}
      <aside className="hidden md:flex w-72 bg-gray-50 border-r border-gray-100 flex-col">
        {/* Identity */}
        <div className="px-4 pt-6 pb-4">
          <div className="space-y-0.5">
            <div className="text-xs font-mono text-gray-500 truncate">
              {part}
            </div>
            <div className="font-semibold text-gray-900 truncate">
              {displayName}
            </div>
            {fragrance && (
              <div className="text-sm text-gray-500 truncate">
                {fragrance}
              </div>
            )}
          </div>
        </div>

        <div className="h-px bg-gray-200 mx-4" />

        {/* Desktop section list */}
        <div className="px-4 py-4 space-y-1 flex-1 overflow-y-auto">
          {desktopSections.map((section) => {
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
                {iconForSection(section)}

                <span className="flex-1 text-left">
                  {sectionLabels[section]}
                </span>

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
    </>
  );
}
