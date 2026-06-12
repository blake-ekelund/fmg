import { NextResponse } from "next/server";
import Papa from "papaparse";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;

  const { data: run } = await supabaseServer
    .from("scrape_runs")
    .select("id, started_at, competitor_id, competitors(name)")
    .eq("id", runId)
    .maybeSingle();
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const { data: stores, error } = await supabaseServer
    .from("competitor_stores")
    .select(
      "external_id, store_name, address, city, state, zip, country, phone, latitude, longitude, matched_customer_id, matched_customer_name, match_score, match_source, scraped_at",
    )
    .eq("run_id", runId)
    .order("matched_customer_id", { ascending: true, nullsFirst: true })
    .order("state", { ascending: true })
    .order("store_name", { ascending: true })
    .limit(50000);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const competitorName =
    (run as { competitors?: { name?: string } }).competitors?.name ?? "competitor";

  const rows = (stores ?? []).map((s) => ({
    competitor: competitorName,
    is_prospect: s.matched_customer_id ? "false" : "true",
    store_name: s.store_name ?? "",
    address: s.address ?? "",
    city: s.city ?? "",
    state: s.state ?? "",
    zip: s.zip ?? "",
    country: s.country ?? "",
    phone: s.phone ?? "",
    latitude: s.latitude ?? "",
    longitude: s.longitude ?? "",
    matched_customer_id: s.matched_customer_id ?? "",
    matched_customer_name: s.matched_customer_name ?? "",
    match_score:
      s.match_score != null ? Number(s.match_score).toFixed(2) : "",
    match_source: s.match_source ?? "",
    external_id: s.external_id ?? "",
    scraped_at: s.scraped_at,
  }));

  const csv = Papa.unparse(rows);
  const ts = new Date(run.started_at as string).toISOString().slice(0, 10);
  const safeName = competitorName.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const filename = `${safeName}-prospects-${ts}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
