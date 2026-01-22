export function Table({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="divide-y divide-gray-200">
      {children}
    </div>
  );
}
