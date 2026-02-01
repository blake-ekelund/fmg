"use client";

import { useState } from "react";
import {
  X,
  Image as ImageIcon,
  StickyNote,
  Upload,
  CheckCircle,
  Clock,
} from "lucide-react";

/* =========================
   Types
========================= */

type Section =
  | "product"
  | "front"
  | "benefits"
  | "lifestyle"
  | "ingredients"
  | "fragrance"
  | "other"
  | "notes";

type AssetMeta = {
  exists: boolean;
  updatedAt?: string;
};

type Props = {
  open: boolean;
  part: string;
  displayName: string;
  fragrance?: string;
  assets: Record<Section, AssetMeta>;
  onClose: () => void;
};

/* =========================
   Modal
========================= */

export function SkuAssetEditorModal({
  open,
  part,
  displayName,
  fragrance,
  assets,
  onClose,
}: Props) {
  const [section, setSection] = useState<Section>("product");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Shell */}
      <div className="relative w-full max-w-6xl h-[85vh] bg-white rounded-3xl shadow-2xl flex overflow-hidden">
        {/* Left nav */}
        <aside className="w-72 bg-gray-50 px-4 py-6 border-r border-gray-100 space-y-1">
          {navItem("front", "Front Photo")}
          {navItem("benefits", "Benefits Photo")}
          {navItem("lifestyle", "Lifestyle Photo")}
          {navItem("ingredients", "Ingredients / Back")}
          {navItem("fragrance", "Fragrance")}
          {navItem("other", "Other (multiple)")}
          {navItem("notes", "3rd-Party Notes", true)}
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col">
          {/* Header */}
          <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-start">
            <div className="space-y-0.5">
              <div className="text-xs font-mono text-gray-500">
                {part}
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                {displayName}
              </h2>
              {fragrance && (
                <p className="text-sm text-gray-500">
                  {fragrance}
                </p>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-8 py-8">
            {section !== "notes" && (
              <PhotoSection
                label={labelFor(section)}
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
            <button className="px-4 py-2 text-sm rounded-xl bg-yellow-400 text-black hover:bg-yellow-500 transition">
              Save Changes
            </button>
          </div>
        </main>
      </div>
    </div>
  );

  /* -------- helpers -------- */

  function navItem(
    key: Section,
    label: string,
    isNotes = false
  ) {
    const meta = assets[key];

    return (
      <button
        key={key}
        onClick={() => setSection(key)}
        className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl text-sm transition ${
          section === key
            ? "bg-white shadow-sm ring-1 ring-yellow-400/40"
            : "hover:bg-white/70"
        }`}
      >
        <ImageIcon size={16} />
        <span className="flex-1 text-left">{label}</span>

        {meta?.exists ? (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <CheckCircle
              size={14}
              className="text-yellow-500"
            />
            {meta.updatedAt && (
              <span>
                {new Date(meta.updatedAt).toLocaleDateString(
                  undefined,
                  { month: "short", day: "numeric" }
                )}
              </span>
            )}
          </span>
        ) : (
          <span className="w-2 h-2 rounded-full border border-gray-400" />
        )}
      </button>
    );
  }
}

/* =========================
   Sections
========================= */

function PhotoSection({
  label,
  multiple,
}: {
  label: string;
  multiple: boolean;
}) {
  return (
    <div className="space-y-6 max-w-4xl">
      <h3 className="text-sm font-semibold text-gray-900">
        {label}
      </h3>

      <div className="rounded-2xl bg-gray-50 p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <PreviewTile />
          {multiple && <AddTile />}
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm font-medium text-yellow-600 cursor-pointer hover:text-yellow-700">
        <Upload size={16} />
        Upload {multiple ? "images" : "image"}
        <input
          type="file"
          className="hidden"
          accept="image/*"
          multiple={multiple}
        />
      </label>
    </div>
  );
}

function NotesSection() {
  return (
    <div className="max-w-2xl space-y-4">
      <label className="text-sm font-medium">
        Notes for 3rd Parties
      </label>
      <textarea
        rows={6}
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:ring-2 focus:ring-yellow-200"
      />
    </div>
  );
}

/* =========================
   UI Bits
========================= */

function PreviewTile() {
  return (
    <div className="aspect-square rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-xs text-gray-400">
      No image
    </div>
  );
}

function AddTile() {
  return (
    <div className="aspect-square rounded-2xl border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400">
      +
    </div>
  );
}

function labelFor(section: Section) {
  const map: Record<Section, string> = {
    product: "Product",
    front: "Front Photo",
    benefits: "Benefits Photo",
    lifestyle: "Lifestyle Photo",
    ingredients: "Ingredients / Back",
    fragrance: "Fragrance",
    other: "Other Photos",
    notes: "3rd-Party Notes",
  };
  return map[section];
}
