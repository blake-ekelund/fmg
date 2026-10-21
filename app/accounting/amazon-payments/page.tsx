"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { JE_COLUMNS, JE_COLUMN_LABELS, type JeColumn, type SavedSettlement } from "@/lib/amazonSettlement";

/* Saved journal entries, one per Amazon settlement period. Uploads (here or
   through Sage) go to /api/accounting/amazon-settlements, which parses and
   saves them; the same settlement uploaded twice replaces its row. */

const PAGE_SIZE = 10;
type SortKey = "date" | JeColumn | "total";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const money = (n: number) => {
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${s})` : s;
};

const HEADERS = ["Journal Entry", ...JE_COLUMNS.map((c) => JE_COLUMN_LABELS[c]), "Total"];
const SORT_KEYS: SortKey[] = ["date", ...JE_COLUMNS, "total"];
const rowValues = (je: SavedSettlement) => [je.label, ...JE_COLUMNS.map((c) => je.columns[c].toFixed(2)), je.total.toFixed(2)];
const sortValue = (je: SavedSettlement, key: SortKey) =>
  key === "date" ? je.startDate : key === "total" ? je.total : je.columns[key];

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AmazonPaymentsPage() {
  return (
    <Suspense>
      <AmazonPayments />
    </Suspense>
  );
}

function AmazonPayments() {
  const focusId = useSearchParams().get("settlement");
  const [entries, setEntries] = useState<SavedSettlement[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });
  const [page, setPage] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/accounting/amazon-settlements", { headers: await authHeader(), cache: "no-store" });
      const j = (await res.json()) as { ready?: boolean; items?: SavedSettlement[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't load saved entries.");
      setReady(j.ready !== false);
      // Keep anything only held locally (migration not applied yet).
      if (j.ready !== false) setEntries(j.items ?? []);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Couldn't load saved entries."]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when Sage links here with a new settlement, and on returning to the tab.
  useEffect(() => {
    void load();
  }, [load, focusId]);
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const sorted = useMemo(() => {
    const out = [...entries].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [entries, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Sage's "Open" link: jump to and expand that settlement.
  useEffect(() => {
    if (!focusId) return;
    const i = sorted.findIndex((e) => e.id === focusId || e.settlementId === focusId);
    if (i < 0) return;
    setPage(Math.floor(i / PAGE_SIZE));
    setOpen(sorted[i].settlementId);
  }, [focusId, sorted]);

  const addFiles = async (files: FileList | File[]) => {
    setUploading(true);
    const errs: string[] = [];
    const added: SavedSettlement[] = [];
    let anySaved = false;
    for (const f of Array.from(files)) {
      try {
        const res = await fetch("/api/accounting/amazon-settlements", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ text: await f.text(), file_name: f.name }),
        });
        const j = (await res.json()) as { saved?: boolean; entry?: SavedSettlement; error?: string };
        if (!res.ok || !j.entry) throw new Error(j.error ?? "could not be read");
        if (j.saved) anySaved = true;
        else setReady(false);
        added.push(j.entry);
      } catch (e) {
        errs.push(`${f.name}: ${e instanceof Error ? e.message : "could not be read"}`);
      }
    }
    setErrors(errs);
    setEntries((prev) => {
      const ids = new Set(added.map((a) => a.settlementId));
      return [...prev.filter((p) => !ids.has(p.settlementId)), ...added];
    });
    if (anySaved) await load();
    setUploading(false);
  };

  const remove = async (je: SavedSettlement) => {
    if (!window.confirm(`Delete the journal entry for ${je.label}?`)) return;
    if (je.id) {
      const res = await fetch(`/api/accounting/amazon-settlements?id=${encodeURIComponent(je.id)}`, {
        method: "DELETE",
        headers: await authHeader(),
      });
      if (!res.ok) return setErrors(["Couldn't delete that entry."]);
    }
    setEntries((prev) => prev.filter((p) => p.settlementId !== je.settlementId));
  };


  const copyForExcel = async () => {
    const tsv = [HEADERS, ...sorted.map(rowValues)].map((r) => r.join("\t")).join("\n");
    await navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadCsv = () => {
    const csv = [HEADERS, ...sorted.map(rowValues)]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "amazon-journal-entries.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }));
    setPage(0);
  };

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-white ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div
      className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto space-y-4"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void addFiles(e.dataTransfer.files);
      }}
    >
      <PageMeta
        title="Amazon Payments"
        description="Journal entries from Amazon settlement reports — upload a report here or hand it to Sage."
      />

      <input
        ref={inputRef}
        type="file"
        accept=".txt,.tsv,text/plain,text/tab-separated-values"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-gray-500 mr-auto">
          Seller Central → Payments → Reports Repository → settlement Flat File V2 (.txt). Drop files anywhere on the page.
        </p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-[#0b2a4a] text-white hover:bg-[#123a63] disabled:opacity-60"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
        </button>
        <button onClick={copyForExcel} disabled={!entries.length} className={btn}>
          <Copy size={14} /> {copied ? "Copied" : "Copy for Excel"}
        </button>
        <button onClick={downloadCsv} disabled={!entries.length} className={btn}>
          <Download size={14} /> Download CSV
        </button>
      </div>

      {!ready && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Saving isn&apos;t switched on yet (the amazon_settlements migration needs a db push). Entries below are only kept until you leave
          the page.
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-1">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}

      <div
        className={`overflow-x-auto rounded-xl border bg-white transition ${dragging ? "border-orange-400 ring-2 ring-orange-200" : "border-gray-300"}`}
      >
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="bg-[#0b2a4a] text-white">
              {HEADERS.map((h, i) => {
                const key = SORT_KEYS[i];
                const active = sort.key === key;
                return (
                  <th key={h} className={`px-3 py-2 font-semibold whitespace-nowrap align-bottom ${i === 0 ? "text-left" : "text-right"}`}>
                    <button
                      onClick={() => toggleSort(key)}
                      className={`inline-flex items-center gap-1 hover:text-yellow-200 ${active ? "text-yellow-200" : ""}`}
                      title={`Sort by ${i === 0 ? "date" : h}`}
                    >
                      {h}
                      {active && (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-3 py-10 text-center text-gray-400">
                  <Loader2 size={16} className="inline animate-spin" />
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-3 py-10 text-center text-sm text-gray-500">
                  No journal entries yet — click <span className="font-medium">Upload</span> or drop a settlement report here.
                </td>
              </tr>
            ) : (
              visible.map((je, idx) => {
                const expanded = open === je.settlementId;
                return (
                  <Fragment key={je.settlementId}>
                    <tr
                      className={`border-t border-gray-200 cursor-pointer hover:bg-yellow-50 ${idx % 2 ? "bg-gray-50/60" : ""}`}
                      onClick={() => setOpen(expanded ? null : je.settlementId)}
                      title={je.fileName ?? undefined}
                    >
                      <td className="px-3 py-2 whitespace-nowrap font-medium">
                        <span className="inline-flex items-center gap-1">
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {je.label}
                          {!je.reconciles && <AlertTriangle size={13} className="text-red-600" />}
                        </span>
                      </td>
                      {JE_COLUMNS.map((c) => (
                        <td key={c} className={`px-3 py-2 text-right whitespace-nowrap ${je.columns[c] < 0 ? "text-gray-700" : ""}`}>
                          $ {money(je.columns[c])}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">$ {money(je.total)}</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={HEADERS.length} className="px-4 py-4">
                          <Breakdown je={je} onDelete={() => void remove(je)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-sm text-gray-600">
          <span>
            {safePage * PAGE_SIZE + 1}–{Math.min(sorted.length, (safePage + 1) * PAGE_SIZE)} of {sorted.length}
          </span>
          <button onClick={() => setPage(safePage - 1)} disabled={safePage === 0} className={btn} aria-label="Previous page">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1} className={btn} aria-label="Next page">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function Breakdown({ je, onDelete }: { je: SavedSettlement; onDelete: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {je.reconciles ? (
          <span className="inline-flex items-center gap-1.5 text-green-700">
            <CheckCircle2 size={14} /> Ties to Amazon&apos;s deposit of ${money(je.reportedTotal ?? je.total)}
            {je.depositDate && ` on ${je.depositDate}`}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-red-700">
            <AlertTriangle size={14} /> Columns total ${money(je.total)} but Amazon reported ${money(je.reportedTotal ?? 0)} — check the
            file is complete.
          </span>
        )}
        <span className="text-gray-500">
          Settlement {je.settlementId} · {je.lineCount.toLocaleString()} lines{je.fileName ? ` · ${je.fileName}` : ""}
        </span>
        <button onClick={onDelete} className="ml-auto inline-flex items-center gap-1 text-gray-500 hover:text-red-700">
          <Trash2 size={13} /> Delete entry
        </button>
      </div>
      <table className="text-xs tabular-nums">
        <tbody>
          {JE_COLUMNS.map((c) =>
            je.groups
              .filter((g) => g.column === c)
              .map((g, i) => (
                <tr key={`${c}-${i}`} className={i === 0 ? "border-t border-gray-200" : ""}>
                  <td className="pr-6 py-1 font-medium text-gray-900 whitespace-nowrap">{i === 0 ? JE_COLUMN_LABELS[c] : ""}</td>
                  <td className="pr-6 py-1 text-gray-600 whitespace-nowrap">
                    {g.transactionType} › {g.amountType} › {g.amountDescription}
                  </td>
                  <td className="pr-6 py-1 text-gray-400 text-right">{g.count}×</td>
                  <td className="py-1 text-right text-gray-900">{money(g.cents / 100)}</td>
                </tr>
              )),
          )}
        </tbody>
      </table>
    </div>
  );
}
