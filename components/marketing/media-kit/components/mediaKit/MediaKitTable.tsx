import { MediaKitCard } from "./MediaKitCard";
import { MediaKitTableRow } from "./MediaKitRow";
import { ProductRow } from "./types";
import { Section, AssetMeta } from "../modalSections/types";
import { emptyAssetMeta } from "@/lib/mediaKit/emptyAssetMeta";

type Props = {
  products: ProductRow[];
  loading: boolean;
  assetMetaBySku: Record<string, Record<Section, AssetMeta>>;
  onEdit: (p: ProductRow, section?: Section) => void;
};

export function MediaKitTable({
  products,
  loading,
  assetMetaBySku,
  onEdit,
}: Props) {
  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  if (products.length === 0) {
    return <div className="p-6 text-sm text-gray-500">No products.</div>;
  }

  return (
    <>
      {/* MOBILE */}
      <div className="md:hidden space-y-4">
        {products.map((p) => (
          <MediaKitCard
            key={p.part}
            product={p}
            assetMeta={assetMetaBySku[p.part] ?? emptyAssetMeta()}
            onEdit={(section) => onEdit(p, section)}
          />
        ))}
      </div>

      {/* DESKTOP */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-500 border-b border-gray-200">
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left">Copy</th>
              <th className="px-4 py-3 text-left">Assets</th>
              <th className="px-4 py-3 text-left">Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <MediaKitTableRow
                key={p.part}
                product={p}
                assetMeta={assetMetaBySku[p.part] ?? emptyAssetMeta()}
                onEdit={(section) => onEdit(p, section)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
