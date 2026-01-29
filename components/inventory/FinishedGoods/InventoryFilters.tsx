export default function InventoryFilters() {
  return (
    <section className="flex gap-4">
      <input
        placeholder="Search SKU or Product"
        className="flex-1 border rounded-xl px-4 py-2 text-sm"
      />

      <select className="border rounded-xl px-4 py-2 text-sm">
        <option>Warehouse</option>
        <option>Minneapolis</option>
        <option>Van Fleet</option>
      </select>
    </section>
  );
}
