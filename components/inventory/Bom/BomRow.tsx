import StatusDot from "../StatusDot";
import { getBomStatus } from "./BomStatus";

export default function BomRow({
  material,
  uom,
  onHand,
  allocated,
  available,
}: {
  material: string;
  uom: string;
  onHand: number;
  allocated: number;
  available: number;
}) {
  const status = getBomStatus({ available, onHand, allocated });

  return (
    <div className="grid grid-cols-5 gap-4 py-4 items-center">
      <div className="font-medium">{material}</div>
      <div className="text-sm">
        {onHand} {uom}
      </div>
      <div className="text-sm">
        {allocated} {uom}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">
          {available} {uom}
        </span>
        <StatusDot status={status} />
      </div>
    </div>
  );
}
