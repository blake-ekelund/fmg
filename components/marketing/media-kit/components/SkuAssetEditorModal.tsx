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

/* -------------------------
   Helpers
-------------------------- */

function emptyAssetMeta(): Record<Section, AssetMeta> {
  return {
    description: { exists: false },
    front: { exists: false },
    benefits: { exists: false },
    lifestyle: { exists: false },
    ingredients: { exists: false },
    fragrance: { exists: false },
    other: { exists: false },
    notes: { exists: false },
  };
}

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

  /* ---------- nav + previews ---------- */
  const [assetMeta, setAssetMeta] =
    useState<Record<Section, AssetMeta>>(assets);

  const [assetImages, setAssetImages] = useState<
    Partial<Record<Section, string[]>>
  >({});

  useEffect(() => {
    setAssetMeta(assets);
  }, [assets]);

  if (!open) return null;

  /* -------------------------
     Load text when modal opens
  -------------------------- */
  useEffect(() => {
    if (!open) return;

    async function loadText() {
      const { data, error } = await supabase
        .from("media_kit_products")
        .select(
          "short_description, long_description, benefits, ingredients_text, retailer_notes, updated_at"
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

        // ensure description nav date reflects DB
        setAssetMeta((prev) => ({
          ...prev,
          description: {
            exists: true,
            updatedAt: data.updated_at ?? undefined,
          },
        }));
      }
    }

    loadText();
  }, [open, part]);

  /* -------------------------
     Refresh assets + previews
     (RUN ON OPEN AND AFTER UPLOAD)
  -------------------------- */
  async function refreshAssets() {
    const { data: assetRows, error } = await supabase
      .from("media_kit_assets")
      .select("asset_type, storage_path, updated_at")
      .eq("part", part);

    if (error) {
      console.error("Failed to refresh assets", error);
      return;
    }

    // also fetch description updated_at for nav
    const { data: productRow } = await supabase
      .from("media_kit_products")
      .select("updated_at")
      .eq("part", part)
      .single();

    const nextMeta = emptyAssetMeta();
    const nextImages: Partial<Record<Section, string[]>> = {};

    // product description completion/date
    nextMeta.description = {
      exists: !!productRow?.updated_at,
      updatedAt: productRow?.updated_at ?? undefined,
    };

    // process assets
    for (const row of assetRows ?? []) {
      const type = row.asset_type as Section;

      nextMeta[type] = {
        exists: true,
        updatedAt: row.updated_at,
      };

      // signed URLs expire — regenerated on open
      const { data: urlData } = await supabase.storage
        .from("media-kit")
        .createSignedUrl(row.storage_path, 60 * 60);

      if (urlData?.signedUrl) {
        nextImages[type] = [
          ...(nextImages[type] ?? []),
          urlData.signedUrl,
        ];
      }
    }

    setAssetMeta(nextMeta);
    setAssetImages(nextImages);
  }

  // 🔑 THIS is what was missing: load images on open
  useEffect(() => {
    if (!open) return;
    refreshAssets();
  }, [open]);

  /* -------------------------
     Save text
  -------------------------- */
  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const { error } = await supabase
      .from("media_kit_products")
      .upsert({
        part,
        short_description: shortDesc,
        long_description: longDesc,
        benefits,
        ingredients_text: ingredientsText,
        retailer_notes: notes,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error("Save failed", error);
      setSaveError("Failed to save changes");
      setSaving(false);
      return;
    }

    setAssetMeta((prev) => ({
      ...prev,
      description: {
        exists: true,
        updatedAt: new Date().toISOString(),
      },
    }));

    setSaving(false);
    setSaveSuccess(true);

    setTimeout(onClose, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-6xl h-[85vh] bg-white rounded-3xl shadow-2xl flex overflow-hidden">
        <ModalNav
          active={section}
          assets={assetMeta}
          part={part}
          displayName={displayName}
          fragrance={fragrance}
          onSelect={setSection}
        />

        <main className="flex-1 flex flex-col relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100"
          >
            <X size={18} />
          </button>

          <div className="flex-1 overflow-y-auto px-8 py-8">
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
          </div>

          <div className="px-8 py-5 bg-gray-50 flex justify-between">
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
                className={`px-4 py-2 rounded-xl ${
                  saving
                    ? "bg-gray-300"
                    : "bg-yellow-400 hover:bg-yellow-500"
                }`}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
