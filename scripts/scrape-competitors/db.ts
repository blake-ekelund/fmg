import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Competitor, ScrapeStats, StandardStore } from "./types";

export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars",
    );
  }
  return createClient(url, key);
}

export async function listEnabledCompetitors(db: SupabaseClient): Promise<Competitor[]> {
  const { data, error } = await db.from("competitors").select("*").eq("enabled", true);
  if (error) throw error;
  return (data ?? []) as Competitor[];
}

export async function getCompetitorByName(
  db: SupabaseClient,
  name: string,
): Promise<Competitor | null> {
  const { data, error } = await db
    .from("competitors")
    .select("*")
    .ilike("name", name)
    .maybeSingle();
  if (error) throw error;
  return (data as Competitor) ?? null;
}

export async function createRun(
  db: SupabaseClient,
  competitorId: string,
  gridPoints: number,
): Promise<string> {
  const { data, error } = await db
    .from("scrape_runs")
    .insert({ competitor_id: competitorId, grid_points: gridPoints })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function finishRun(
  db: SupabaseClient,
  runId: string,
  status: "completed" | "failed" | "aborted",
  stats: ScrapeStats,
  notes?: string,
): Promise<void> {
  const { error } = await db
    .from("scrape_runs")
    .update({
      finished_at: new Date().toISOString(),
      status,
      total_requests: stats.total_requests,
      unique_stores: stats.unique_stores,
      error_count: stats.error_count,
      matched_customers: stats.matched_customers ?? 0,
      notes: notes ?? null,
    })
    .eq("id", runId);
  if (error) throw error;
}

export async function insertStores(
  db: SupabaseClient,
  runId: string,
  competitorId: string,
  stores: StandardStore[],
): Promise<void> {
  if (stores.length === 0) return;
  const rows = stores.map((s) => ({
    run_id: runId,
    competitor_id: competitorId,
    external_id: s.external_id,
    store_name: s.store_name,
    address: s.address,
    city: s.city,
    state: s.state,
    zip: s.zip,
    country: s.country,
    phone: s.phone,
    latitude: s.latitude,
    longitude: s.longitude,
    raw_json: s.raw_json,
  }));

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db
      .from("competitor_stores")
      .insert(rows.slice(i, i + CHUNK));
    if (error) throw error;
  }
}
