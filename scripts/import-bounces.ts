/**
 * One-time backfill: suppress permanently-bounced addresses from a Resend CSV
 * export, so past bounces stop being re-mailed even though they predate the
 * bounce webhook.
 *
 * Get the CSV: Resend dashboard → Emails → filter status "Bounced" → Export.
 *
 * Run:
 *   npx tsx scripts/import-bounces.ts path/to/export.csv
 *   npx tsx scripts/import-bounces.ts path/to/export.csv --dry   (preview only)
 *
 * Reads Supabase credentials from .env.local (same vars the app uses).
 * Idempotent — addresses already suppressed are simply updated in place.
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal(): Record<string, string> {
  const envPath = path.join(process.cwd(), ".env.local");
  const out: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Minimal CSV parser that handles quoted fields with commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

/** Pull a bare address out of "Name <a@b.com>" or a plain "a@b.com". */
function extractEmail(raw: string): string | null {
  const angled = raw.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  const bare = angled?.[1] ?? raw.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bare) ? bare.toLowerCase() : null;
}

async function main() {
  const [csvPath, ...flags] = process.argv.slice(2);
  const dry = flags.includes("--dry");
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/import-bounces.ts <resend-export.csv> [--dry]");
    process.exit(1);
  }

  const env = { ...loadEnvLocal(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (checked .env.local and the environment).");
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(path.resolve(csvPath), "utf8"));
  if (rows.length < 2) {
    console.error("CSV has no data rows.");
    process.exit(1);
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const emailCol = header.findIndex((h) => /^(to|email|recipient)s?$/.test(h) || h.includes("recipient") || h === "to");
  const typeCol = header.findIndex((h) => h.includes("bounce") && h.includes("type"));
  const statusCol = header.findIndex((h) => h.includes("status") || h.includes("last_event") || h.includes("last event"));
  if (emailCol === -1) {
    console.error(`Couldn't find a recipient column. Headers: ${header.join(", ")}`);
    process.exit(1);
  }

  const suppress = new Map<string, string>(); // email → reason
  let skippedTransient = 0;
  let skippedNotBounced = 0;
  for (const row of rows.slice(1)) {
    const email = extractEmail(row[emailCol] ?? "");
    if (!email) continue;
    // If the export wasn't pre-filtered to bounced, filter here.
    if (statusCol !== -1 && !/bounce/i.test(row[statusCol] ?? "")) { skippedNotBounced++; continue; }
    // Only permanent bounces suppress; transient may deliver fine next time.
    const bounceType = typeCol !== -1 ? (row[typeCol] ?? "").trim() : "";
    if (bounceType && !/permanent/i.test(bounceType)) { skippedTransient++; continue; }
    suppress.set(email, bounceType ? `Permanent bounce (Resend import)` : "Bounce (Resend import)");
  }

  console.log(`Parsed ${rows.length - 1} rows → ${suppress.size} unique addresses to suppress` +
    (skippedTransient ? `, ${skippedTransient} transient skipped` : "") +
    (skippedNotBounced ? `, ${skippedNotBounced} non-bounced skipped` : "") +
    (typeCol === -1 ? "  (no bounce-type column found — export only PERMANENT bounces, or all bounced rows will be suppressed)" : ""));

  if (dry) {
    for (const [email, reason] of suppress) console.log(`  ${email}  — ${reason}`);
    console.log("\nDry run — nothing written. Re-run without --dry to apply.");
    return;
  }

  const supabase = createClient(url, key);
  const entries = [...suppress.entries()].map(([email, reason]) => ({
    email,
    source: "bounce",
    reason,
  }));
  const CHUNK = 200;
  let written = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const { error } = await supabase
      .from("email_unsubscribes")
      .upsert(entries.slice(i, i + CHUNK), { onConflict: "email" });
    if (error) {
      console.error(`Failed at row ${i}: ${error.message}`);
      process.exit(1);
    }
    written += Math.min(CHUNK, entries.length - i);
    console.log(`  ${written}/${entries.length} suppressed…`);
  }
  console.log(`Done — ${written} addresses suppressed. Future sends skip them automatically.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
