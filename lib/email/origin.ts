/**
 * Resolve the public origin of an incoming request.
 *
 * Behind Vercel's proxy, `new URL(request.url).origin` is the internal address
 * (often http://localhost:PORT), not the public hostname the browser used.
 * Vercel populates X-Forwarded-Proto and X-Forwarded-Host with the real values,
 * so we prefer those. Falls back to the Host header, then to the URL itself
 * (useful for local dev where there's no proxy).
 */
/**
 * The app's canonical public origin, for URLs minted into outbound email
 * (unsubscribe links, tracking). Env-derived — NOT request-derived — so a test
 * sent from a dev server still links to the real site, not localhost.
 */
export function appOrigin(): string {
  return (
    (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") ||
    "https://www.fragrance-marketing-group.com"
  );
}

export function publicOriginFromRequest(request: Request): string {
  const xfProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const xfHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const url = new URL(request.url);
  const proto = xfProto ?? url.protocol.replace(/:$/, "");
  const host = xfHost ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}
