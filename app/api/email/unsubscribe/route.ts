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
 *
 * The reason is OPTIONAL everywhere: opting out must stay one action, so the
 * confirm page offers the choices alongside the button, and the success page
 * offers one more (skippable) chance. The one-click header POST from mailbox
 * providers carries no reason and never sees these pages.
 *
 * Tone: elegant, spa-grade, lightly warm — never guilt-trippy, and the button
 * always says plainly what it does.
 */

/**
 * Choices offered on the page. `value` is what lands in the `reason` column —
 * stable, boring, groupable. `label` is what the person sees.
 */
const REASONS: { value: string; label: string }[] = [
  { value: "Too many emails", label: "A few too many emails" },
  { value: "Content isn't relevant to me", label: "The content wasn't for me" },
  { value: "I no longer buy these products", label: "I no longer shop these products" },
  { value: "I never signed up for this", label: "I never signed up for this" },
];

/* Custom inline icons — line-drawn, on-brand (deep green + gold), no emoji. */

/** Botanical leaf — the page mark. */
const LEAF_ICON = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a5632" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M20 4C12 4 6 9 6 17c0 1.5.3 2.6.3 2.6S7.4 20 9 20c8 0 13-6 11-16z"/>
  <path d="M6.5 19.5C9 14 13 9.5 18 6.5"/>
</svg>`;

/** Thin gold check — the done state. */
const CHECK_ICON = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#d4a853" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 12.5l5 5L20 6.5"/>
</svg>`;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(body: string, status = 200, icon = LEAF_ICON) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Email preferences · Fragrance Marketing Group</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#f7f5f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
       color:#22302a;padding:24px}
  .card{background:#fffdf9;border:1px solid #e9e2d4;border-radius:18px;padding:40px 36px;
        max-width:440px;width:100%;box-shadow:0 2px 14px rgba(34,48,42,.06);text-align:center}
  .mark{width:54px;height:54px;border-radius:50%;background:#f7f5f0;border:1px solid #e6dcc3;
        display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
  .wordmark{font-size:10px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;
            color:#a8894e;margin:0 0 10px}
  h1{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:23px;
     letter-spacing:.2px;color:#1f3029;margin:0 0 10px}
  p{font-size:13.5px;line-height:1.7;color:#5f6d64;margin:0 0 22px}
  .email{color:#1f3029;font-weight:600}
  button{background:#1a5632;color:#fffdf9;border:0;border-radius:9px;padding:12px 20px;
         font-size:13px;font-weight:600;letter-spacing:.4px;cursor:pointer;width:100%}
  button:hover{background:#14472a}
  .note{font-size:11.5px;color:#98a29a;margin:18px 0 0;line-height:1.6}
  .reasons{text-align:left;margin:0 0 20px;padding-top:18px;border-top:1px solid #efe9dd}
  .rlabel{font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;
          color:#7d8a80;margin-bottom:8px}
  .reason{display:flex;gap:9px;align-items:center;font-size:13px;color:#22302a;
          padding:5px 0;cursor:pointer}
  .reason input{accent-color:#1a5632;margin:0}
  .rtext{width:100%;box-sizing:border-box;border:1px solid #e5decf;border-radius:8px;
         background:#fffdf9;padding:10px 11px;font-size:13px;margin-top:9px;font-family:inherit;
         color:#22302a}
  .rtext::placeholder{color:#a9b1a9}
  .rtext:focus{outline:none;border-color:#1a5632}
</style></head>
<body><div class="card"><div class="mark">${icon}</div>
<div class="wordmark">Fragrance Marketing Group</div>${body}</div></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** The optional "why" fieldset shared by the confirm and follow-up forms. */
function reasonFields(prompt: string): string {
  const radios = REASONS.map(
    (r) =>
      `<label class="reason"><input type="radio" name="reason" value="${esc(r.value)}"><span>${esc(r.label)}</span></label>`,
  ).join("\n       ");
  return `<div class="reasons">
       <div class="rlabel">${esc(prompt)}</div>
       ${radios}
       <label class="reason"><input type="radio" name="reason" value="Other"><span>Something else</span></label>
       <input class="rtext" type="text" name="reason_text" maxlength="300" placeholder="In your own words (optional)">
     </div>`;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  const payload = token ? readUnsubscribeToken(token) : null;

  if (!payload) {
    return page(
      `<h1>This link isn't quite right</h1>
       <p>It may have expired. Reply to any of our emails and we'll take care
          of it personally.</p>`,
      400,
    );
  }

  if (await isSuppressed(payload.email)) {
    return page(
      `<h1>You're already off the list</h1>
       <p><span class="email">${esc(payload.email)}</span> won't receive further
          marketing email from us — a promise we only needed to make once.</p>`,
    );
  }

  return page(
    `<h1>Leaving so soon?</h1>
     <p>One click and we'll stop sending marketing email to
        <span class="email">${esc(payload.email)}</span>. Conversations you
        start with us will always receive a reply.</p>
     <form method="POST">
       <input type="hidden" name="t" value="${esc(token ?? "")}" />
       ${reasonFields("Before you go — may we ask why?")}
       <button type="submit">Unsubscribe me</button>
     </form>
     <p class="note">Here by mistake? Simply close this page — nothing happens
        until you choose.</p>`,
  );
}

export async function POST(request: Request) {
  // Token and reason may arrive from the confirmation form, the follow-up
  // feedback form, or (token only) the one-click header's query string.
  let token = new URL(request.url).searchParams.get("t");
  let reason: string | undefined;
  let isFollowup = false;
  try {
    const form = await request.formData();
    token = ((form.get("t") as string | null) ?? token) || token;
    isFollowup = form.get("followup") === "1";
    const picked = ((form.get("reason") as string | null) ?? "").trim();
    const text = ((form.get("reason_text") as string | null) ?? "").trim().slice(0, 300);
    // Free text refines "Other" (or stands alone); a picked label is stored verbatim.
    const combined = picked === "Other" ? text || "Other" : [picked, text].filter(Boolean).join(" — ");
    if (combined) reason = combined.slice(0, 300);
  } catch {
    /* not a form post (one-click header) — token from the query string */
  }

  const payload = token ? readUnsubscribeToken(token) : null;
  if (!payload) {
    return page(
      `<h1>This link isn't quite right</h1>
       <p>It may have expired. Reply to any of our emails and we'll take care
          of it personally.</p>`,
      400,
    );
  }

  const res = await recordUnsubscribe(payload, "link", reason);
  if (!res.ok) {
    return page(
      `<h1>Something went wrong</h1>
       <p>We couldn't process that just now. Reply to any of our emails and
          we'll take care of it personally.</p>`,
      500,
    );
  }

  // Already gave a reason (or explicitly skipped the follow-up) → done.
  if (reason || isFollowup) {
    return page(
      `<h1>Consider it done</h1>
       <p><span class="email">${esc(payload.email)}</span> has been removed from
          our marketing list, and anything in progress has been stopped. Should
          you miss us, the door is always open.${
            reason ? " Thank you for your candor — it helps us do better." : ""
          }</p>`,
      200,
      CHECK_ICON,
    );
  }

  // Unsubscribed without a reason — one more (optional) chance to leave one.
  // Submitting posts back here; recordUnsubscribe is idempotent and only
  // updates `reason` when one is actually provided.
  return page(
    `<h1>Consider it done</h1>
     <p><span class="email">${esc(payload.email)}</span> has been removed from
        our marketing list, and anything in progress has been stopped. Should
        you miss us, the door is always open.</p>
     <form method="POST">
       <input type="hidden" name="t" value="${esc(token ?? "")}" />
       <input type="hidden" name="followup" value="1" />
       ${reasonFields("Any parting words?")}
       <button type="submit">Share feedback</button>
     </form>`,
    200,
    CHECK_ICON,
  );
}
