import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { fishbowlConfigured, getInventoryPage, getAllInventory } from "@/lib/fishbowl";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/fishbowl/inventory — live part inventory from Fishbowl.
 *
 * `?all=1` pages through everything (~537 parts); otherwise returns a single
 * page (`?page=1&pageSize=100`). Admin-gated like the other internal routes.
 * Fails soft with a clear message when the FISHBOWL_* env vars aren't set.
 */
export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!fishbowlConfigured()) {
    return NextResponse.json(
      {
        error:
          "Fishbowl not connected — set FISHBOWL_API_URL, FISHBOWL_USER, FISHBOWL_PASS (and optionally FISHBOWL_APP_ID) in the environment.",
      },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  try {
    if (url.searchParams.get("all") === "1") {
      const rows = await getAllInventory();
      return NextResponse.json({ count: rows.length, results: rows });
    }
    const page = Number(url.searchParams.get("page") || 1);
    const pageSize = Number(url.searchParams.get("pageSize") || 100);
    const data = await getInventoryPage(page, pageSize);
    return NextResponse.json(data);
  } catch (e) {
    // Login failure, unreachable host (e.g. Vercel can't reach :2456), etc.
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
