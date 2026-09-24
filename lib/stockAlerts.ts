import { supabaseServer } from "@/lib/supabaseServer";
import { dispatchEmail } from "@/lib/email/dispatch";
import { resolveSender } from "@/lib/email/sender";

/**
 * Back-in-stock alerts (table: stock_alerts, filled by the NI storefront's
 * "Alert me when it's back" form). processStockAlerts() finds pending alerts
 * whose product is available again and emails each shopper once, stamping
 * notified_at so a re-run never double-sends.
 *
 * "Available" mirrors the storefront's own D2C rule (ni/src/lib/fmg/products.ts
 * availableAtHand): the manual in_stock flag isn't false AND on-hand clears
 * the 18-unit safety reserve (NULL on-hand doesn't gate). Keep the two in step.
 */

const SAFETY_STOCK = 18;

type Alert = {
  id: string;
  email: string;
  part: string;
  brand: string;
  product_name: string | null;
  product_url: string | null;
};

type StockRow = {
  part: string;
  display_name: string | null;
  in_stock: boolean | null;
  on_hand: number | null;
};

function isAvailable(row: StockRow): boolean {
  if (row.in_stock === false) return false;
  return row.on_hand == null || row.on_hand > SAFETY_STOCK;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function alertEmail(productName: string, url: string): { subject: string; html: string } {
  const name = escapeHtml(productName);
  const href = escapeHtml(url);
  return {
    subject: `It's back: ${productName}`,
    html: `<!doctype html><html><body style="margin:0;background:#FBF9F4;font-family:Helvetica,Arial,sans-serif;color:#2A3B35">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF9F4"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px">
<tr><td style="padding:36px 36px 8px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#A8895A">Natural Inspirations</td></tr>
<tr><td style="padding:0 36px;font-size:26px;line-height:1.25;font-weight:600;color:#1F3D35">Good news — it's back in stock.</td></tr>
<tr><td style="padding:16px 36px 0;font-size:15px;line-height:1.6">You asked us to let you know when <strong>${name}</strong> was available again. It's back — but popular items can sell through quickly.</td></tr>
<tr><td style="padding:28px 36px 36px"><a href="${href}" style="display:inline-block;background:#1F3D35;color:#FBF9F4;text-decoration:none;font-size:12px;letter-spacing:2.5px;text-transform:uppercase;padding:14px 28px;border-radius:999px">Shop it now</a></td></tr>
</table>
<p style="max-width:520px;margin:18px auto 0;font-size:11px;line-height:1.6;color:#5E7068">You're receiving this one-time note because you requested a back-in-stock alert on naturalinspirations.com.</p>
</td></tr></table></body></html>`,
  };
}

export type StockAlertRunResult = {
  pending: number;
  available: number;
  sent: number;
  failed: number;
};

export async function processStockAlerts(): Promise<StockAlertRunResult> {
  const { data: alerts, error } = await supabaseServer
    .from("stock_alerts")
    .select("id,email,part,brand,product_name,product_url")
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(`stock_alerts: ${error.message}`);
  const pending = (alerts ?? []) as Alert[];
  if (pending.length === 0) return { pending: 0, available: 0, sent: 0, failed: 0 };

  const parts = [...new Set(pending.map((a) => a.part))];
  const { data: stock, error: stockErr } = await supabaseServer
    .from("storefront_products")
    .select("part,display_name,in_stock,on_hand")
    .in("part", parts);
  if (stockErr) throw new Error(`storefront_products: ${stockErr.message}`);
  const byPart = new Map((stock ?? []).map((r) => [r.part, r as StockRow]));

  const ready = pending.filter((a) => {
    const row = byPart.get(a.part);
    return row ? isAvailable(row) : false;
  });

  const sender = resolveSender({ brand: "ni" });
  let sent = 0;
  let failed = 0;
  for (const a of ready) {
    // Claim first (only if still pending) so overlapping runs can't both send.
    const { data: claimed } = await supabaseServer
      .from("stock_alerts")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", a.id)
      .is("notified_at", null)
      .select("id");
    if (!claimed?.length) continue;

    const row = byPart.get(a.part);
    const productName = a.product_name || row?.display_name || "Your product";
    const url = a.product_url || `https://naturalinspirations.com/products/${a.part}`;
    const { subject, html } = alertEmail(productName, url);
    try {
      await dispatchEmail({
        input: { subject, bodyHtml: html, to: [{ address: a.email }] },
        sender,
      });
      sent++;
    } catch (e) {
      // Release the claim so the next run retries.
      await supabaseServer.from("stock_alerts").update({ notified_at: null }).eq("id", a.id);
      failed++;
      console.error("[stock-alerts] send failed", a.id, e);
    }
  }

  return { pending: pending.length, available: ready.length, sent, failed };
}
