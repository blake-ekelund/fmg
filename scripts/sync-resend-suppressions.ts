/**
 * Pull Resend's own suppression list (permanent bounces + complaints — the
 * authoritative "never deliverable" set) into email_unsubscribes, so our send
 * paths skip those addresses too.
 *
 * Preferred over the CSV import (scripts/import-bounces.ts): the dashboard
 * export doesn't distinguish permanent from transient bounces, but Resend's
 * suppression list contains only the permanent ones by construction.
 *
 * Run:
 *   npx tsx scripts/sync-resend-suppressions.ts          (apply)
 *   npx tsx scripts/sync-resend-suppressions.ts --dry    (preview only)
 *
 * Reads RESEND_API_KEY + Supabase credentials from .env.local. Idempotent —
 * safe to re-run any time (the webhook keeps things current day-to-day; this
 * is for backfill or drift repair).
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

type ResendSuppression = {
  id: string;
  email: string;
  origin: string; // "bounce" | "complaint" | ...
  created_at: string;
};

async function fetchAllSuppressions(apiKey: string): Promise<ResendSuppression[]> {
  const all: ResendSuppression[] = [];
  let after: string | null = null;
  for (let page = 0; page < 100; page++) {
    const url = new URL("https://api.resend.com/suppressions");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`Resend suppressions API failed (${res.status}): ${await res.text()}`);
    const json = (await res.json()) as { data: ResendSuppression[]; has_more: boolean };
    all.push(...json.data);
    if (!json.has_more || json.data.length === 0) break;
    after = json.data[json.data.length - 1].id;
  }
  return all;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const env = { ...loadEnvLocal(), ...process.env };
  const apiKey = env.RESEND_API_KEY;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !url || !key) {
    console.error("Missing RESEND_API_KEY / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const suppressions = await fetchAllSuppressions(apiKey);
  // Dedupe by address; complaint outranks bounce if an address has both.
  const byEmail = new Map<string, ResendSuppression>();
  for (const s of suppressions) {
    const email = s.email.trim().toLowerCase();
    if (!email.includes("@")) continue;
    const existing = byEmail.get(email);
    if (!existing || s.origin === "complaint") byEmail.set(email, { ...s, email });
  }

  const counts = { bounce: 0, complaint: 0, other: 0 };
  for (const s of byEmail.values()) {
    if (s.origin === "bounce") counts.bounce++;
    else if (s.origin === "complaint") counts.complaint++;
    else counts.other++;
  }
  console.log(
    `Resend suppression list: ${byEmail.size} unique addresses ` +
    `(${counts.bounce} bounce, ${counts.complaint} complaint${counts.other ? `, ${counts.other} other` : ""})`,
  );

  if (dry) {
    for (const s of byEmail.values()) console.log(`  ${s.email}  — ${s.origin}`);
    console.log("\nDry run — nothing written. Re-run without --dry to apply.");
    return;
  }

  const supabase = createClient(url, key);
  const entries = [...byEmail.values()].map((s) => ({
    email: s.email,
    source: s.origin === "complaint" ? "complaint" : "bounce",
    reason:
      s.origin === "complaint"
        ? "Marked email as spam (Resend suppression list)"
        : "Permanent bounce (Resend suppression list)",
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
  }
  console.log(`Done — ${written} addresses suppressed. Every future send skips them automatically.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
