export function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border border-gray-200 rounded-2xl p-4">
      <div className="text-sm text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">
        {value}
      </div>
    </div>
  );
}
