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

export function MediaKitRow({
  product,
  assetMeta,
  onEdit,
}: Props) {
  const copy = product.media_kit_products;

  // 🔍 DIAGNOSTIC LOGS — TEMPORARY
  console.log(
    "[MediaKitRow] part:",
    product.part
  );

  console.log(
    "[MediaKitRow] raw copy:",
    copy
  );

  console.log(
    "[MediaKitRow] copy fields:",
    {
      short: copy?.short_description,
      shortTrimmed: copy?.short_description?.trim(),
      shortBool: !!copy?.short_description?.trim(),

      long: copy?.long_description,
      longTrimmed: copy?.long_description?.trim(),
      longBool: !!copy?.long_description?.trim(),

      benefits: copy?.benefits,
      benefitsTrimmed: copy?.benefits?.trim(),
      benefitsBool: !!copy?.benefits?.trim(),

      ingredients: copy?.ingredients_text,
      ingredientsTrimmed: copy?.ingredients_text?.trim(),
      ingredientsBool: !!copy?.ingredients_text?.trim(),
    }
  );

  const copyStatus = {
    short: !!copy?.short_description?.trim(),
    long: !!copy?.long_description?.trim(),
    benefits: !!copy?.benefits?.trim(),
    ingredients: !!copy?.ingredients_text?.trim(),
  };

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

      {/* COPY */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2 max-w-[260px] min-w-[220px]">
          <CopyBadge label="Short" present={copyStatus.short} />
          <CopyBadge label="Long" present={copyStatus.long} />
          <CopyBadge label="Benefits" present={copyStatus.benefits} />
          <CopyBadge label="Ingredients" present={copyStatus.ingredients} />
        </div>
      </td>

      {/* ASSETS */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2 max-w-[400px] min-w-[380px]">
          {ASSET_TYPES.map((type: AssetType) => (
            <button
              key={type}
              onClick={() => onEdit(type)}
              className="focus:outline-none"
            >
              <AssetBadge
                type={type}
                status={assetMeta[type]?.exists ? "present" : "missing"}
              />
            </button>
          ))}
        </div>
      </td>

      {/* UPDATED */}
      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
        {copy?.updated_at
          ? new Date(copy.updated_at).toLocaleDateString()
          : "—"}
      </td>

      {/* ACTIONS */}
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
