import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return (
    <main className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Fragrance Marketing Group internal dashboard
          </p>
        </div>

        {profile?.role && (
          <span className="px-3 py-1 rounded-full text-sm border">
            {profile.role === "admin" ? "Admin" : "Member"}
          </span>
        )}
      </div>

      {/* KPI Placeholder Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card title="Revenue">
          <PlaceholderValue />
        </Card>

        <Card title="Active Campaigns">
          <PlaceholderValue />
        </Card>

        <Card title="Spend Efficiency">
          <PlaceholderValue />
        </Card>
      </section>

      {/* Footer note */}
      <p className="mt-10 text-xs text-gray-500">
        Data shown here is restricted based on your access level.
      </p>
    </main>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-2xl p-6 shadow-sm bg-white">
      <h2 className="text-sm font-medium text-gray-600">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function PlaceholderValue() {
  return (
    <div className="h-10 w-32 bg-gray-100 rounded animate-pulse" />
  );
}
