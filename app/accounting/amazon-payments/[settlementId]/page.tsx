"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileDown, Loader2, Trash2, Upload } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { entryUnits, parseSettlementReport, type SavedSettlement } from "@/lib/amazonSettlement";
import {
  AMAZON_SETTLEMENTS_API,
  EntryColumns,
  FishbowlStatus,
  LineTypeBreakdown,
  SkuTable,
  authHeader,
  money,
  poLabel,
  shortDate,
  uploadedLabel,
} from "@/components/accounting/amazonSettlementParts";

/* One Amazon settlement's journal entry: the entry, its Fishbowl sales order
   check, Amazon Data by SKU, and the original file. Linked from the list and
   from Sage, by Amazon settlement id. */

export default function AmazonSettlementPage() {
  const { settlementId } = useParams<{ settlementId: string }>();
  const router = useRouter();
  const [je, setJe] = useState<SavedSettlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "delete" | "upload" | "estimate" | null>(null);
  const [pushed, setPushed] = useState<{ soNum: string; created: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${AMAZON_SETTLEMENTS_API}?settlement=${encodeURIComponent(settlementId)}`, {
        headers: await authHeader(),
        cache: "no-store",
      });
      const j = (await res.json()) as { entry?: SavedSettlement; error?: string };
      if (!res.ok || !j.entry) throw new Error(j.error ?? "Couldn't load this entry.");
      setJe(j.entry);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this entry.");
    }
  }, [settlementId]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadOriginal = async () => {
    if (!je) return;
    setBusy("download");
    try {
      const res = await fetch(`${AMAZON_SETTLEMENTS_API}?file=${encodeURIComponent(je.settlementId)}`, {
        headers: await authHeader(),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't download it.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = je.fileName || `${je.settlementId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't download it.");
    } finally {
      setBusy(null);
    }
  };

  /** Upload this settlement's file again — fills in quantities and keeps the original. Must be the same settlement. */
  const reupload = async (file: File) => {
    if (!je) return;
    setBusy("upload");
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseSettlementReport(text);
      if (parsed.settlementId !== je.settlementId)
        throw new Error(`That file is settlement ${parsed.settlementId} (${parsed.label}), not ${je.settlementId}. Upload it on the Amazon Payments list instead.`);
      const res = await fetch(AMAZON_SETTLEMENTS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ text, file_name: file.name }),
      });
      const j = (await res.json()) as { entry?: SavedSettlement; error?: string };
      if (!res.ok || !j.entry) throw new Error(j.error ?? "Couldn't upload it.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload it.");
    } finally {
      setBusy(null);
    }
  };

  /** Create the Fishbowl estimate for this settlement (never a sales order). */
  const createEstimate = async () => {
    if (!je) return;
    if (
      !window.confirm(
        `Create a Fishbowl ESTIMATE for ${je.label}?\n\nAMAZON - CUSTOMER · PO ${poLabel(je)} · Amazon Warehouse · $${money(je.columns.sales)}\n\nSomeone reviews and converts it in Fishbowl.`,
      )
    )
      return;
    setBusy("estimate");
    setError(null);
    try {
      const res = await fetch(`${AMAZON_SETTLEMENTS_API}?estimate=${encodeURIComponent(je.settlementId)}`, {
        method: "POST",
        headers: await authHeader(),
      });
      const j = (await res.json()) as { soNum?: string; created?: boolean; error?: string };
      if (!res.ok || !j.soNum) throw new Error(j.error ?? "Couldn't create the estimate.");
      setPushed({ soNum: j.soNum, created: !!j.created });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the estimate.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!je?.id || !window.confirm(`Delete the journal entry for ${je.label}? Its original file is deleted too.`)) return;
    setBusy("delete");
    const res = await fetch(`${AMAZON_SETTLEMENTS_API}?id=${encodeURIComponent(je.id)}`, {
      method: "DELETE",
      headers: await authHeader(),
    });
    if (!res.ok) {
      setBusy(null);
      return setError("Couldn't delete that entry.");
    }
    router.push("/accounting/amazon-payments");
  };

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-white ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto space-y-5">
      <PageMeta
        title={je ? `Amazon Payment · ${je.label}` : "Amazon Payment"}
        description="One settlement's journal entry, its Fishbowl sales order, and Amazon Data by SKU."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/accounting/amazon-payments"
          className="mr-auto inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={14} /> Amazon Payments
        </Link>
        {je && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".txt,.tsv,text/plain,text/tab-separated-values"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void reupload(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy !== null}
              className={btn}
              title="Upload this settlement's file again (replaces the entry with the same numbers)"
            >
              {busy === "upload" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload file again
            </button>
            <button
              onClick={() => void downloadOriginal()}
              disabled={!je.hasFile || busy !== null}
              className={btn}
              title={
                je.hasFile
                  ? (je.fileName ?? undefined)
                  : "The original file wasn't kept for this entry — upload it again to keep it."
              }
            >
              {busy === "download" ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Original file
            </button>
            <button onClick={() => void remove()} disabled={busy !== null} className={`${btn} hover:text-red-700`}>
              {busy === "delete" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
            </button>
          </>
        )}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!je ? (
        !error && (
          <div className="py-16 text-center text-gray-400">
            <Loader2 size={18} className="inline animate-spin" />
          </div>
        )
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <h2 className="text-lg font-semibold text-gray-900">{je.label}</h2>
              <span className="text-sm text-gray-600">
                Deposit <span className="font-medium text-gray-900">${money(je.reportedTotal ?? je.total)}</span> on{" "}
                {shortDate(je.depositDate)}
              </span>
              <span className="text-sm text-gray-600">
                Sales <span className="font-medium text-gray-900">${money(je.columns.sales)}</span>
              </span>
              {entryUnits(je.groups) !== null && (
                <span className="text-sm text-gray-600">
                  Units <span className="font-medium text-gray-900">{entryUnits(je.groups)?.toLocaleString()}</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {je.reconciles ? (
                <span className="inline-flex items-center gap-1.5 text-green-700">
                  <CheckCircle2 size={14} /> Columns tie to Amazon&apos;s deposit
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-red-700">
                  <AlertTriangle size={14} /> Columns total ${money(je.total)} but Amazon reported ${money(je.reportedTotal ?? 0)}{" "}
                  — check the file is complete.
                </span>
              )}
              <span className="text-gray-500">
                Settlement {je.settlementId} · {je.lineCount.toLocaleString()} lines
                {je.fileName ? ` · ${je.fileName}` : ""}
                {uploadedLabel(je) ? ` · Uploaded by ${uploadedLabel(je)}` : ""}
              </span>
            </div>
          </div>

          {(entryUnits(je.groups) === null || !je.hasFile) && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle size={16} className="shrink-0" />
              <span className="flex-1">
                {entryUnits(je.groups) === null
                  ? "Quantities are blank because this entry was uploaded before the app kept them. Upload the same settlement file again to fill in Qty and check units against Fishbowl — the numbers stay the same."
                  : "The original file wasn't kept for this entry. Upload it again to keep it."}
              </span>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2a4a] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#123a63] disabled:opacity-60"
              >
                {busy === "upload" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload file again
              </button>
            </div>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Journal entry</h3>
            <EntryColumns je={je} />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Fishbowl</h3>
            <FishbowlStatus
              je={je}
              onCreateEstimate={() => void createEstimate()}
              pushing={busy === "estimate"}
              pushed={pushed}
            />
          </section>

          <SkuTable je={je} />

          <details className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-gray-900 select-none">By line type</summary>
            <div className="mt-2">
              <LineTypeBreakdown je={je} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
