"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

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
  onSaved: () => void;
};

type MobileTab = "info" | "images" | "notes";

export function SkuAssetEditorModal({
  open,
  part,
  displayName,
  fragrance,
  assets,
  onClose,
  onSaved,
}: Props) {
  const [section, setSection] = useState<Section>("description");

  /* ---------- text state ---------- */
  const [shortDesc, setShortDesc] = useState("");
  const [longDesc, setLongDesc] = useState("");
  const [benefits, setBenefits] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [notes, setNotes] = useState("");

  /* ---------- save feedback ---------- */
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  /* ---------- assets ---------- */
  const [assetImages, setAssetImages] = useState<
    Partial<Record<Section, string[]>>
  >({});

  if (!open) return null;

  /* -------------------------
     Load text on open
  -------------------------- */
  useEffect(() => {
    if (!open) return;

    async function loadText() {
      const { data, error } = await supabase
        .from("media_kit_products")
        .select(
          "short_description, long_description, benefits, ingredients_text, retailer_notes"
        )
        .eq("part", part)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Failed to load media kit text", error);
        return;
      }

      if (data) {
        setShortDesc(data.short_description ?? "");
        setLongDesc(data.long_description ?? "");
        setBenefits(data.benefits ?? "");
        setIngredientsText(data.ingredients_text ?? "");
        setNotes(data.retailer_notes ?? "");
      }
    }

    loadText();
  }, [open, part]);

  /* -------------------------
     Refresh assets
  -------------------------- */
  async function refreshAssets() {
    const { data } = await supabase
      .from("media_kit_assets")
      .select("asset_type, storage_path")
      .eq("part", part);

    const next: Partial<Record<Section, string[]>> = {};

    for (const row of data ?? []) {
      const { data: url } = await supabase.storage
        .from("media-kit")
        .createSignedUrl(row.storage_path, 60 * 60);

      if (url?.signedUrl) {
        next[row.asset_type as Section] = [
          ...(next[row.asset_type as Section] ?? []),
          url.signedUrl,
        ];
      }
    }

    setAssetImages(next);
  }

  useEffect(() => {
    if (!open) return;
    refreshAssets();
  }, [open]);

  /* -------------------------
     Save
  -------------------------- */
  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const { error } = await supabase.from("media_kit_products").upsert({
      part,
      short_description: shortDesc,
      long_description: longDesc,
      benefits,
      ingredients_text: ingredientsText,
      retailer_notes: notes,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setSaveError("Failed to save changes");
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaveSuccess(true);

    setTimeout(() => {
      onSaved();
      onClose();
    }, 400);
  }

  /* -------------------------
     Derived mobile tab
  -------------------------- */
  const mobileTab: MobileTab =
    section === "description"
      ? "info"
      : section === "notes"
      ? "notes"
      : "images";

  return (
    <div className="fixed inset-0 z-50 flex md:items-center md:justify-center">
      {/* Desktop overlay */}
      <div
        className="hidden md:block absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-screen h-screen md:w-full md:h-[85vh] md:max-w-6xl bg-white md:rounded-3xl shadow-none md:shadow-2xl flex overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden md:block">
          <ModalNav
            active={section}
            assets={assets}
            part={part}
            displayName={displayName}
            fragrance={fragrance}
            onSelect={setSection}
          />
        </div>

        <main className="flex-1 flex flex-col">
          {/* Mobile Header */}
          <div className="md:hidden sticky top-0 z-20 bg-white border-b px-4 py-3 flex items-center justify-between">
            <button onClick={onClose} className="p-2">
              <X size={18} />
            </button>

            <div className="text-sm font-medium truncate">
              {displayName}
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                saving
                  ? "bg-gray-300"
                  : "bg-yellow-400 hover:bg-yellow-500"
              }`}
            >
              Save
            </button>
          </div>

          {/* Mobile Tabs */}
          <div className="md:hidden border-b bg-white px-4 py-3 flex gap-2">
            <button
              onClick={() => setSection("description")}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium ${
                mobileTab === "info"
                  ? "bg-yellow-400 text-black"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Product Info
            </button>

            <button
              onClick={() => setSection("front")}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium ${
                mobileTab === "images"
                  ? "bg-yellow-400 text-black"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Images
            </button>

            <button
              onClick={() => setSection("notes")}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium ${
                mobileTab === "notes"
                  ? "bg-yellow-400 text-black"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Notes
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-8">
            {section === "description" && (
              <ProductDescriptionSection
                shortDescription={shortDesc}
                longDescription={longDesc}
                benefits={benefits}
                onShortChange={setShortDesc}
                onLongChange={setLongDesc}
                onBenefitsChange={setBenefits}
              />
            )}

            {section !== "description" && section !== "notes" && (
              <PhotoSection
                label={sectionLabels[section]}
                multiple={section === "other"}
                part={part}
                assetType={section}
                images={assetImages[section] ?? []}
                onUploaded={refreshAssets}
                showIngredientsText={section === "ingredients"}
                ingredientsText={ingredientsText}
                onIngredientsChange={setIngredientsText}
              />
            )}

            {section === "notes" && (
              <NotesSection value={notes} onChange={setNotes} />
            )}

            {saveSuccess && (
              <div className="md:hidden mt-4 text-sm text-green-600">
                Saved
              </div>
            )}
          </div>

          {/* Desktop Footer */}
          <div className="hidden md:flex px-8 py-5 bg-gray-50 justify-between">
            <div className="text-sm">
              {saveError && (
                <span className="text-red-600">{saveError}</span>
              )}
              {saveSuccess && (
                <span className="text-green-600">Saved</span>
              )}
            </div>

            <div className="flex gap-3">
              <button
                className="px-4 py-2 rounded-xl hover:bg-gray-100"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500"
              >
                Save Changes
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
