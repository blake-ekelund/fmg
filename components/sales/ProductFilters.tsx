"use client";

type Props = {
  products: string[];
  fragrances: string[];
  selectedProduct: string;
  selectedFragrance: string;
  onProductChange: (v: string) => void;
  onFragranceChange: (v: string) => void;
};

export function ProductFilters({
  products,
  fragrances,
  selectedProduct,
  selectedFragrance,
  onProductChange,
  onFragranceChange,
}: Props) {
  return (
    <div className="flex flex-wrap gap-4">
      <select
        value={selectedProduct}
        onChange={(e) => onProductChange(e.target.value)}
        className="border border-gray-200 rounded-xl px-4 py-2 text-sm"
      >
        <option value="">All Products</option>
        {products.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <select
        value={selectedFragrance}
        onChange={(e) => onFragranceChange(e.target.value)}
        className="border border-gray-200 rounded-xl px-4 py-2 text-sm"
      >
        <option value="">All Fragrances</option>
        {fragrances.map(f => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
    </div>
  );
}
