import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  return (
    <main className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            Fragrance Marketing Group — internal overview
          </p>
        </div>

        <span className="px-3 py-1 rounded-full text-sm border">
          {profile?.role === "admin" ? "Admin" : "Member"}
        </span>
      </div>

      {/* KPI placeholders */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard title="Revenue" />
        <KpiCard title="Active Campaigns" />
        <KpiCard title="Spend Efficiency" />
      </section>

      <p className="mt-10 text-xs text-gray-500">
        Data access is restricted based on your role.
      </p>
    </main>
  );
}

function KpiCard({ title }: { title: string }) {
  return (
    <div className="border rounded-2xl p-6 bg-white shadow-sm">
      <h2 className="text-sm font-medium text-gray-600">{title}</h2>
      <div className="mt-4 h-10 w-32 bg-gray-100 rounded animate-pulse" />
    </div>
  );
}
