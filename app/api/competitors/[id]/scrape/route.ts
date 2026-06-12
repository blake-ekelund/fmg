import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  createRun,
  finishRun,
  insertStores,
} from "@/scripts/scrape-competitors/db";
import { generateGrid } from "@/scripts/scrape-competitors/grid";
import { scrapeCompetitor } from "@/scripts/scrape-competitors/scraper";
import { dedupStores } from "@/scripts/scrape-competitors/dedup";
import { createLogger } from "@/scripts/scrape-competitors/logger";
import type { Competitor, ScrapeStats } from "@/scripts/scrape-competitors/types";

export const runtime = "nodejs";
// Grid sweeps can run several minutes. On Vercel this only works on Pro/Enterprise.
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // One outer try/catch: no matter what blows up below, return JSON so the
  // client never sees "Unexpected end of JSON input".
  try {
    const { id } = await context.params;

    const { data, error } = await supabaseServer
      .from("competitors")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }
    const competitor = data as Competitor;

    // Multi-request grid sweeps blow past Vercel's serverless timeout and tie
    // up the dev request for many minutes. Reject with an actionable message
    // telling the user to run it via the CLI instead.
    if (!competitor.request_config.singleCall) {
      return NextResponse.json(
        {
          error:
            `"${competitor.name}" requires a full grid sweep (won't fit in a web request). ` +
            `Run from a terminal: npm run scrape:competitors -- --competitor "${competitor.name}"`,
          requiresCli: true,
          cliCommand: `npm run scrape:competitors -- --competitor "${competitor.name}"`,
        },
        { status: 400 },
      );
    }

    const logger = createLogger("info");
    const effectiveRadius = competitor.request_config.radiusValue ?? 100;
    const grid = competitor.request_config.singleCall
      ? [{ lat: 0, lng: 0 }]
      : generateGrid({ radiusMiles: effectiveRadius, overlap: 0.2 });

    const runId = await createRun(supabaseServer, competitor.id, grid.length);

    try {
      const result = await scrapeCompetitor(competitor, grid, { logger });
      const unique = dedupStores(result.stores);
      await insertStores(supabaseServer, runId, competitor.id, unique);

      let matchedCount = 0;
      try {
        const { data: matchResult } = await supabaseServer.rpc(
          "match_competitor_stores",
          { p_run_id: runId },
        );
        matchedCount = typeof matchResult === "number" ? matchResult : 0;
      } catch (e) {
        logger.warn("customer match step failed", { err: String(e) });
      }

      const status = result.aborted ? "aborted" : "completed";
      await safeFinishRun(runId, status, {
        grid_points: grid.length,
        total_requests: result.totalRequests,
        unique_stores: unique.length,
        error_count: result.errorCount,
        matched_customers: matchedCount,
      }, logger);

      return NextResponse.json({
        runId,
        status,
        uniqueStores: unique.length,
        totalRequests: result.totalRequests,
        errorCount: result.errorCount,
        matchedCustomers: matchedCount,
      });
    } catch (e) {
      await safeFinishRun(
        runId,
        "failed",
        { grid_points: grid.length, total_requests: 0, unique_stores: 0, error_count: 1 },
        logger,
        String(e),
      );
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * Finish a run without ever throwing — falls back to an update that omits
 * matched_customers in case that column hasn't been migrated yet.
 */
async function safeFinishRun(
  runId: string,
  status: "completed" | "failed" | "aborted",
  stats: ScrapeStats,
  logger: ReturnType<typeof createLogger>,
  notes?: string,
) {
  try {
    await finishRun(supabaseServer, runId, status, stats, notes);
  } catch (e) {
    logger.warn("finishRun failed; retrying without matched_customers", { err: String(e) });
    try {
      await supabaseServer
        .from("scrape_runs")
        .update({
          finished_at: new Date().toISOString(),
          status,
          total_requests: stats.total_requests,
          unique_stores: stats.unique_stores,
          error_count: stats.error_count,
          notes: notes ?? null,
        })
        .eq("id", runId);
    } catch (e2) {
      logger.warn("finishRun fallback also failed", { err: String(e2) });
    }
  }
}
