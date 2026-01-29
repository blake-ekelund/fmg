export function getInventoryStatus({
  available,
}: {
  available: number;
  onHand: number;
  onOrder: number;
}) {
  if (available === 0) return "critical";
  if (available < 200) return "watch";
  return "healthy";
}
