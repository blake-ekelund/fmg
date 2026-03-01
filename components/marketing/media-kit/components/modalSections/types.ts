export type Section =
  | "description"
  | "front"
  | "benefits"
  | "lifestyle"
  | "ingredients"
  | "fragrance"
  | "other"
  | "notes";

export type AssetMeta = {
  exists: boolean;
  updatedAt?: string | null;
  path?: string | null; // ← add this
};