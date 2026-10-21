"use client";

import { Fragment, useCallback, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Copy, Download, Trash2, Upload } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import {
  JE_COLUMNS,
  JE_COLUMN_LABELS,
  parseSettlementReport,
  type SettlementJournalEntry,
} from "@/lib/amazonSettlement";

/* Parsed entirely in the browser — the settlement file never leaves the
   machine and nothing is stored. Drop one or several reports; each becomes
   one journal-entry row. */

type Loaded = { fileName: string; je: SettlementJournalEntry };

const money = (n: number) => {
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${s})` : s;
};

const HEADERS = ["Journal Entry", ...JE_COLUMNS.map((c) => JE_COLUMN_LABELS[c]), "Total"];
const rowValues = (je: SettlementJournalEntry) => [
  je.label,
  ...JE_COLUMNS.map((c) => je.columns[c].toFixed(2)),
  je.total.toFixed(2),
];

export default function AmazonPaymentsPage() {
  const [entries, setEntries] = useState<Loaded[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const errs: string[] = [];
    const added: Loaded[] = [];
    for (const f of Array.from(files)) {
      try {
        added.push({ fileName: f.name, je: parseSettlementReport(await f.text()) });
      } catch (e) {
        errs.push(`${f.name}: ${e instanceof Error ? e.message : "could not be read"}`);
      }
    }
    setErrors(errs);
    setEntries((prev) => {
      const ids = new Set(added.map((a) => a.je.settlementId));
      return [...prev.filter((p) => !ids.has(p.je.settlementId)), ...added].sort((a, b) =>
        a.je.startDate.localeCompare(b.je.startDate)
      );
    });
  }, []);

  const copyForExcel = async () => {
    const tsv = [HEADERS, ...entries.map((e) => rowValues(e.je))].map((r) => r.join("\t")).join("\n");
    await navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadCsv = () => {
    const csv = [HEADERS, ...entries.map((e) => rowValues(e.je))]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download =
      entries.length === 1
        ? `amazon-journal-entry-${entries[0].je.startDate}-to-${entries[0].je.endDate}.csv`
        : "amazon-journal-entries.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto space-y-6">
      <PageMeta
        title="Amazon Payments"
        description="Upload an Amazon settlement report and get the journal entry for that period."
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragging ? "border-orange-400 bg-orange-50" : "border-gray-200 bg-white hover:border-gray-300"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.tsv,text/plain,text/tab-separated-values"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 text-gray-500 mb-3">
          <Upload size={18} />
        </div>
        <p className="text-sm font-medium text-gray-900">Drop settlement reports here, or click to choose</p>
        <p className="text-xs text-gray-500 mt-1">
          Seller Central → Payments → Reports Repository → the settlement&apos;s Flat File V2 (.txt). Several at once is fine.
        </p>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-1">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={copyForExcel}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-white ring-1 ring-gray-200 hover:bg-gray-50"
            >
              <Copy size={14} /> {copied ? "Copied" : "Copy for Excel"}
            </button>
            <button
              onClick={downloadCsv}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-white ring-1 ring-gray-200 hover:bg-gray-50"
            >
              <Download size={14} /> Download CSV
            </button>
            <button
              onClick={() => setEntries([])}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-800"
            >
              <Trash2 size={14} /> Clear
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-300 bg-white">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="bg-[#0b2a4a] text-white">
                  {HEADERS.map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2 font-semibold whitespace-nowrap align-bottom ${i === 0 ? "text-left" : "text-right"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(({ fileName, je }) => {
                  const expanded = open === je.settlementId;
                  return (
                    <Fragment key={je.settlementId}>
                      <tr
                        className="bg-yellow-200 font-semibold border-t border-gray-300 cursor-pointer"
                        onClick={() => setOpen(expanded ? null : je.settlementId)}
                        title={fileName}
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            {je.label}
                          </span>
                        </td>
                        {JE_COLUMNS.map((c) => (
                          <td key={c} className="px-3 py-2 text-right whitespace-nowrap">
                            $ {money(je.columns[c])}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right whitespace-nowrap">$ {money(je.total)}</td>
                      </tr>
                      {expanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={HEADERS.length} className="px-4 py-4">
                            <Breakdown je={je} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-1">
            {entries.map(({ je }) =>
              je.reconciles ? (
                <p key={je.settlementId} className="flex items-center gap-1.5 text-xs text-green-700">
                  <CheckCircle2 size={14} /> {je.label}: ties to Amazon&apos;s deposit of ${money(je.reportedTotal ?? je.total)}
                  {je.depositDate && ` on ${je.depositDate}`} · settlement {je.settlementId} · {je.lineCount.toLocaleString()} lines
                </p>
              ) : (
                <p key={je.settlementId} className="flex items-center gap-1.5 text-xs text-red-700">
                  <AlertTriangle size={14} /> {je.label}: columns total ${money(je.total)} but Amazon reported $
                  {money(je.reportedTotal ?? 0)} — check the file is complete.
                </p>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Breakdown({ je }: { je: SettlementJournalEntry }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">What feeds each column:</p>
      <table className="text-xs tabular-nums">
        <tbody>
          {JE_COLUMNS.map((c) => {
            const groups = je.groups.filter((g) => g.column === c);
            if (groups.length === 0) return null;
            return groups.map((g, i) => (
              <tr key={`${c}-${i}`} className={i === 0 ? "border-t border-gray-200" : ""}>
                <td className="pr-6 py-1 font-medium text-gray-900 whitespace-nowrap">
                  {i === 0 ? JE_COLUMN_LABELS[c] : ""}
                </td>
                <td className="pr-6 py-1 text-gray-600 whitespace-nowrap">
                  {g.transactionType} › {g.amountType} › {g.amountDescription}
                </td>
                <td className="pr-6 py-1 text-gray-400 text-right">{g.count}×</td>
                <td className="py-1 text-right text-gray-900">{money(g.cents / 100)}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
