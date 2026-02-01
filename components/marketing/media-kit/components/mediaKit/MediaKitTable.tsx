import { MediaKitRow } from "./MediaKitRow";
import { ProductRow } from "./types";

type Props = {
  products: ProductRow[];
  loading: boolean;
  onEdit: (p: ProductRow) => void;
};

export function MediaKitTable({
  products,
  loading,
  onEdit,
}: Props) {
  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Loading products…
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="p-6 text-sm text-gray-500">
        No products found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
            <th className="px-4 py-3 text-left font-medium">SKU</th>
            <th className="px-4 py-3 text-left font-medium">
              Description
            </th>
            <th className="px-4 py-3 text-left font-medium">
              Assets
            </th>
            <th className="px-4 py-3 text-left font-medium">
              Notes
            </th>
            <th className="px-4 py-3 text-left font-medium">
              Updated
            </th>
            <th className="px-4 py-3 text-right font-medium">
              Actions
            </th>
          </tr>
        </thead>

        <tbody>
          {products.map((p) => (
            <MediaKitRow
              key={p.part}
              product={p}
              onEdit={() => onEdit(p)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
