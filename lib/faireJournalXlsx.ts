import * as XLSX from "xlsx";
import { jeTotals, type FaireJournalEntry } from "./faireJournal";
import { FAIRE_FLOW_COLUMNS, faireFlowValue } from "./fairePayouts";

/**
 * A Faire journal entry as an .xlsx:
 *  - "Journal Entry": the single entry — number, date, memo, then one line per
 *    account with debit/credit and balanced totals.
 *  - "Detail": every order behind it (payout day, order, retailer, each
 *    payout column, net) with a total row that equals the entry.
 * Amounts are real numbers (2-dp format), so the sheet adds up in Excel.
 */

const MONEY = "#,##0.00";

function setMoney(ws: XLSX.WorkSheet, fromRow: number, toRow: number, cols: number[]) {
  for (let r = fromRow; r <= toRow; r++)
    for (const c of cols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") cell.z = MONEY;
    }
}

export function faireJournalWorkbook(je: FaireJournalEntry): XLSX.WorkBook {
  const totals = jeTotals(je.lines);
  const head: (string | number)[][] = [
    ["Fragrance Marketing Group — Faire journal entry"],
    [],
    ["Entry", je.number],
    ["Date", je.date],
    ["Memo", je.memo],
    ["Created", `${je.createdAt.slice(0, 10)}${je.createdBy ? ` by ${je.createdBy}` : ""}`],
    ["Payouts", je.payoutDates.join(", ")],
    [],
    ["Account #", "Account", "Description", "Debit", "Credit"],
  ];
  const firstLine = head.length;
  const lines = je.lines.map((l) => [l.account.number ?? "", l.account.name, l.description, l.debit || "", l.credit || ""]);
  const sheet1 = XLSX.utils.aoa_to_sheet([...head, ...lines, ["", "Total", "", totals.debit, totals.credit]]);
  setMoney(sheet1, firstLine, firstLine + lines.length, [3, 4]);
  sheet1["!cols"] = [{ wch: 11 }, { wch: 44 }, { wch: 30 }, { wch: 14 }, { wch: 14 }];

  const detailHead = ["Payout date", "Order", "Retailer", "Paid at", ...FAIRE_FLOW_COLUMNS.map((c) => c.label), "Net payout"];
  const orders = je.payouts.flatMap((p) =>
    p.orders.map((o) => [p.date, o.displayId, o.retailer, o.paidAt, ...FAIRE_FLOW_COLUMNS.map((c) => faireFlowValue(o.columns, c.key)), o.net]),
  );
  const sheet2 = XLSX.utils.aoa_to_sheet([
    detailHead,
    ...orders,
    ["Total", "", "", "", ...FAIRE_FLOW_COLUMNS.map((c) => faireFlowValue(je.columns, c.key)), je.net],
  ]);
  const moneyCols = detailHead.map((_, i) => i).filter((i) => i >= 4);
  setMoney(sheet2, 1, orders.length + 1, moneyCols);
  sheet2["!cols"] = [{ wch: 12 }, { wch: 13 }, { wch: 34 }, { wch: 22 }, ...moneyCols.map(() => ({ wch: 14 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet1, "Journal Entry");
  XLSX.utils.book_append_sheet(wb, sheet2, "Detail");
  return wb;
}

/** Download the entry's .xlsx in the browser. */
export function downloadFaireJournalXlsx(je: FaireJournalEntry) {
  XLSX.writeFile(faireJournalWorkbook(je), `${je.number}_${je.date}.xlsx`);
}
