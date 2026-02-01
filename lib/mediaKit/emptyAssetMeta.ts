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
