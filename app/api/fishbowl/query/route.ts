import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured, runDataQuery } from "@/lib/fishbowl";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/fishbowl/query  { sql }
 *
 * Runs a read-only SQL data-query against Fishbowl and returns the rows. This
 * is the bridge to your Fishbowl "data views" / saved queries. Admin-gated and
 * SELECT/WITH-only — intended for the internal sandbox. Do NOT wire raw SQL to
 * end users; once you settle on a query, bake it into a dedicated endpoint.
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!fishbowlConfigured()) {
    return NextResponse.json(
      { error: "Fishbowl not connected — set FISHBOWL_API_URL / FISHBOWL_USER / FISHBOWL_PASS." },
      { status: 500 },
    );
  }

  const { sql } = (await request.json().catch(() => ({}))) as { sql?: string };
  if (!sql || !sql.trim()) {
    return NextResponse.json({ error: "Provide a SQL query." }, { status: 400 });
  }

  // Read-only guard: only let SELECT/WITH through, so a stray UPDATE/DELETE
  // can't reach the Fishbowl database even from this admin tool.
  const head = sql.trim().toLowerCase();
  if (!head.startsWith("select") && !head.startsWith("with")) {
    return NextResponse.json(
      { error: "Only SELECT / WITH queries are allowed here." },
      { status: 400 },
    );
  }

  try {
    const rows = await runDataQuery(sql);
    return NextResponse.json({ count: rows.length, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
