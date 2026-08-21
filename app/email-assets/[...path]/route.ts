import { EMAIL_ASSET_BUCKET } from "@/lib/email/imageUrls";

export const runtime = "nodejs";

/**
 * GET /email-assets/<path>
 *
 * Same-domain front door for the public `email-assets` bucket, so outbound mail
 * can reference images on app.fragrancemarketinggroup.com instead of
 * <project>.supabase.co. See `lib/email/imageUrls.ts` for why that matters.
 *
 * Public by design — it fronts an already-public bucket, and an image in an
 * email is fetched by the recipient's mail client, which has no session. It is
 * NOT an open proxy: the upstream URL is built from a fixed bucket prefix, and
 * only image responses are passed through.
 *
 * Cached hard and immutable. Uploads are written to timestamped paths
 * (`uploadEmailImage`), so a given path's bytes never change, and mail opened
 * a year from now should still render without re-fetching from storage.
 */

const ONE_YEAR_SECONDS = 31_536_000;

function notFound() {
  return new Response("Not found", { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const segments = path ?? [];

  // Next has already decoded these. Reject traversal and empty segments before
  // they can climb out of the bucket prefix.
  if (segments.length === 0) return notFound();
  if (segments.some((s) => !s || s === "." || s === "..")) return notFound();

  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return new Response("Storage is not configured.", { status: 500 });

  const upstream =
    `${base}/storage/v1/object/public/${EMAIL_ASSET_BUCKET}/` +
    segments.map(encodeURIComponent).join("/");

  let res: Response;
  try {
    res = await fetch(upstream, { cache: "no-store" });
  } catch {
    return new Response("Upstream storage is unavailable.", { status: 502 });
  }
  if (!res.ok || !res.body) return notFound();

  // Only ever hand back images — this route's whole job is <img src>.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return notFound();

  const headers = new Headers({
    "content-type": contentType,
    "cache-control": `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
    "x-content-type-options": "nosniff",
  });
  const length = res.headers.get("content-length");
  if (length) headers.set("content-length", length);

  return new Response(res.body, { status: 200, headers });
}

/** Some clients probe with HEAD before fetching; answer it the same way. */
export async function HEAD(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const res = await GET(request, ctx);
  return new Response(null, { status: res.status, headers: res.headers });
}
