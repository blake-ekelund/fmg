export function getBomStatus({
  available,
  onHand,
  allocated,
}: {
  available: number;
  onHand: number;
  allocated: number;
}): "healthy" | "watch" | "critical" {
  if (available === 0) return "critical";

  const utilization = allocated / Math.max(onHand, 1);

  if (utilization > 0.85) return "watch";

  return "healthy";
}
