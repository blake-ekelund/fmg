import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("has_password")
    .eq("id", data.user.id)
    .single();

  if (!profile?.has_password) {
    redirect("/create-account");
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">
        Welcome
      </h1>
    </main>
  );
}
