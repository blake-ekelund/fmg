import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { signState } from "@/lib/email/state";
import { buildAuthUrl } from "@/lib/email/microsoft";
import { publicOriginFromRequest } from "@/lib/email/origin";

export const runtime = "nodejs";

/**
 * POST /api/email/outlook/connect
 * Returns the Microsoft consent URL. Client redirects the browser to it.
 * The state token carries the portal user's id (HMAC-signed) so the callback
 * knows who is connecting without trusting a cookie.
 *
 * The redirect_uri is derived from the request's public origin (via
 * X-Forwarded-* headers behind Vercel) so MS sends the user back to the same
 * host they started from — no NEXT_PUBLIC_APP_URL needed.
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const state = signState(user.id);
    const redirectUri = `${publicOriginFromRequest(request)}/api/auth/microsoft/callback`;
    const url = buildAuthUrl(state, redirectUri);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
