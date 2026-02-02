import { Pencil } from "lucide-react";
import { ProductRow, AssetType, ASSET_TYPES } from "./types";
import { AssetBadge } from "./AssetBadges";
import { CopyBadge } from "./CopyBadge";
import { Section, AssetMeta } from "../modalSections/types";

type Props = {
  product: ProductRow;
  assetMeta: Record<Section, AssetMeta>;
  onEdit: (section?: Section) => void;
};

export function MediaKitCard({ product, assetMeta, onEdit }: Props) {
  const copy = product.media_kit_products;

  const copyStatus = {
    short: !!copy?.short_description?.trim(),
    long: !!copy?.long_description?.trim(),
    benefits: !!copy?.benefits?.trim(),
    ingredients: !!copy?.ingredients_text?.trim(),
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
      {/* SKU */}
      <div className="space-y-0.5">
        <div className="font-mono text-xs text-gray-600">{product.part}</div>
        <div className="font-medium text-gray-900">
          {product.display_name}
        </div>
        <div className="text-xs text-gray-500">
          {product.fragrance ?? "—"}
        </div>
      </div>

      {/* Copy */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1">Copy</div>
        <div className="flex flex-wrap gap-2">
          <CopyBadge label="Short" present={copyStatus.short} />
          <CopyBadge label="Long" present={copyStatus.long} />
          <CopyBadge label="Benefits" present={copyStatus.benefits} />
          <CopyBadge label="Ingredients" present={copyStatus.ingredients} />
        </div>
      </div>

      {/* Assets */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1">Assets</div>
        <div className="flex flex-wrap gap-2">
          {ASSET_TYPES.map((type: AssetType) => (
            <button key={type} onClick={() => onEdit(type)}>
              <AssetBadge
                type={type}
                status={assetMeta[type]?.exists ? "present" : "missing"}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center pt-1">
        <span className="text-xs text-gray-500">
          Updated:{" "}
          {copy?.updated_at
            ? new Date(copy.updated_at).toLocaleDateString()
            : "—"}
        </span>

        <button
          onClick={() => onEdit()}
          className="inline-flex items-center gap-1 text-sm font-medium text-yellow-500 hover:text-yellow-600"
        >
          <Pencil size={14} />
          Edit
        </button>
      </div>
    </div>
  );
}
