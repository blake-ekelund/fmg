/** Product photo types (`media_kit_assets.asset_type`), in display order. */
export type PhotoTag = "front" | "benefits" | "lifestyle" | "ingredients" | "fragrance" | "other";

export const PHOTO_TAGS: { tag: PhotoTag; label: string }[] = [
  { tag: "front", label: "Front" },
  { tag: "benefits", label: "Benefits" },
  { tag: "lifestyle", label: "Lifestyle" },
  { tag: "ingredients", label: "Ingredients" },
  { tag: "fragrance", label: "Fragrance" },
  { tag: "other", label: "Other" },
];

/** Types every product should have at least one photo for ("Other" is optional). */
export const REQUIRED_PHOTO_TAGS: PhotoTag[] = ["front", "benefits", "lifestyle", "ingredients", "fragrance"];
