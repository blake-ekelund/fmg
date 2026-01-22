import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  console.log("[HOME] rendering");

  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();

  console.log("[HOME] getUser error:", error);
  console.log("[HOME] getUser user:", data?.user);

  if (!data?.user) {
    console.log("[HOME] no user → redirect /sign-in");
    redirect("/sign-in");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("has_password")
    .eq("id", data.user.id)
    .single();

  console.log("[HOME] profile error:", profileError);
  console.log("[HOME] profile data:", profile);

  if (!profile?.has_password) {
    console.log("[HOME] has_password = false → redirect /create-account");
    redirect("/create-account");
  }

  console.log("[HOME] success → render dashboard");

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">
        Welcome
      </h1>
    </main>
  );
}
