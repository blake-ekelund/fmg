import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireRole(role: "admin" | "member") {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.user.id)
    .single();

  if (!profile || profile.role !== role) {
    redirect("/");
  }
}
