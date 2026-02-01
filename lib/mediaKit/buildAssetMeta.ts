import { Section, AssetMeta } from "@/components/marketing/media-kit/components/modalSections/types";

export function emptyAssetMeta(): Record<Section, AssetMeta> {
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

export function buildAssetMeta(
  rows: { asset_type: string; updated_at: string }[]
): Record<Section, AssetMeta> {
  const meta = emptyAssetMeta();

  for (const row of rows) {
    const key = row.asset_type as Section;
    if (!meta[key]) continue;

    meta[key] = {
      exists: true,
      updatedAt: row.updated_at,
    };
  }

  return meta;
}
