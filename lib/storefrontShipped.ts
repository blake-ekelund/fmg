/**
 * Tell a storefront that one of its orders now has tracking, so it emails the
 * customer their "your order shipped" message. The storefront side is
 * src/app/api/orders/shipped — it claims the send atomically by stamping
 * shipped_email_at, so calling this repeatedly (tracking cron + manual entry
 * + a future DB webhook) can never double-email anyone.
 *
 * Best-effort by design: a down storefront or missing secret must never block
 * recording the tracking number. Sassy only for now — NI's storefront has no
 * shipped endpoint yet (it isn't operable).
 */

const STORE_BASES: Record<string, string | undefined> = {
  sassy: process.env.SASSY_SITE_URL ?? "https://sassyandco.com",
  ni: process.env.NI_SITE_URL, // unset until the NI storefront is live
};

export async function notifyStorefrontShipped(
  store: string | null | undefined,
  orderNumber: number | string | null | undefined,
): Promise<boolean> {
  const secret = process.env.STOREFRONT_NOTIFY_SECRET;
  const base = store ? STORE_BASES[store] : undefined;
  if (!secret || !base || !orderNumber) return false;

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/orders/shipped`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number: orderNumber }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(
        `[shipped-notify] ${store} rejected order ${orderNumber} (${res.status})`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[shipped-notify] ${store} order ${orderNumber} failed`, err);
    return false;
  }
}
