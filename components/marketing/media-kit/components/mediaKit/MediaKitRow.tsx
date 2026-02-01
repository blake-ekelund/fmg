import { Pencil } from "lucide-react";
import { ProductRow } from "./types";
import { AssetBadge } from "./AssetBadges";

type Props = {
  product: ProductRow;
  onEdit: () => void;
};

export function MediaKitRow({ product, onEdit }: Props) {
  return (
    <tr className="transition hover:bg-gray-50 border-b border-gray-100">
      {/* SKU identity */}
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
      <td className="px-4 py-3 text-gray-500">
        No description provided
      </td>

      {/* Assets */}
      <td className="px-4 py-3">
        <div className="grid grid-cols-3 gap-2 min-w-[220px]">
          <AssetBadge type="front" status="missing" />
          <AssetBadge type="benefits" status="missing" />
          <AssetBadge type="lifestyle" status="present" />
          <AssetBadge type="ingredients" status="present" />
          <AssetBadge type="fragrance" status="present" />
          <AssetBadge type="other" status="missing" />
        </div>
      </td>

      {/* Notes */}
      <td className="px-4 py-3 text-xs text-gray-500">
        —
      </td>

      {/* Updated */}
      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
        {product.updated_at
          ? new Date(product.updated_at).toLocaleDateString()
          : "—"}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          <Pencil size={14} />
          Edit
        </button>
      </td>
    </tr>
  );
}
