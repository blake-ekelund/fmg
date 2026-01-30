// /shopify/components/ShopifyEmptyState.tsx
export function ShopifyEmptyState() {
  return (
    <section className="rounded-xl border border-dashed p-6 text-gray-500">
      <p>No Shopify data has been uploaded yet.</p>
      <p className="text-sm mt-2">
        Upload your first daily CSV to begin tracking Shopify performance.
      </p>
    </section>
  );
}
