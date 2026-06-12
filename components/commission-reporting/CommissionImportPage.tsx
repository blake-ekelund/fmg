"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  Upload,
  FileText,
  ArrowLeft,
  Check,
  AlertCircle,
  Trash2,
  Clipboard,
  Calendar,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

/* ════════════════════════════════════════════════════════════
   COMMISSION IMPORT
   Bulk-mark invoices as "commission paid to rep".
   Accepts CSV with at minimum an order_num column. Extra columns are ignored.
   ════════════════════════════════════════════════════════════ */

type ParsedRow = {
  order_num: string;
  paid_date: string | null;
  notes: string | null;
};

type MatchResult = {
  matched: ParsedRow[];
  unmatched: ParsedRow[];
};

const ORDER_NUM_ALIASES = [
  "order_num",
  "order number",
  "order #",
  "order#",
  "invoice",
  "invoice #",
  "invoice#",
  "invoice_num",
  "invoice number",
  "num",
  "no",
];

const PAID_DATE_ALIASES = [
  "paid_date",
  "paid date",
  "date paid",
  "paid on",
  "date",
];

const NOTES_ALIASES = ["notes", "note", "memo", "comment"];

const STATUS_ALIASES = ["status"];

/* ---------- Excel helpers ---------- */

// Excel serial date → YYYY-MM-DD (epoch: 1899-12-30, accounts for the 1900 leap bug)
function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Accepts a cell value (Excel date serial, JS Date, or string) and returns ISO date string
function coerceIsoDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return excelSerialToIso(v);
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  // Try YYYY-MM-DD first
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try M/D/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Fallback: let Date try
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function coerceString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

/* ---------- CSV parser (simple, handles quoted values) ---------- */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        if (row.some((v) => v.length > 0)) rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((v) => v.length > 0)) rows.push(row);
  }
  return rows;
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

/* ---------- Grid → ParsedRow[] ----------
   Accepts a 2D grid (from either CSV or xlsx) where grid[0] is the header row.
   Cell values may be strings, numbers (including Excel date serials), or Dates. */

type ExtractResult = {
  rows: ParsedRow[];
  orderColFound: boolean;
  headers: string[];
  skippedNonPaid: number;
};

function extractRowsFromGrid(grid: unknown[][]): ExtractResult {
  if (grid.length === 0)
    return { rows: [], orderColFound: false, headers: [], skippedNonPaid: 0 };

  const headers = grid[0].map((h) => coerceString(h));
  const orderIdx = findColumnIndex(headers, ORDER_NUM_ALIASES);
  const paidDateIdx = findColumnIndex(headers, PAID_DATE_ALIASES);
  const notesIdx = findColumnIndex(headers, NOTES_ALIASES);
  const statusIdx = findColumnIndex(headers, STATUS_ALIASES);

  // Single-column fallback: treat every row as an order number
  if (orderIdx === -1 && headers.length === 1) {
    const rows: ParsedRow[] = grid
      .map((r) => coerceString(r[0]))
      .filter((v) => v.length > 0)
      .map((v) => ({ order_num: v, paid_date: null, notes: null }));
    return { rows, orderColFound: true, headers, skippedNonPaid: 0 };
  }

  if (orderIdx === -1) {
    return { rows: [], orderColFound: false, headers, skippedNonPaid: 0 };
  }

  const rows: ParsedRow[] = [];
  let skippedNonPaid = 0;

  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    const num = coerceString(r[orderIdx]);
    if (!num) continue;

    // If there's a Status column, only keep "Paid" rows
    if (statusIdx >= 0) {
      const status = coerceString(r[statusIdx]).toLowerCase();
      if (status && status !== "paid") {
        skippedNonPaid += 1;
        continue;
      }
    }

    rows.push({
      order_num: num,
      paid_date: paidDateIdx >= 0 ? coerceIsoDate(r[paidDateIdx]) : null,
      notes: notesIdx >= 0 ? coerceString(r[notesIdx]) || null : null,
    });
  }
  return { rows, orderColFound: true, headers, skippedNonPaid };
}

function extractFromCsvText(text: string): ExtractResult {
  const grid = parseCsv(text) as unknown[][];
  return extractRowsFromGrid(grid);
}

function extractFromXlsxBuffer(buf: ArrayBuffer): ExtractResult {
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  // Use the first sheet — most QB/commission exports only have one
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  if (!firstSheet) {
    return { rows: [], orderColFound: false, headers: [], skippedNonPaid: 0 };
  }
  const grid = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    defval: "",
    raw: true,
  });
  return extractRowsFromGrid(grid);
}

/* ════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════ */

export default function CommissionImportPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [skippedNonPaid, setSkippedNonPaid] = useState(0);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [matching, setMatching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    upserted: number;
    error: string | null;
  } | null>(null);

  // Blanket "mark everything before this date as paid" option
  const [blanketEnabled, setBlanketEnabled] = useState(false);
  const [blanketBefore, setBlanketBefore] = useState<string>("2025-03-01");
  const [blanketRunning, setBlanketRunning] = useState(false);
  const [blanketResult, setBlanketResult] = useState<{
    upserted: number;
    error: string | null;
  } | null>(null);

  /* ---------- file handling ---------- */

  async function handleFile(file: File) {
    setFileName(file.name);
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm") || lower.endsWith(".xls")) {
      const buf = await file.arrayBuffer();
      loadResult(extractFromXlsxBuffer(buf));
    } else {
      const text = await file.text();
      loadResult(extractFromCsvText(text));
    }
  }

  function loadResult(result: ExtractResult) {
    setImportResult(null);
    setMatchResult(null);
    setHeaders(result.headers);
    setSkippedNonPaid(result.skippedNonPaid);
    if (!result.orderColFound) {
      setParseError(
        `Couldn't find an order number column. Expected one of: ${ORDER_NUM_ALIASES.join(
          ", "
        )}. Found: ${result.headers.join(", ") || "(no headers)"}`
      );
      setParsedRows([]);
      return;
    }
    if (result.rows.length === 0) {
      setParseError("The file parsed but contains no order numbers.");
      setParsedRows([]);
      return;
    }
    setParseError(null);
    setParsedRows(result.rows);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  function handlePaste() {
    navigator.clipboard
      .readText()
      .then((text) => {
        setFileName("pasted.csv");
        loadResult(extractFromCsvText(text));
      })
      .catch(() => {
        setParseError("Couldn't read clipboard.");
      });
  }

  function reset() {
    setFileName(null);
    setHeaders([]);
    setParseError(null);
    setParsedRows([]);
    setSkippedNonPaid(0);
    setMatchResult(null);
    setImportResult(null);
  }

  /* ---------- blanket "mark all before date as A/R received" ----------
     Flips every withheld_commissions row with ship_date < blanketBefore
     from status='withheld' → 'ar_received'. Legacy tool, typically used
     for one-shot historical backfills. */

  async function runBlanketBeforeDate() {
    if (!blanketBefore) return;
    setBlanketRunning(true);
    setBlanketResult(null);

    const { data, error } = await supabase
      .from("withheld_commissions")
      .update({
        status: "ar_received",
        ar_received_date: blanketBefore,
        notes: `Auto-marked A/R received (pre-${blanketBefore} blanket)`,
      })
      .eq("status", "withheld")
      .lt("ship_date", blanketBefore)
      .select("order_num");

    setBlanketRunning(false);
    setBlanketResult({
      upserted: (data || []).length,
      error: error ? error.message : null,
    });
  }

  /* ---------- matching against existing orders ---------- */

  const checkMatches = useCallback(async () => {
    if (parsedRows.length === 0) return;
    setMatching(true);

    // Fetch known order_nums in batches of 500 (Postgres `in` filter limit)
    const BATCH = 500;
    const known = new Set<string>();
    for (let i = 0; i < parsedRows.length; i += BATCH) {
      const batch = parsedRows.slice(i, i + BATCH).map((r) => r.order_num);
      const { data, error } = await supabase
        .from("sales_orders_current")
        .select("num")
        .in("num", batch);
      if (error) {
        console.error("match check error:", error);
        break;
      }
      (data || []).forEach((r: any) => {
        if (r.num) known.add(String(r.num));
      });
    }

    const matched: ParsedRow[] = [];
    const unmatched: ParsedRow[] = [];
    for (const r of parsedRows) {
      if (known.has(r.order_num)) matched.push(r);
      else unmatched.push(r);
    }
    setMatchResult({ matched, unmatched });
    setMatching(false);
  }, [parsedRows]);

  /* ---------- import (flip withheld → ar_received) ----------
     For each matched invoice, update the withheld_commissions row to
     status='ar_received'. Only rows still in 'withheld' state are
     flipped — already-approved or already-paid rows are left alone so
     we never accidentally re-queue something that's already closed out. */

  async function runImport() {
    if (!matchResult || matchResult.matched.length === 0) return;
    setImporting(true);
    setImportResult(null);

    const todayIso = new Date().toISOString().slice(0, 10);

    // Process in batches — Supabase doesn't support bulk UPDATE with per-row
    // values via a single call, so we update one row at a time (scoped by
    // order_num). In practice AR files are ~100-500 rows which is fine.
    let updatedCount = 0;
    let errMsg: string | null = null;
    for (const r of matchResult.matched) {
      const { data, error } = await supabase
        .from("withheld_commissions")
        .update({
          status: "ar_received",
          ar_received_date: r.paid_date || todayIso,
          notes: r.notes || null,
        })
        .eq("order_num", r.order_num)
        .eq("status", "withheld")
        .select("order_num");
      if (error) {
        errMsg = error.message;
        break;
      }
      if (data && data.length > 0) updatedCount += 1;
    }
    setImporting(false);
    setImportResult({ upserted: updatedCount, error: errMsg });
  }

  /* ---------- derived counts ---------- */

  const totalCount = parsedRows.length;
  const matchedCount = matchResult?.matched.length ?? 0;
  const unmatchedCount = matchResult?.unmatched.length ?? 0;

  const sampleOrderNums = useMemo(
    () => parsedRows.slice(0, 8).map((r) => r.order_num),
    [parsedRows]
  );

  /* ════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════ */

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1000px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/commission-reporting"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mb-3"
        >
          <ArrowLeft size={12} />
          Back to Commission Reporting
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">
          Upload A/R — Mark Receivables Received
        </h1>
        <p className="text-xs text-gray-500 mt-1 max-w-2xl">
          Upload a CSV of invoice numbers whose <strong>customer payments</strong>{" "}
          have come in. Matching orders will flip from{" "}
          <span className="text-amber-700">Withheld</span> to{" "}
          <span className="text-blue-700">A/R Received</span>, ready for owner
          approval on the Commission Reporting page.
        </p>
      </div>

      {/* Format guide */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-5">
        <div className="flex items-center gap-1.5 mb-2">
          <FileText size={13} className="text-gray-500" />
          <h2 className="text-xs font-semibold text-gray-900">
            Accepted format (CSV or XLSX)
          </h2>
        </div>
        <div className="text-[11px] text-gray-600 space-y-2">
          <p>
            The only required column is the order number. Extra columns are
            ignored. Header names are matched loosely — your existing
            commission-run spreadsheet format (<code>Invoice #</code>,{" "}
            <code>Date</code>, <code>Status</code>) works as-is. If a{" "}
            <code>Status</code> column is present, only rows where Status =
            &quot;Paid&quot; are imported.
          </p>
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 rounded-lg bg-gray-50 border border-gray-100 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                Required
              </div>
              <code className="text-[11px] text-gray-800">
                order_num
              </code>
              <div className="text-[10px] text-gray-500 mt-1">
                Also accepted: order number, order #, invoice, invoice #, num
              </div>
            </div>
            <div className="flex-1 rounded-lg bg-gray-50 border border-gray-100 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                Optional
              </div>
              <code className="text-[11px] text-gray-800">
                paid_date, notes
              </code>
              <div className="text-[10px] text-gray-500 mt-1">
                paid_date in YYYY-MM-DD. Defaults to today if omitted.
              </div>
            </div>
          </div>
          <div className="rounded-lg bg-gray-900 text-gray-100 font-mono text-[10px] p-2.5 leading-relaxed">
            order_num,paid_date,notes
            <br />
            23284,2026-03-15,
            <br />
            23279,2026-03-14,Paid via ACH
            <br />
            23291,,
          </div>
        </div>
      </div>

      {/* Upload area */}
      {!fileName && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-10 text-center"
        >
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 text-gray-500 mb-3">
            <Upload size={18} />
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">
            Drop a CSV or XLSX here
          </p>
          <p className="text-[11px] text-gray-500 mb-4">
            Excel dates are converted automatically · rows with Status ≠ Paid
            are skipped
          </p>
          <div className="flex justify-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 transition cursor-pointer">
              <Upload size={13} />
              Choose file
              <input
                type="file"
                accept=".csv,.xlsx,.xlsm,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
            <button
              onClick={handlePaste}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <Clipboard size={13} />
              Paste CSV from clipboard
            </button>
          </div>
        </div>
      )}

      {/* Blanket pre-date section */}
      <details className="rounded-xl border border-gray-200 bg-white mt-5 group">
        <summary className="px-4 py-3 flex items-center gap-2 cursor-pointer list-none hover:bg-gray-50">
          <Calendar size={13} className="text-gray-500" />
          <div className="flex-1">
            <div className="text-xs font-semibold text-gray-900">
              Blanket: mark everything before a date as A/R received
            </div>
            <div className="text-[10px] text-gray-400">
              One-shot seed for historical backfills — flips every withheld
              invoice shipped before a date into the ar_received queue
            </div>
          </div>
          <span className="text-[10px] text-gray-400 group-open:hidden">
            Click to expand
          </span>
        </summary>
        <div className="px-4 py-4 border-t border-gray-100 space-y-3">
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Every <code>withheld_commissions</code> row still in{" "}
            <code>status=&apos;withheld&apos;</code> with a ship date{" "}
            <strong>before</strong> the date below will flip to{" "}
            <code>ar_received</code>. Approved and paid rows are left alone.
            The notes field is stamped{" "}
            <code>Auto-marked A/R received (pre-[date] blanket)</code> so you
            can find them later.
          </p>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={blanketEnabled}
                onChange={(e) => setBlanketEnabled(e.target.checked)}
                className="rounded border-gray-300"
              />
              I understand this will mark every historical order paid
            </label>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[11px] text-gray-500">Before:</label>
            <input
              type="date"
              value={blanketBefore}
              onChange={(e) => setBlanketBefore(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
            />
            <button
              onClick={runBlanketBeforeDate}
              disabled={!blanketEnabled || !blanketBefore || blanketRunning}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {blanketRunning
                ? "Running…"
                : `Mark all before ${blanketBefore} as A/R received`}
            </button>
          </div>

          {blanketResult && (
            <div
              className={clsx(
                "rounded-lg border p-3 flex items-start gap-2 text-[11px]",
                blanketResult.error
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              )}
            >
              {blanketResult.error ? (
                <>
                  <AlertCircle
                    size={13}
                    className="text-red-600 mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <div className="font-semibold mb-0.5">Blanket failed</div>
                    <div>{blanketResult.error}</div>
                  </div>
                </>
              ) : (
                <>
                  <Check
                    size={13}
                    className="text-emerald-600 mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <strong>{blanketResult.upserted.toLocaleString()}</strong>{" "}
                    historical order
                    {blanketResult.upserted === 1 ? "" : "s"} flipped to A/R
                    received. Head back to Commission Reporting to approve.
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </details>

      {/* Parsed preview */}
      {fileName && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-900">
                {fileName}
              </div>
              <div className="text-[10px] text-gray-400">
                {totalCount.toLocaleString()} row
                {totalCount === 1 ? "" : "s"} parsed
                {skippedNonPaid > 0 && (
                  <>
                    {" "}
                    · {skippedNonPaid.toLocaleString()} non-paid skipped
                  </>
                )}
                {headers.length > 0 && ` · columns: ${headers.join(", ")}`}
              </div>
            </div>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-600 transition"
            >
              <Trash2 size={12} />
              Clear
            </button>
          </div>

          {parseError ? (
            <div className="p-4 flex items-start gap-2 bg-red-50 border-t border-red-100 text-xs text-red-800">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <div>{parseError}</div>
            </div>
          ) : (
            <div className="p-4">
              <div className="text-[11px] text-gray-500 mb-2">
                Sample invoice numbers:
              </div>
              <div className="flex flex-wrap gap-1">
                {sampleOrderNums.map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-mono text-gray-700"
                  >
                    {n}
                  </span>
                ))}
                {totalCount > sampleOrderNums.length && (
                  <span className="text-[11px] text-gray-400">
                    +{totalCount - sampleOrderNums.length} more
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <div className="text-[11px] text-gray-500">
                  {matchResult
                    ? `${matchedCount} matched · ${unmatchedCount} unmatched`
                    : "Check matches before importing."}
                </div>
                <button
                  onClick={checkMatches}
                  disabled={matching || totalCount === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {matching ? "Checking…" : "Check matches"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Match details */}
      {matchResult && (
        <div className="space-y-4 mb-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Check size={13} className="text-emerald-700" />
                <span className="text-[10px] font-medium text-emerald-700 uppercase tracking-wider">
                  Matched
                </span>
              </div>
              <div className="text-lg font-semibold text-emerald-900 tabular-nums">
                {matchedCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-emerald-700 mt-1">
                Will be marked Paid
              </div>
            </div>
            <div
              className={clsx(
                "rounded-xl border p-4",
                unmatchedCount > 0
                  ? "border-amber-200 bg-amber-50"
                  : "border-gray-200 bg-white"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle
                  size={13}
                  className={
                    unmatchedCount > 0 ? "text-amber-700" : "text-gray-400"
                  }
                />
                <span
                  className={clsx(
                    "text-[10px] font-medium uppercase tracking-wider",
                    unmatchedCount > 0 ? "text-amber-700" : "text-gray-400"
                  )}
                >
                  Unmatched
                </span>
              </div>
              <div
                className={clsx(
                  "text-lg font-semibold tabular-nums",
                  unmatchedCount > 0 ? "text-amber-900" : "text-gray-900"
                )}
              >
                {unmatchedCount.toLocaleString()}
              </div>
              <div
                className={clsx(
                  "text-[10px] mt-1",
                  unmatchedCount > 0 ? "text-amber-700" : "text-gray-400"
                )}
              >
                {unmatchedCount > 0
                  ? "Not found in sales orders — will be skipped"
                  : "All rows matched"}
              </div>
            </div>
          </div>

          {/* Unmatched list (truncated) */}
          {unmatchedCount > 0 && (
            <div className="rounded-xl border border-amber-200 bg-white overflow-hidden">
              <div className="px-4 py-2 border-b border-amber-100 bg-amber-50/50">
                <div className="text-[11px] font-semibold text-amber-900">
                  Invoice numbers not found
                </div>
                <div className="text-[10px] text-amber-700">
                  These won't be imported. Common causes: typos, leading zeros,
                  CR/return suffixes, or orders from outside the current data
                  window.
                </div>
              </div>
              <div className="p-3 flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                {matchResult.unmatched.slice(0, 200).map((r) => (
                  <span
                    key={r.order_num}
                    className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-mono text-amber-900"
                  >
                    {r.order_num}
                  </span>
                ))}
                {matchResult.unmatched.length > 200 && (
                  <span className="text-[11px] text-amber-700">
                    +{matchResult.unmatched.length - 200} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Import button */}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={runImport}
              disabled={importing || matchedCount === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {importing
                ? "Importing…"
                : `Mark ${matchedCount} invoice${
                    matchedCount === 1 ? "" : "s"
                  } as Paid`}
            </button>
          </div>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div
          className={clsx(
            "rounded-xl border p-4 flex items-start gap-3",
            importResult.error
              ? "border-red-200 bg-red-50"
              : "border-emerald-200 bg-emerald-50"
          )}
        >
          {importResult.error ? (
            <AlertCircle size={16} className="text-red-600 mt-0.5" />
          ) : (
            <Check size={16} className="text-emerald-600 mt-0.5" />
          )}
          <div className="text-xs flex-1">
            {importResult.error ? (
              <>
                <div className="font-semibold text-red-900 mb-1">
                  Import failed
                </div>
                <div className="text-red-800">{importResult.error}</div>
              </>
            ) : (
              <>
                <div className="font-semibold text-emerald-900 mb-1">
                  Import complete
                </div>
                <div className="text-emerald-800">
                  {importResult.upserted.toLocaleString()} invoice
                  {importResult.upserted === 1 ? "" : "s"} flipped to A/R
                  received. Head back to Commission Reporting to review and
                  approve.
                </div>
                <Link
                  href="/commission-reporting"
                  className="inline-block mt-2 text-[11px] font-medium text-emerald-900 underline"
                >
                  Back to Commission Reporting →
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
