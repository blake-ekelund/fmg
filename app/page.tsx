import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">
        Welcome {user?.email}
      </h1>
    </main>
  );
}
