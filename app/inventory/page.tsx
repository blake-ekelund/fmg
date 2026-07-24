import InventoryPage from "@/components/inventory/InventoryPage";

export default async function InventoryRoute({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  return <InventoryPage initialFilter={filter} />;
}
