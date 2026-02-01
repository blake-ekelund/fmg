"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Section, AssetMeta } from "./modalSections/types";
import { sectionLabels } from "./modalSections/sectionLabels";
import { ModalNav } from "./modalSections/ModalNav";
import { PhotoSection } from "./modalSections/PhotoSection";
import { NotesSection } from "./modalSections/NotesSection";
import { ProductDescriptionSection } from "./modalSections/ProductDescriptionSection";

type Props = {
  open: boolean;
  part: string;
  displayName: string;
  fragrance?: string;
  assets: Record<Section, AssetMeta>;
  onClose: () => void;
};

export function SkuAssetEditorModal({
  open,
  part,
  displayName,
  fragrance,
  assets,
  onClose,
}: Props) {
  const [section, setSection] = useState<Section>("description");
  const [shortDesc, setShortDesc] = useState("");
  const [longDesc, setLongDesc] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-6xl h-[85vh] bg-white rounded-3xl shadow-2xl flex overflow-hidden">
        {/* Left nav with header */}
        <ModalNav
          active={section}
          assets={assets}
          part={part}
          displayName={displayName}
          fragrance={fragrance}
          onSelect={setSection}
        />

        {/* Main content */}
        <main className="flex-1 flex flex-col relative">
          {/* Top-right close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div className="flex-1 overflow-y-auto px-8 py-8">
            {section === "description" && (
              <ProductDescriptionSection
                shortDescription={shortDesc}
                longDescription={longDesc}
                onShortChange={setShortDesc}
                onLongChange={setLongDesc}
              />
            )}

            {section !== "description" && section !== "notes" && (
              <PhotoSection
                label={sectionLabels[section]}
                multiple={section === "other"}
              />
            )}

            {section === "notes" && <NotesSection />}
          </div>

          {/* Footer */}
          <div className="px-8 py-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
            <button
              className="px-4 py-2 text-sm rounded-xl hover:bg-gray-100"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="px-4 py-2 text-sm rounded-xl bg-yellow-400 hover:bg-yellow-500">
              Save Changes
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
