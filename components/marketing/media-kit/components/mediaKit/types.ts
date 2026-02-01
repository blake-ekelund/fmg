// components/mediaKit/types.ts

export type ProductRow = {
  part: string;
  display_name: string;
  fragrance: string | null;

  media_kit_products?: {
    short_description: string | null;
    long_description: string | null;
    updated_at: string | null;
  } | null;
};

export type AssetType =
  | "front"
  | "benefits"
  | "lifestyle"
  | "ingredients"
  | "fragrance"
  | "other";

export type AssetStatus = "present" | "missing";

/**
 * Canonical ordered list of asset types
 */
export const ASSET_TYPES: AssetType[] = [
  "front",
  "benefits",
  "lifestyle",
  "ingredients",
  "fragrance",
  "other",
];
