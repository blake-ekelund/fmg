import PurchasingPage from "@/components/inventory/purchasing/PurchasingPage";
import type { InventoryStatus } from "@/components/inventory/forecasting/types";

export const metadata = { title: "Purchasing" };

const STATUSES: InventoryStatus[] = ["at risk", "needs review", "healthy", "no demand"];

export default async function PurchasingRoute({
  searchParams,
}: {
  searchParams: Promise<{ part?: string; status?: string }>;
}) {
  const { part, status } = await searchParams;
  // ?status=at risk,needs review — carried over from the Inventory page's filter.
  const statuses = status
    ?.split(",")
    .map((s) => s.trim())
    .filter((s): s is InventoryStatus => (STATUSES as string[]).includes(s));
  return (
    <div className="px-4 md:px-8 py-4 md:py-5">
      <PurchasingPage initialPart={part} initialStatuses={statuses?.length ? statuses : undefined} />
    </div>
  );
}
