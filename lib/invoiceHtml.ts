import type { InvoiceModel } from "./invoice";

/**
 * Render an InvoiceModel to a complete, print-ready HTML document that mirrors
 * FMG's Fishbowl sales-order print. Opened in its own window by the portal's
 * "Download invoice" button, which then triggers the browser's Save-as-PDF — so
 * this is a standalone document (full <html>), not a fragment, and carries its
 * own print CSS. Pure string building; safe on client or server.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const lines = (arr: string[]) => arr.map((l) => esc(l)).join("<br>");

export function renderInvoiceHtml(inv: InvoiceModel): string {
  const infoCells: [string, string][] = [
    ["Sales Rep", inv.info.salesRep],
    ["Payment Terms", inv.info.paymentTerms],
    ["FOB Point", inv.info.fobPoint],
    ["Carrier", inv.info.carrier],
    ["Ship Service", inv.info.shipService],
    ["Date Scheduled", inv.info.dateScheduled],
  ];

  const itemRows = inv.lines
    .map((l) => {
      const priced = l.unitPrice !== null;
      return `<tr>
        <td class="c-num">${l.num || ""}</td>
        <td class="c-type">${esc(l.type)}</td>
        <td class="c-item">${esc(l.itemNumber)}</td>
        <td class="c-desc">${esc(l.description)}</td>
        <td class="c-unit">${priced ? esc(l.unitPrice!) : ""}</td>
        <td class="c-qty">${priced ? `${esc(l.qty!)} ${esc(l.uom!)}` : ""}</td>
        <td class="c-total">${esc(l.total)}</td>
      </tr>`;
    })
    .join("");

  const trackingRow = inv.tracking.length
    ? `<tr class="tracking"><td></td><td></td><td></td><td colspan="4">Tracking: ${inv.tracking
        .map((t) =>
          t.url
            ? `<a href="${esc(t.url)}" target="_blank" rel="noreferrer">${esc(t.num)}</a>`
            : esc(t.num),
        )
        .join(", ")}</td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Invoice ${esc(inv.orderNum)} — ${esc(inv.company.name)}</title>
<style>
  :root { --ink:#111; --rule:#999; --muted:#555; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font: 10pt/1.35 Arial, Helvetica, sans-serif; color: var(--ink); background: #f3f4f6; }

  .toolbar {
    position: sticky; top: 0; display: flex; gap: 10px; justify-content: flex-end;
    padding: 10px 16px; background: #fff; border-bottom: 1px solid #e5e7eb;
  }
  .toolbar button {
    font: 600 13px Arial, sans-serif; padding: 8px 16px; border: 0; border-radius: 6px;
    background: #111; color: #fff; cursor: pointer;
  }
  .toolbar button:hover { background: #333; }

  .sheet {
    width: 8.5in; min-height: 11in; margin: 16px auto; padding: 0.5in;
    background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.12);
  }

  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .head .co-name { font-size: 14pt; font-weight: bold; margin-bottom: 4px; }
  .head .co-addr { color: var(--muted); }
  .head .right { text-align: right; }
  .head .title { font-size: 20pt; font-weight: bold; letter-spacing: .5px; margin-bottom: 8px; }
  table.meta { border-collapse: collapse; margin-left: auto; }
  table.meta th, table.meta td { border: 1px solid var(--rule); padding: 3px 10px; font-size: 9.5pt; }
  table.meta th { background: #f2f2f2; font-weight: bold; text-align: center; }
  table.meta td { text-align: center; }

  .parties { display: flex; gap: 24px; margin-top: 22px; }
  .parties .col { flex: 1; }
  .parties .label { font-weight: bold; margin-bottom: 3px; }
  .parties .sub { margin-top: 8px; }

  table.info { width: 100%; border-collapse: collapse; margin-top: 18px; }
  table.info th, table.info td { border: 1px solid var(--rule); padding: 4px 6px; font-size: 9pt; text-align: center; }
  table.info th { background: #f2f2f2; font-weight: bold; }

  table.items { width: 100%; border-collapse: collapse; margin-top: 16px; }
  table.items th { background: #f2f2f2; border: 1px solid var(--rule); padding: 4px 6px; font-size: 9pt; }
  table.items td { border: 1px solid var(--rule); padding: 4px 6px; vertical-align: top; }
  .c-num, .c-type, .c-item, .c-unit, .c-qty, .c-total { white-space: nowrap; }
  .c-num { text-align: center; width: 26px; }
  .c-type { width: 62px; }
  .c-item { width: 84px; }
  .c-unit, .c-total { text-align: right; }
  .c-qty { text-align: center; width: 52px; }
  th.c-unit, th.c-qty, th.c-total { text-align: center; }
  tr.tracking td { color: var(--muted); font-size: 9pt; border-top: 0; }
  tr.tracking a { color: #1d4ed8; text-decoration: underline; }

  .totals { width: 300px; margin-left: auto; margin-top: 10px; border-collapse: collapse; }
  .totals td { padding: 3px 6px; font-size: 10pt; }
  .totals .lbl { text-align: right; color: var(--muted); }
  .totals .val { text-align: right; width: 110px; }
  .totals .grand td { border-top: 1.5px solid var(--ink); font-weight: bold; }

  .footer { margin-top: 42px; }
  .footer .sign { font-size: 10pt; }
  .footer .gen { display: flex; justify-content: space-between; margin-top: 40px; color: var(--muted); font-size: 8.5pt; }

  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
    @page { size: letter; margin: 0.5in; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="sheet">
    <div class="head">
      <div class="left">
        <div class="co-name">${esc(inv.company.name)}</div>
        <div class="co-addr">
          ${lines(inv.company.address)}<br>
          Phone: ${esc(inv.company.phone)}<br>
          Email: ${esc(inv.company.email)}
        </div>
      </div>
      <div class="right">
        <div class="title">${esc(inv.title)}</div>
        <table class="meta">
          <tr><th>Order #</th><th>Date</th></tr>
          <tr><td>${esc(inv.orderNum)}</td><td>${esc(inv.date)}</td></tr>
        </table>
      </div>
    </div>

    <div class="parties">
      <div class="col">
        <div class="label">Bill To:</div>
        ${lines(inv.billTo)}
        <div class="sub"><strong>Customer:</strong> ${esc(inv.customer)}</div>
      </div>
      <div class="col">
        <div class="label">Ship To:</div>
        ${lines(inv.shipTo)}
        ${inv.contact ? `<div class="sub"><strong>Contact:</strong> ${esc(inv.contact)}</div>` : ""}
        ${inv.poNumber ? `<div><strong>PO Number:</strong> ${esc(inv.poNumber)}</div>` : ""}
      </div>
    </div>

    <table class="info">
      <tr>${infoCells.map(([h]) => `<th>${esc(h)}</th>`).join("")}</tr>
      <tr>${infoCells.map(([, v]) => `<td>${esc(v) || "&nbsp;"}</td>`).join("")}</tr>
    </table>

    <table class="items">
      <thead>
        <tr>
          <th class="c-num">#</th>
          <th class="c-type">Type</th>
          <th class="c-item">Number</th>
          <th>Description</th>
          <th class="c-unit">Unit Price</th>
          <th class="c-qty">Ordered</th>
          <th class="c-total">Total Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        ${trackingRow}
      </tbody>
    </table>

    <table class="totals">
      <tr><td class="lbl">Subtotal:</td><td class="val">${esc(inv.subtotal)}</td></tr>
      <tr><td class="lbl">Sales Tax:</td><td class="val">${esc(inv.tax)}</td></tr>
      <tr class="grand"><td class="lbl">Total:</td><td class="val">${esc(inv.total)}</td></tr>
    </table>

    <div class="footer">
      <div class="sign">Approval: _______________________________&nbsp;&nbsp;&nbsp;&nbsp;Date: _____________</div>
      <div class="gen">
        <span>${esc(inv.generatedAt)}</span>
        <span>Page 1 of 1</span>
      </div>
    </div>
  </div>

  <script>window.addEventListener("load", function(){ setTimeout(function(){ window.print(); }, 300); });</script>
</body>
</html>`;
}
