export type ProductRow = {
  part: string;
  display_name: string;
  fragrance: string | null;
  updated_at?: string | null;
};

export type AssetType =
  | "front"
  | "benefits"
  | "lifestyle"
  | "ingredients"
  | "fragrance"
  | "other";

export type AssetStatus = "present" | "missing";
