export default function StatusDot({
  status,
}: {
  status: "healthy" | "watch" | "critical";
}) {
  return (
    <span
      className={`h-2 w-2 rounded-full ${
        status === "healthy"
          ? "bg-lime-500"
          : status === "watch"
          ? "bg-orange-400"
          : "bg-pink-400"
      }`}
    />
  );
}
