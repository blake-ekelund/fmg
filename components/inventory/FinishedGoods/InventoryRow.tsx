import StatusDot from "../StatusDot";
import { getInventoryStatus } from "./inventoryStatus";

export default function InventoryRow({
  name,
  warehouse,
  onHand,
  onOrder,
  available,
}: {
  name: string;
  warehouse: string;
  onHand: number;
  onOrder: number;
  available: number;
}) {
  const status = getInventoryStatus({ available, onHand, onOrder });

  return (
    <div className="grid grid-cols-5 gap-4 py-4 items-center">
      <div className="font-medium">{name}</div>
      <div className="text-sm text-gray-500">{warehouse}</div>
      <div className="text-sm">{onHand}</div>
      <div className="text-sm">{onOrder}</div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{available}</span>
        <StatusDot status={status} />
      </div>
    </div>
  );
}
