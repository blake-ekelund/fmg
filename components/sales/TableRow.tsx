type Props = {
  name: string;
  value: string;
  secondary?: string;
  accent?: "pink" | "green" | "orange" | "blue";
};

const accentMap: Record<NonNullable<Props["accent"]>, string> = {
  pink: "text-pink-600",
  green: "text-green-600",
  orange: "text-orange-600",
  blue: "text-blue-600",
};

export function TableRow({
  name,
  value,
  secondary,
  accent,
}: Props) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="min-w-0">
        <div className="font-medium text-gray-900 truncate">
          {name}
        </div>
        {secondary && (
          <div className="text-sm text-gray-500">
            {secondary}
          </div>
        )}
      </div>

      <div
        className={`font-medium tabular-nums ${
          accent ? accentMap[accent] : "text-gray-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
