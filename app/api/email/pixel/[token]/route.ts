import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";
// Aggressively skip framework caching for the pixel — every fetch is a signal.
export const dynamic = "force-dynamic";

// 1x1 transparent GIF (43 bytes).
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function gifResponse(): NextResponse {
  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(TRANSPARENT_GIF.length),
      // Make sure no email client caches the pixel so each open counts.
      "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      // Don't leak the embedding page if a client decides to send a referrer.
      "Referrer-Policy": "no-referrer",
    },
  });
}

/**
 * GET /api/email/pixel/<message_id>.gif
 *
 * Logs an open event then serves a 1x1 transparent GIF. We never throw —
 * the recipient's email client doesn't care, and we don't want broken
 * images in their inbox to draw attention.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    // Accept "<uuid>.gif" or just "<uuid>" — strip the extension.
    const messageId = token.replace(/\.gif$/i, "");
    if (!/^[0-9a-f-]{36}$/i.test(messageId)) {
      return gifResponse();
    }

    // Best-effort insert. We don't need to await long; fire-and-await briefly.
    const userAgent = request.headers.get("user-agent");
    const xff = request.headers.get("x-forwarded-for");
    const ip = xff?.split(",")[0]?.trim() || null;

    await supabaseServer
      .from("email_message_opens")
      .insert({
        message_id: messageId,
        user_agent: userAgent,
        ip,
      });
  } catch {
    // Swallow: never break the pixel response.
  }
  return gifResponse();
}
