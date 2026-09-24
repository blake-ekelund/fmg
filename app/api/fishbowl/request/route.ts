import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured, fishbowlRequest } from "@/lib/fishbowl";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/fishbowl/request — sandbox-only raw Fishbowl API explorer. Sends the
 * given { method, path, body } to the Fishbowl server inside a session and
 * returns the status, Allow header, and body verbatim (no throwing on non-2xx),
 * so we can discover endpoint shapes (export templates, an existing SO, etc.).
 *
 * Internal/admin only. `path` must start with "/api/". This can issue writes if
 * you pick POST/PUT/DELETE — it's a deliberate exploration tool; default to GET.
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!fishbowlConfigured()) {
    return NextResponse.json({ error: "Fishbowl is not configured (FISHBOWL_* env)." }, { status: 500 });
  }

  const { method, path, body } = (await request.json().catch(() => ({}))) as {
    method?: string;
    path?: string;
    body?: unknown;
  };

  const p = (path ?? "").trim();
  if (!p.startsWith("/api/")) {
    return NextResponse.json({ error: 'path must start with "/api/"' }, { status: 400 });
  }

  try {
    const result = await fishbowlRequest(method ?? "GET", p, body);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
