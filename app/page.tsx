export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-2xl w-full px-6">
        <div className="bg-white border rounded-2xl p-10 shadow-sm">
          <h1 className="text-3xl font-semibold">
            Fragrance Marketing Group
          </h1>

          <p className="mt-4 text-gray-600 text-lg">
            Internal dashboard placeholder.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat label="Revenue" value="—" />
            <Stat label="Active Campaigns" value="—" />
            <Stat label="Spend Efficiency" value="—" />
          </div>

          <p className="mt-10 text-sm text-gray-400">
            This page is intentionally simple. Auth and permissions will be added later.
          </p>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-xl p-4 bg-gray-50">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-medium">{value}</div>
    </div>
  );
}
