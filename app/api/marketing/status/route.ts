import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("shopify_daily_metrics")
    .select("*")
    .order("day", { ascending: false })
    .limit(1);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // No rows yet → valid empty state
  if (!data || data.length === 0) {
    return Response.json({ data: null });
  }

  return Response.json({ data: data[0] });
}
