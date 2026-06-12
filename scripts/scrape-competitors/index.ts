/**
 * Quarterly competitor store-locator scraper.
 *
 *   npm run scrape:competitors                       # run all enabled
 *   npm run scrape:competitors -- --competitor Thymes
 *   npm run scrape:competitors -- --dry-run
 *   npm run scrape:competitors -- --radius-miles 75
 */
// Load .env.local (Next.js convention) first, then fall back to .env. dotenv
// does not overwrite vars that are already set, so the first load wins.
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });
loadDotenv();
import {
  getServiceClient,
  listEnabledCompetitors,
  getCompetitorByName,
  createRun,
  finishRun,
  insertStores,
} from "./db";
import { generateGrid } from "./grid";
import { scrapeCompetitor } from "./scraper";
import { dedupStores } from "./dedup";
import { createLogger } from "./logger";
import type { Competitor } from "./types";

type Args = {
  competitor?: string;
  dryRun: boolean;
  /** If unset, falls back to competitor.request_config.radiusValue, then 100. */
  radiusMiles?: number;
  overlap: number;
  logLevel: "debug" | "info" | "warn" | "error";
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    overlap: 0.2,
    logLevel: "info",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--competitor") args.competitor = argv[++i];
    else if (a === "--radius-miles") args.radiusMiles = Number(argv[++i]);
    else if (a === "--overlap") args.overlap = Number(argv[++i]);
    else if (a === "--log-level") args.logLevel = argv[++i] as Args["logLevel"];
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Usage: npm run scrape:competitors -- [options]

Options:
  --competitor <name>      Scrape only this competitor (default: all enabled)
  --dry-run                Print planned requests without calling endpoints
  --radius-miles <n>       Grid coverage radius in miles. Defaults to the
                           competitor's saved radiusValue (30 mi for direct
                           Stockist, 100 mi otherwise).
  --overlap <0..1>         Grid overlap fraction (default: 0.2)
  --log-level <level>      debug | info | warn | error (default: info)
`);
}

async function runOne(
  competitor: Competitor,
  args: Args,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const db = getServiceClient();
  const effectiveRadius =
    args.radiusMiles ?? competitor.request_config.radiusValue ?? 100;
  const grid = competitor.request_config.singleCall
    ? [{ lat: 0, lng: 0 }]
    : generateGrid({
        radiusMiles: effectiveRadius,
        overlap: args.overlap,
      });

  logger.info(`starting scrape`, {
    competitor: competitor.name,
    gridPoints: grid.length,
    radiusMiles: effectiveRadius,
    singleCall: competitor.request_config.singleCall ?? false,
    dryRun: args.dryRun,
  });

  if (args.dryRun) {
    const result = await scrapeCompetitor(competitor, grid, { dryRun: true, logger });
    logger.info(`dry run complete`, { plannedRequests: result.totalRequests });
    return;
  }

  const runId = await createRun(db, competitor.id, grid.length);
  logger.info(`run created`, { runId });

  // Fire-and-forget progress writer. Throttled: updates at most every 1s to
  // avoid hammering Supabase while still giving a live counter in the UI.
  let lastProgressAt = 0;
  const onProgress = (completed: number) => {
    const now = Date.now();
    if (now - lastProgressAt < 1000 && completed !== grid.length) return;
    lastProgressAt = now;
    db.from("scrape_runs")
      .update({ total_requests: completed })
      .eq("id", runId)
      .then(() => {}, () => {});
  };

  try {
    const result = await scrapeCompetitor(competitor, grid, { logger, onProgress });
    const unique = dedupStores(result.stores);
    await insertStores(db, runId, competitor.id, unique);

    const status = result.aborted ? "aborted" : "completed";
    await finishRun(db, runId, status, {
      grid_points: grid.length,
      total_requests: result.totalRequests,
      unique_stores: unique.length,
      error_count: result.errorCount,
    });

    logger.info(`run ${status}`, {
      runId,
      totalRequests: result.totalRequests,
      uniqueStores: unique.length,
      errors: result.errorCount,
    });
  } catch (err) {
    logger.error(`run failed`, { err: String(err) });
    await finishRun(
      db,
      runId,
      "failed",
      { grid_points: grid.length, total_requests: 0, unique_stores: 0, error_count: 1 },
      String(err),
    );
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const logger = createLogger(args.logLevel);
  const db = getServiceClient();

  const competitors: Competitor[] = args.competitor
    ? [await requireCompetitor(db, args.competitor)]
    : await listEnabledCompetitors(db);

  if (competitors.length === 0) {
    logger.warn(`no competitors to scrape`);
    return;
  }

  for (const c of competitors) {
    try {
      await runOne(c, args, logger);
    } catch (err) {
      logger.error(`competitor failed`, { name: c.name, err: String(err) });
    }
  }
}

async function requireCompetitor(
  db: ReturnType<typeof getServiceClient>,
  name: string,
): Promise<Competitor> {
  const c = await getCompetitorByName(db, name);
  if (!c) throw new Error(`competitor not found: ${name}`);
  return c;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
