import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { runQuery, toCsv, type QuerySpec } from "@/lib/assistant/dataCatalog";
import type { UserRole } from "@/components/UserContext";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/help/export — the CSV behind a Sage "Download report" button.
 *
 * Body: { spec: QuerySpec, filename?: string }
 * Returns: text/csv attachment, up to 20,000 rows.
 *
 * Re-checks everything: the dataset must be one the caller's role can see
 * (dataCatalog gates each dataset on its page), whatever Sage put in the spec.
 */
const MAX_ROWS = 20_000;

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { spec?: QuerySpec; filename?: unknown };
  if (!body.spec || typeof body.spec.dataset !== "string") {
    return NextResponse.json({ error: "Missing report spec." }, { status: 400 });
  }
  const filename =
    typeof body.filename === "string" && /^[\w\- ]+\.csv$/.test(body.filename) ? body.filename : "report.csv";

  try {
    const result = await runQuery({ ...body.spec, limit: MAX_ROWS }, user.access as UserRole, {
      maxRows: MAX_ROWS,
      scanLimit: 200_000,
    });
    // BOM so Excel opens UTF-8 (names with accents, ™, etc.) correctly.
    return new Response("﻿" + toCsv(result), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't build the report." }, { status: 400 });
  }
}
