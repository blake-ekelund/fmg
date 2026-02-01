import { Pencil } from "lucide-react";
import { ProductRow, AssetType, ASSET_TYPES } from "./types";
import { AssetBadge } from "./AssetBadges";
import { Section, AssetMeta } from "../modalSections/types";

type Props = {
  product: ProductRow;
  assetMeta: Record<Section, AssetMeta>;
  onEdit: (section?: Section) => void;
};

export function MediaKitRow({
  product,
  assetMeta,
  onEdit,
}: Props) {
  const description =
    product.media_kit_products?.short_description ||
    product.media_kit_products?.long_description ||
    "No description provided";

  return (
    <tr className="transition hover:bg-gray-50 border-b border-gray-100">
      {/* SKU */}
      <td className="px-4 py-3 align-top">
        <div className="space-y-0.5">
          <div className="font-mono text-xs text-gray-600">
            {product.part}
          </div>
          <div className="font-medium text-gray-900">
            {product.display_name}
          </div>
          <div className="text-xs text-gray-500">
            {product.fragrance ?? "—"}
          </div>
        </div>
      </td>

      {/* Description */}
      <td className="px-4 py-3 text-gray-500 max-w-[360px] min-w-[360px]">
        <div className="line-clamp-2" title={description}>
          {description}
        </div>
      </td>

      {/* Assets */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2 max-w-[400px] min-w-[400px]">
          {ASSET_TYPES.map((type: AssetType) => (
            <button
              key={type}
              onClick={() => onEdit(type)}
              className="focus:outline-none"
            >
              <AssetBadge
                type={type}
                status={
                  assetMeta[type]?.exists
                    ? "present"
                    : "missing"
                }
              />
            </button>
          ))}
        </div>
      </td>

      {/* Updated */}
      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
        {product.media_kit_products?.updated_at
          ? new Date(
              product.media_kit_products.updated_at
            ).toLocaleDateString()
          : "—"}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => onEdit()}
          className="inline-flex items-center gap-1 text-sm font-medium text-yellow-400 hover:text-yellow-600"
        >
          <Pencil size={14} />
          Edit
        </button>
      </td>
    </tr>
  );
}
