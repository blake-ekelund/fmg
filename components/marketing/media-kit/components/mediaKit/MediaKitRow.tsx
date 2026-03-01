import { Pencil } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { ProductRow, AssetType, ASSET_TYPES, AssetMeta} from "./types";
import { AssetBadge } from "./AssetBadges";
import { CopyBadge } from "./CopyBadge";
import { Section } from "../modalSections/types";

type Props = {
  product: ProductRow;
  assetMeta: Record<Section, AssetMeta>;
  onEdit: (section?: Section) => void;
};

export function MediaKitTableRow({ product, assetMeta, onEdit }: Props) {
  const copy = product.media_kit_products;

  const copyStatus = {
    short: !!copy?.short_description?.trim(),
    long: !!copy?.long_description?.trim(),
    benefits: !!copy?.benefits?.trim(),
    ingredients: !!copy?.ingredients_text?.trim(),
  };

  const handleAssetClick = async (type: AssetType) => {
    const meta = assetMeta[type];

    // If no file, keep existing behavior
    if (!meta?.exists || !meta?.path) {
      onEdit(type);
      return;
    }

    // Generate signed URL (private bucket)
    const { data, error } = await supabase.storage
      .from("media-kit")
      .createSignedUrl(meta.path, 60);

    if (error || !data?.signedUrl) {
      console.error("Signed URL error:", error);
      onEdit(type); // fallback
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <tr className="hover:bg-gray-50 border-b border-gray-100">
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

      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2 min-w-[220px]">
          <CopyBadge label="Short" present={copyStatus.short} />
          <CopyBadge label="Long" present={copyStatus.long} />
          <CopyBadge label="Benefits" present={copyStatus.benefits} />
          <CopyBadge label="Ingredients" present={copyStatus.ingredients} />
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2 min-w-[360px]">
          {ASSET_TYPES.map((type: AssetType) => {
            const meta = assetMeta[type];
            const downloadable = meta?.exists && meta?.path;

            return (
              <button
                key={type}
                onClick={() => handleAssetClick(type)}
                title={
                  downloadable
                    ? "Download asset"
                    : "Add / edit asset"
                }
                className="cursor-pointer hover:scale-[1.02] transition"
              >
                <AssetBadge
                  type={type}
                  status={meta?.exists ? "present" : "missing"}
                />
              </button>
            );
          })}
        </div>
      </td>

      <td className="px-4 py-3 text-xs text-gray-500">
        {copy?.updated_at
          ? new Date(copy.updated_at).toLocaleDateString()
          : "—"}
      </td>

      <td className="px-4 py-3 text-right">
        <button
          onClick={() => onEdit()}
          className="inline-flex items-center gap-1 text-sm font-medium text-yellow-500 hover:text-yellow-600"
        >
          <Pencil size={14} />
          Edit
        </button>
      </td>
    </tr>
  );
}