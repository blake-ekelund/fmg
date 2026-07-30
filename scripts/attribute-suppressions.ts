/**
 * One-time backfill: attribute suppression rows that carry only an address
 * (webhook bounces/complaints, Resend-list imports) to the Wholesale or D2C
 * customer we mailed at that address — matched against bulk send-job
 * recipients, then automation enrollments. Attribution is what lets the
 * customer pages flag the account itself.
 *
 * Run:
 *   npx tsx scripts/attribute-suppressions.ts          (apply)
 *   npx tsx scripts/attribute-suppressions.ts --dry    (preview only)
 *
 * Idempotent — only rows with no customer_ref are touched. The webhook now
 * attributes at write time, so this is backfill/drift repair.
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

async function main() {
  const dry = process.argv.includes("--dry");
  const env = { ...loadEnvLocal(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data: rows, error } = await supabase
    .from("email_unsubscribes")
    .select("id, email")
    .is("customer_ref", null)
    .limit(5000);
  if (error) { console.error(error.message); process.exit(1); }
  const unattributed = (rows ?? []) as Array<{ id: string; email: string }>;
  console.log(`${unattributed.length} suppression rows lack a customer attribution.`);
  if (unattributed.length === 0) return;

  // Pull ALL send-history rows and match in memory — the DB comparison is
  // case-sensitive, but stored addresses keep Fishbowl's mixed case while
  // suppressions are normalized lowercase, so an .in() filter misses most.
  const byEmail = new Map<string, { customer_type: string; customer_ref: string }>();
  for (const table of ["email_send_job_recipients", "automation_enrollments"] as const) {
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from(table)
        .select("customer_email, customer_type, customer_ref")
        .range(from, from + 999);
      const batch = (data as Array<Record<string, string | null>> | null) ?? [];
      for (const r of batch) {
        const e = (r.customer_email ?? "").trim().toLowerCase();
        if (!e || byEmail.has(e) || !r.customer_ref) continue;
        if (r.customer_type !== "wholesale" && r.customer_type !== "d2c") continue;
        byEmail.set(e, { customer_type: r.customer_type, customer_ref: r.customer_ref });
      }
      if (batch.length < 1000) break;
    }
  }

  let matched = 0;
  let unmatched = 0;
  for (const row of unattributed) {
    const hit = byEmail.get(row.email.toLowerCase());
    if (!hit) { unmatched++; continue; }
    matched++;
    if (dry) {
      console.log(`  ${row.email} → ${hit.customer_type} ${hit.customer_ref}`);
      continue;
    }
    const { error: upErr } = await supabase
      .from("email_unsubscribes")
      .update({ customer_type: hit.customer_type, customer_ref: hit.customer_ref })
      .eq("id", row.id);
    if (upErr) { console.error(`  ${row.email}: ${upErr.message}`); process.exit(1); }
  }

  console.log(
    `${dry ? "[dry] Would attribute" : "Attributed"} ${matched} rows; ${unmatched} had no send history to match against.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
