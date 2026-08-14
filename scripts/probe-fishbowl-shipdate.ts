/** READ-ONLY: find where the "future ship date" lives on a Fishbowl SO.
 *   npx tsx scripts/probe-fishbowl-shipdate.ts */
import { readFileSync } from "node:fs";
import path from "node:path";
for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
async function main() {
  const { withFishbowl } = await import("../lib/fishbowl");
  await withFishbowl(async (query) => {
    // Dump every column of two "SHIP 9.xx" SOs; we'll spot which date col = the note.
    for (const ref of ["ZJUHGM7VPR", "GYD9MURARB"]) {
      const rows = await query(`SELECT * FROM so WHERE customerPO LIKE '%${ref}%'`);
      console.log(`\n── ${ref} (num should note SHIP 9.xx) ──`);
      for (const r of rows) {
        for (const [k, v] of Object.entries(r)) {
          // Only show date-ish / ship-ish columns to keep it readable.
          if (/date|ship|fulfil|schedul/i.test(k)) console.log(`  ${k}: ${JSON.stringify(v)}`);
        }
      }
    }
  });
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
