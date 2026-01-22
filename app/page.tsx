import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, has_password")
    .eq("id", user!.id)
    .single();

  // 🔐 FORCE password setup if missing
  if (!profile?.has_password) {
    redirect("/set-password");
  }

  return (
    <main className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-gray-600">
        Role: {profile.role}
      </p>
    </main>
  );
}
