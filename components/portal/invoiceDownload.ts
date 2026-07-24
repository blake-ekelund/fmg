"use client";

import { portalGet } from "@/components/portal/api";
import { renderInvoiceHtml } from "@/lib/invoiceHtml";
import type { InvoiceModel } from "@/lib/invoice";

/**
 * Open a print-ready invoice for an order in a new window and trigger the
 * browser's Save-as-PDF. Shared by every place the portal offers an invoice
 * download (orders list, order drawer, customer detail).
 *
 * The blank window is opened synchronously inside the click (before the await)
 * so it counts as a user gesture and isn't popup-blocked; it's filled once the
 * agency-scoped invoice model returns.
 */
export function downloadInvoice(num: string) {
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(
      "<p style='font:14px/1.5 Arial,sans-serif;padding:24px;color:#555'>Generating invoice…</p>",
    );
  }
  portalGet<{ invoice: InvoiceModel }>(
    `/api/portal/orders/invoice?num=${encodeURIComponent(num)}`,
  )
    .then(({ invoice }) => {
      if (!w) return;
      w.document.open();
      w.document.write(renderInvoiceHtml(invoice));
      w.document.close();
    })
    .catch((e) => {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      if (w) {
        w.document.body.innerHTML = `<p style='font:14px/1.5 Arial,sans-serif;padding:24px;color:#b91c1c'>Couldn't generate the invoice: ${msg}</p>`;
      }
    });
}
