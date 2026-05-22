import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { signState } from "@/lib/email/state";
import { buildAuthUrl } from "@/lib/email/microsoft";

export const runtime = "nodejs";

/**
 * POST /api/email/outlook/connect
 * Returns the Microsoft consent URL. Client redirects the browser to it.
 * The state token carries the portal user's id (HMAC-signed) so the callback
 * knows who is connecting without trusting a cookie.
 */
export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const state = signState(user.id);
    const url = buildAuthUrl(state);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
