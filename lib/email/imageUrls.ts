/**
 * Serve email images from our own domain.
 *
 * Receivers — Gmail most notably — weigh whether an email's image URLs line up
 * with the domain that sent it. Ours live in a public Supabase bucket, so their
 * raw URLs point at `<project>.supabase.co`, which aligns with nothing we own
 * and reads as a third-party host.
 *
 * The fix is a proxy at `/email-assets/<path>` on the app domain
 * (app.fragrancemarketinggroup.com — same registrable domain as the
 * send.* subdomain we mail from) plus a rewrite pass at SEND time.
 *
 * Rewriting on the way out rather than migrating stored data is deliberate:
 * absolute Supabase URLs are baked into every saved template's blocks JSON,
 * every uploaded raw-HTML template, and every AI-generated block. A send-time
 * pass fixes all of them at once, keeps working for anything written in the
 * future by a path we forgot, and leaves the in-app editor and previews
 * pointing at canonical storage URLs that work even if the proxy is down.
 *
 * This runs in the two transports (`sendEmail`, `sendResendEmail`) rather than
 * in `dispatchEmail`, because five callers — the digest and Point B crons, rep
 * 1:1 mail, the reps blast, and storefront order notifications — reach the
 * Graph transport directly without passing through dispatch.
 */

/** The public bucket holding every image an email can reference. */
export const EMAIL_ASSET_BUCKET = "email-assets";

/** Path prefix of the proxy route that fronts that bucket. */
export const EMAIL_ASSET_PATH = "/email-assets";

/** Where these images are reachable from the public internet. */
const CANONICAL_ORIGIN = "https://app.fragrancemarketinggroup.com";

/** Hosts that exist only on the machine that rendered the email. */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|.*\.local)$/i;

/**
 * The origin to point image URLs at.
 *
 * Unlike unsubscribe and tracking links — which `origin.ts` also derives from
 * NEXT_PUBLIC_APP_URL — an image URL is fetched by the RECIPIENT's mail client,
 * which is never on our network. A dev machine's `.env.local` sets
 * NEXT_PUBLIC_APP_URL to http://localhost:3000, so honouring it blindly would
 * put unreachable URLs in any test send and make the images look broken.
 * A local origin therefore falls back to the canonical public one.
 */
function imageOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (!configured) return CANONICAL_ORIGIN;
  try {
    const { hostname } = new URL(configured);
    if (LOCAL_HOST.test(hostname)) return CANONICAL_ORIGIN;
  } catch {
    return CANONICAL_ORIGIN;
  }
  return configured;
}

/**
 * The Supabase public-object prefix for the email bucket, e.g.
 * `https://abc.supabase.co/storage/v1/object/public/email-assets/`.
 * Null when Supabase isn't configured, which makes every rewrite a no-op.
 */
export function storagePublicPrefix(): string | null {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/${EMAIL_ASSET_BUCKET}/`;
}

/**
 * One storage URL → its same-domain equivalent. Anything else (an absolute URL
 * on another host, a relative path, a data: URI) is returned untouched, so this
 * is safe to call on every URL in a template.
 */
export function hostedImageUrl(url: string, origin: string = imageOrigin()): string {
  const prefix = storagePublicPrefix();
  if (!prefix || !url.startsWith(prefix)) return url;
  return `${origin}${EMAIL_ASSET_PATH}/${url.slice(prefix.length)}`;
}

/**
 * Rewrite every storage URL in a block of email HTML.
 *
 * Deliberately a plain string substitution on the URL prefix rather than an
 * attribute-aware parse: the same URL shows up in `src`, in `background`, in
 * `background-image:url(...)`, and inside Outlook's VML `<v:fill src>`. Keying
 * on the URL itself covers all four — and any fifth shape a future renderer
 * invents — with no regex escaping to get wrong.
 */
export function rewriteEmailImageUrls(html: string, origin: string = imageOrigin()): string {
  const prefix = storagePublicPrefix();
  if (!prefix || !html) return html;
  return html.split(prefix).join(`${origin}${EMAIL_ASSET_PATH}/`);
}
