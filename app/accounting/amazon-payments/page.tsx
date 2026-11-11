"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Copy, Download, Loader2, Upload } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import {
  JE_COLUMNS,
  JE_COLUMN_LABELS,
  entryUnits,
  findMissingPeriods,
  nextExpectedPeriod,
  type JeColumn,
  type SavedSettlement,
} from "@/lib/amazonSettlement";
import {
  AMAZON_SETTLEMENTS_API,
  FishbowlBadge,
  createFishbowlEstimate,
  authHeader,
  downloadFile,
  entryHref,
  fishbowlCheck,
  money,
  shortDate,
  uploadedLabel,
} from "@/components/accounting/amazonSettlementParts";

/* Saved journal entries, one per Amazon settlement period. Uploads (here or
   through Sage) go to /api/accounting/amazon-settlements, which parses and
   saves them; the same settlement uploaded twice replaces its row. Each entry
   opens on its own page (./[settlementId]). */

const PAGE_SIZE = 10;
type SortKey = "date" | JeColumn | "total" | "units";
type Sort = { key: SortKey; dir: "asc" | "desc" };

/* Copy for Excel / CSV export every column; the on-screen list shows just the
   entry and its status, and the full breakdown lives on the entry's page. */
const HEADERS = ["Journal Entry", ...JE_COLUMNS.map((c) => JE_COLUMN_LABELS[c]), "Total"];
const LIST_COLUMNS: { label: string; sort?: SortKey; right?: boolean }[] = [
  { label: "Journal Entry", sort: "date" },
  { label: "Deposit" },
  { label: "Units", sort: "units", right: true },
  { label: "Sales", sort: "sales", right: true },
  { label: "Net Deposit", sort: "total", right: true },
  { label: "Fishbowl" },
  { label: "QuickBooks" },
  { label: "Uploaded" },
];
const rowValues = (je: SavedSettlement) => [je.label, ...JE_COLUMNS.map((c) => je.columns[c].toFixed(2)), je.total.toFixed(2)];
const sortValue = (je: SavedSettlement, key: SortKey) =>
  key === "date" ? je.startDate : key === "total" ? je.total : key === "units" ? entryUnits(je.groups) ?? -1 : je.columns[key];

export default function AmazonPaymentsPage() {
  return (
    <Suspense>
      <AmazonPayments />
    </Suspense>
  );
}

function AmazonPayments() {
  const router = useRouter();
  const focusId = useSearchParams().get("settlement");
  const [entries, setEntries] = useState<SavedSettlement[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });
  const [page, setPage] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  // "Not entered" → Push: which row is pushing, and estimates created this visit (before the Fishbowl sync catches up).
  const [pushing, setPushing] = useState<string | null>(null);
  const [pushed, setPushed] = useState<Record<string, { soNum: string; created: boolean }>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(AMAZON_SETTLEMENTS_API, {
        headers: await authHeader(),
        cache: "no-store",
      });
      const j = (await res.json()) as {
        ready?: boolean;
        items?: SavedSettlement[];
        error?: string;
      };
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

  // Older Sage links (?settlement=…) open that entry's own page.
  useEffect(() => {
    if (focusId) router.replace(entryHref({ settlementId: focusId }));
  }, [focusId, router]);

  // Reload on returning to the tab.
  useEffect(() => {
    void load();
  }, [load]);
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

  // Settlement periods with no entry (gaps, and ones whose deposit has landed), and the next one due.
  const missing = useMemo(() => findMissingPeriods(entries, new Date().toLocaleDateString("en-CA")), [entries]);
  const next = useMemo(() => nextExpectedPeriod(entries), [entries]);
  const firstStart = useMemo(() => entries.map((e) => e.startDate).sort()[0] ?? "", [entries]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const addFiles = async (files: FileList | File[]) => {
    setUploading(true);
    const errs: string[] = [];
    const added: SavedSettlement[] = [];
    let anySaved = false;
    for (const f of Array.from(files)) {
      try {
        const res = await fetch(AMAZON_SETTLEMENTS_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await authHeader()),
          },
          body: JSON.stringify({ text: await f.text(), file_name: f.name }),
        });
        const j = (await res.json()) as {
          saved?: boolean;
          entry?: SavedSettlement;
          error?: string;
        };
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
    setUploading(false);
    // One file saved cleanly: open it. Several: stay on the list.
    if (anySaved && added.length === 1 && !errs.length) return router.push(entryHref(added[0]));
    if (anySaved) await load();
  };

  const pushEstimate = async (je: SavedSettlement) => {
    setPushing(je.settlementId);
    setErrors([]);
    try {
      const out = await createFishbowlEstimate(je);
      if (out) setPushed((p) => ({ ...p, [je.settlementId]: out }));
    } catch (e) {
      setErrors([`${je.label}: ${e instanceof Error ? e.message : "Couldn't create the estimate."}`]);
    } finally {
      setPushing(null);
    }
  };

  // QuickBooks tick: undefined on every row = the column isn't there yet (db push pending).
  const qboReady = entries.some((e) => e.qboEnteredAt !== undefined);
  const toggleQbo = async (je: SavedSettlement, entered: boolean) => {
    const prev = { at: je.qboEnteredAt, by: je.qboEnteredBy };
    const setRow = (at: string | null | undefined, by: string | null | undefined) =>
      setEntries((list) => list.map((e) => (e.settlementId === je.settlementId ? { ...e, qboEnteredAt: at, qboEnteredBy: by } : e)));
    setRow(entered ? new Date().toISOString() : null, entered ? "You" : null);
    try {
      const res = await fetch(`${AMAZON_SETTLEMENTS_API}?qbo=${encodeURIComponent(je.settlementId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ entered }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't save that.");
    } catch (e) {
      setRow(prev.at, prev.by);
      setErrors([`${je.label}: ${e instanceof Error ? e.message : "Couldn't save that."}`]);
    }
  };

  const copyForExcel = async () => {
    const tsv = [HEADERS, ...sorted.map(rowValues)].map((r) => r.join("\t")).join("\n");
    await navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadCsv = () => downloadFile("amazon-journal-entries.csv", [HEADERS, ...sorted.map(rowValues)]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" },
    );
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
          Saving isn&apos;t switched on yet (the amazon_settlements migration needs a db push). Entries below are only kept until
          you leave the page.
        </div>
      )}

      {!loading && entries.length > 0 && (
        missing.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle size={15} /> {missing.length} settlement{missing.length === 1 ? "" : "s"} missing since{" "}
              {shortDate(firstStart)}
            </div>
            <ul className="space-y-0.5 text-xs">
              {missing.map((p) => (
                <li key={p.start}>
                  <span className="font-medium">{p.label}</span> · deposit {p.kind === "due" ? "landed" : "expected"} ≈{" "}
                  {shortDate(p.expectedDeposit)}
                  {p.kind === "gap" ? " · a gap between saved entries" : " · download it from Seller Central and upload it here"}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            <span className="font-medium text-green-700">No missing settlements</span> since {shortDate(firstStart)}
            {next && (
              <>
                {" "}
                · next: {next.label}, deposit ≈ {shortDate(next.expectedDeposit)} (Julie gets a task that day)
              </>
            )}
          </p>
        )
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
              {LIST_COLUMNS.map(({ label, sort: key, right }) => {
                const active = !!key && sort.key === key;
                return (
                  <th key={label} className={`px-3 py-2 font-semibold whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
                    {key ? (
                      <button
                        onClick={() => toggleSort(key)}
                        className={`inline-flex items-center gap-1 hover:text-yellow-200 ${active ? "text-yellow-200" : ""}`}
                        title={`Sort by ${key === "date" ? "date" : label}`}
                      >
                        {label}
                        {active && (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={LIST_COLUMNS.length} className="px-3 py-10 text-center text-gray-400">
                  <Loader2 size={16} className="inline animate-spin" />
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={LIST_COLUMNS.length} className="px-3 py-10 text-center text-sm text-gray-500">
                  No journal entries yet — click <span className="font-medium">Upload</span> or drop a settlement report here.
                </td>
              </tr>
            ) : (
              visible.map((je, idx) => (
                <tr
                  key={je.settlementId}
                  className={`border-t border-gray-200 cursor-pointer hover:bg-yellow-50 ${idx % 2 ? "bg-gray-50/60" : ""}`}
                  onClick={() => router.push(entryHref(je))}
                >
                  <td className="px-3 py-2 whitespace-nowrap font-medium">
                    <Link
                      href={entryHref(je)}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[#0b2a4a] hover:underline"
                    >
                      {je.label}
                      {!je.reconciles && <AlertTriangle size={13} className="text-red-600" />}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{shortDate(je.depositDate)}</td>
                  <td
                    className="px-3 py-2 text-right whitespace-nowrap"
                    title={entryUnits(je.groups) === null ? "Saved before units were kept — upload the file again" : undefined}
                  >
                    {entryUnits(je.groups)?.toLocaleString() ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">$ {money(je.columns.sales)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">$ {money(je.total)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    <FishbowlBadge
                      check={fishbowlCheck(je)}
                      onPush={() => void pushEstimate(je)}
                      pushing={pushing === je.settlementId}
                      pushed={pushed[je.settlementId] ?? null}
                      canPush={!!je.hasFile}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs" onClick={(e) => e.stopPropagation()}>
                    <label
                      className={`inline-flex items-center gap-1.5 ${qboReady ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                      title={
                        !qboReady
                          ? "Switching on — the QuickBooks column needs a database update (migration 20261111000000)."
                          : je.qboEnteredAt
                            ? `In QuickBooks — ticked by ${je.qboEnteredBy ?? "someone"} ${shortDate(je.qboEnteredAt.slice(0, 10))}`
                            : "Tick once this journal entry is in QuickBooks"
                      }
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#0b2a4a]"
                        checked={!!je.qboEnteredAt}
                        disabled={!qboReady}
                        onChange={(e) => void toggleQbo(je, e.target.checked)}
                      />
                      <span className={je.qboEnteredAt ? "font-medium text-green-700" : "text-gray-500"}>
                        {je.qboEnteredAt ? "In QBO" : "Not yet"}
                      </span>
                    </label>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{uploadedLabel(je) || "—"}</td>
                </tr>
              ))
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
          <button
            onClick={() => setPage(safePage + 1)}
            disabled={safePage >= pageCount - 1}
            className={btn}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
