import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { heroCreditFor } from "@/lib/blog/heroCredit";

export const runtime = "nodejs";

/**
 * GET /api/marketing/blog/hero-credit?url=<hero url>
 *
 * The "Cover photo by … on Unsplash" credit a save would add for this hero,
 * so the editor's previews match the saved body. { credit: HeroCredit | null }.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(request.url).searchParams.get("url") ?? "";
  return NextResponse.json({ credit: await heroCreditFor(url) });
}
