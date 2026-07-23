import { NextResponse } from "next/server";
import {
  readUnsubscribeToken,
  recordUnsubscribe,
  isSuppressed,
} from "@/lib/email/unsubscribe";

export const runtime = "nodejs";

/**
 * Public — no auth. Recipients click this from their inbox; they have no
 * account. The token is encrypted, so the only way to opt someone out is to
 * hold a link we actually mailed them.
 *
 * GET shows a confirmation page and does NOT unsubscribe. Corporate mail
 * scanners and link-preview bots fetch every URL in a message, so a GET that
 * mutated would silently opt out recipients who never clicked anything. The
 * POST behind the button is what records it.
 */

function page(body: string, status = 200) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Email preferences · Fragrance Marketing Group</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#f7f9fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
       color:#0f1c26;padding:24px}
  .card{background:#fff;border:1px solid #e3e9ef;border-radius:16px;padding:32px;max-width:420px;
        width:100%;box-shadow:0 1px 3px rgba(15,28,38,.06);text-align:center}
  .mark{width:44px;height:44px;border-radius:12px;background:#1b3c53;color:#fff;display:flex;
        align-items:center;justify-content:center;font-weight:700;margin:0 auto 18px;font-size:17px}
  h1{font-size:17px;margin:0 0 8px}
  p{font-size:13px;line-height:1.6;color:#6b7b88;margin:0 0 20px}
  .email{color:#0f1c26;font-weight:600}
  button{background:#1b3c53;color:#fff;border:0;border-radius:10px;padding:11px 20px;
         font-size:13px;font-weight:600;cursor:pointer;width:100%}
  button:hover{background:#16354a}
  .note{font-size:11px;color:#94a2ad;margin:16px 0 0}
</style></head>
<body><div class="card"><div class="mark">F</div>${body}</div></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  const payload = token ? readUnsubscribeToken(token) : null;

  if (!payload) {
    return page(
      `<h1>Link not recognised</h1>
       <p>This unsubscribe link is invalid or has expired. Reply to any of our
          emails and we'll remove you manually.</p>`,
      400,
    );
  }

  if (await isSuppressed(payload.email)) {
    return page(
      `<h1>You're already unsubscribed</h1>
       <p><span class="email">${payload.email}</span> won't receive further
          marketing email from us.</p>`,
    );
  }

  return page(
    `<h1>Unsubscribe from marketing email?</h1>
     <p>We'll stop sending marketing email to
        <span class="email">${payload.email}</span>. You'll still receive
        replies to conversations you start with us.</p>
     <form method="POST">
       <input type="hidden" name="t" value="${token}" />
       <button type="submit">Unsubscribe me</button>
     </form>
     <p class="note">Clicked by mistake? Just close this page.</p>`,
  );
}

export async function POST(request: Request) {
  // Token may arrive from the confirmation form or the query string.
  let token = new URL(request.url).searchParams.get("t");
  if (!token) {
    try {
      const form = await request.formData();
      token = (form.get("t") as string | null) ?? null;
    } catch {
      /* not a form post — fall through to the invalid-token page */
    }
  }

  const payload = token ? readUnsubscribeToken(token) : null;
  if (!payload) {
    return page(
      `<h1>Link not recognised</h1>
       <p>This unsubscribe link is invalid or has expired.</p>`,
      400,
    );
  }

  const res = await recordUnsubscribe(payload, "link");
  if (!res.ok) {
    return page(
      `<h1>Something went wrong</h1>
       <p>We couldn't process that just now. Please reply to any of our emails
          and we'll remove you manually.</p>`,
      500,
    );
  }

  return page(
    `<h1>You're unsubscribed</h1>
     <p><span class="email">${payload.email}</span> has been removed from our
        marketing email. Any sequences currently in progress have been stopped.</p>`,
  );
}
