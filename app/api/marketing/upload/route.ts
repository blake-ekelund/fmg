import { supabaseServer } from "@/lib/supabaseServer";
import Papa from "papaparse";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return Response.json({ error: "No file uploaded" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

  if (parsed.errors.length) {
    return Response.json(
      { error: "CSV parse error", details: parsed.errors },
      { status: 400 }
    );
  }

  if (!parsed.data.length) {
    return Response.json(
      { error: "CSV contains no data rows" },
      { status: 400 }
    );
  }

  const rows = parsed.data as any[];

  const payload = rows.map((r) => ({
    day: r["Day"],
    total_orders: Number(r["Total number of orders"]),
    total_amount_spent: Number(r["Total amount spent"]),
    total_amount_spent_per_order: Number(r["Total amount spent per order"]),
    bounces: Number(r["Bounces"]),
    conversion_rate: Number(r["Conversion rate"]),
    online_store_visitors: Number(r["Online store visitors"]),
    sessions: Number(r["Sessions"]),
    sessions_completed_checkout: Number(
      r["Sessions that reached and completed checkout"]
    ),
    sessions_reached_checkout: Number(
      r["Sessions that reached checkout"]
    ),
    total_shipping_charges: Number(r["Total shipping charges"]),
  }));

  const { error } = await supabaseServer
    .from("shopify_daily_metrics")
    .upsert(payload, { onConflict: "day" });

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({
    success: true,
    rowsProcessed: payload.length,
  });
}
