"use client";

/* ════════════════════════════════════════════════════════════
   Copy export / import — toolbar buttons + preview modal

   Export downloads every FG product's storefront copy + page
   colors as one styled .xlsx. Import reads an edited copy of
   that file back, shows exactly what would change (including
   cleared cells), and only writes after the user applies.
   ════════════════════════════════════════════════════════════ */

import { useRef, useState } from "react";
import { AlertTriangle, Download, Upload, X } from "lucide-react";
import clsx from "clsx";

import { supabase } from "@/lib/supabaseClient";
import {
  diffCopyImport,
  groupChangesByPart,
  type CopyRow,
  type ImportPlan,
} from "./copySheet";
import { buildCopyWorkbookBlob, parseCopyWorkbookFile } from "./copyWorkbook";

/* ── DB row shapes ──────────────────────────────────────────── */

type InvRow = {
  part: string;
  brand: string;
  display_name: string | null;
  product_name: string | null;
  product_form: string | null;
  is_tester: boolean | null;
  subtitle: string | null;
  infused_with: string | null;
  category_path: string | null;
  metafields: Record<string, unknown> | null;
  page_bg_color: string | null;
  page_text_color: string | null;
  page_heading_color: string | null;
  page_accent_color: string | null;
};

type MediaRow = {
  part: string;
  short_description: string | null;
  long_description: string | null;
  benefits: string | null;
  ingredients_text: string | null;
  how_to_use: string | null;
  retailer_notes: string | null;
};

function notesOf(metafields: Record<string, unknown> | null): {
  top?: string;
  mid?: string;
  dry?: string;
} {
  const n = metafields?.notes;
  if (n && typeof n === "object" && !Array.isArray(n)) {
    return n as { top?: string; mid?: string; dry?: string };
  }
  return {};
}

function toCopyRow(p: InvRow, m: MediaRow | undefined): CopyRow {
  const notes = notesOf(p.metafields);
  return {
    part: p.part,
    brand: p.brand,
    is_tester: !!p.is_tester,
    display_name: p.display_name ?? null,
    product_name: p.product_name ?? null,
    product_form: p.product_form ?? null,
    subtitle: p.subtitle ?? null,
    infused_with: p.infused_with ?? null,
    category_path: p.category_path ?? null,
    note_top: notes.top ?? null,
    note_mid: notes.mid ?? null,
    note_dry: notes.dry ?? null,
    short_description: m?.short_description ?? null,
    long_description: m?.long_description ?? null,
    benefits: m?.benefits ?? null,
    ingredients_text: m?.ingredients_text ?? null,
    how_to_use: m?.how_to_use ?? null,
    retailer_notes: m?.retailer_notes ?? null,
    page_bg_color: p.page_bg_color ?? null,
    page_text_color: p.page_text_color ?? null,
    page_heading_color: p.page_heading_color ?? null,
    page_accent_color: p.page_accent_color ?? null,
  };
}

async function fetchCopyState(): Promise<{ rows: CopyRow[]; invByPart: Map<string, InvRow> }> {
  const [invRes, mediaRes] = await Promise.all([
    supabase
      .from("inventory_products")
      .select(
        "part, brand, display_name, product_name, product_form, is_tester, subtitle, infused_with, category_path, metafields, page_bg_color, page_text_color, page_heading_color, page_accent_color"
      )
      .eq("product_type", "FG")
      .order("brand")
      .order("part"),
    supabase
      .from("media_kit_products")
      .select(
        "part, short_description, long_description, benefits, ingredients_text, how_to_use, retailer_notes"
      ),
  ]);

  if (invRes.error) throw invRes.error;
  if (mediaRes.error) throw mediaRes.error;

  const inv = (invRes.data ?? []) as InvRow[];
  const mediaByPart = new Map(
    ((mediaRes.data ?? []) as MediaRow[]).map((m) => [m.part, m])
  );
  return {
    rows: inv.map((p) => toCopyRow(p, mediaByPart.get(p.part))),
    invByPart: new Map(inv.map((p) => [p.part, p])),
  };
}

/* ── Component ──────────────────────────────────────────────── */

type Phase =
  | { name: "idle" }
  | { name: "exporting" }
  | { name: "parsing" }
  | { name: "preview"; plan: ImportPlan; invByPart: Map<string, InvRow> }
  | { name: "applying"; done: number; total: number }
  | { name: "result"; applied: number; errors: string[] };

export default function CopyImportExport({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });

  /* ── Export ── */

  async function handleExport() {
    setPhase({ name: "exporting" });
    try {
      const { rows } = await fetchCopyState();
      const blob = await buildCopyWorkbookBlob(rows);
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fmg-product-copy-${date}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Copy export failed", err);
      alert("Export failed. Check the console for details.");
    } finally {
      setPhase({ name: "idle" });
    }
  }

  /* ── Import ── */

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhase({ name: "parsing" });
    try {
      const [parsed, current] = await Promise.all([
        parseCopyWorkbookFile(file),
        fetchCopyState(),
      ]);
      const plan = diffCopyImport(current.rows, parsed);
      plan.issues.unshift(...parsed.issues);
      setPhase({ name: "preview", plan, invByPart: current.invByPart });
    } catch (err) {
      console.error("Copy import parse failed", err);
      alert("Could not read that file as a copy workbook.");
      setPhase({ name: "idle" });
    }
  }

  async function handleApply(plan: ImportPlan, invByPart: Map<string, InvRow>) {
    const grouped = groupChangesByPart(plan.changes);
    const errors: string[] = [];
    let done = 0;
    setPhase({ name: "applying", done, total: grouped.size });

    for (const [part, updates] of grouped) {
      try {
        const invPayload: Record<string, unknown> = { ...updates.inventory };

        // Notes live inside metafields — merge against the current bag so
        // unrelated metafields keys survive.
        if (Object.keys(updates.notes).length > 0) {
          const inv = invByPart.get(part);
          const metafields = { ...(inv?.metafields ?? {}) } as Record<string, unknown>;
          const notes = { ...notesOf(inv?.metafields ?? null) } as Record<string, string>;
          for (const [k, v] of Object.entries(updates.notes)) {
            if (v == null) delete notes[k];
            else notes[k] = v;
          }
          if (Object.keys(notes).length > 0) metafields.notes = notes;
          else delete metafields.notes;
          invPayload.metafields = metafields;
        }

        if (Object.keys(invPayload).length > 0) {
          const { error } = await supabase
            .from("inventory_products")
            .update(invPayload)
            .eq("part", part);
          if (error) throw error;
        }

        if (Object.keys(updates.media).length > 0) {
          const { error } = await supabase.from("media_kit_products").upsert({
            part,
            ...updates.media,
            updated_at: new Date().toISOString(),
          });
          if (error) throw error;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${part}: ${message}`);
      }
      done += 1;
      setPhase({ name: "applying", done, total: grouped.size });
    }

    setPhase({ name: "result", applied: grouped.size - errors.length, errors });
    onImported();
  }

  const busy = phase.name === "exporting" || phase.name === "parsing";

  return (
    <>
      <button
        onClick={handleExport}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900 disabled:opacity-50"
        title="Download all product copy + page colors as Excel"
      >
        <Download size={13} />
        {phase.name === "exporting" ? "Exporting…" : "Export copy"}
      </button>

      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900 disabled:opacity-50"
        title="Upload an edited copy workbook — you'll preview changes before anything saves"
      >
        <Upload size={13} />
        {phase.name === "parsing" ? "Reading…" : "Import copy"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFile}
      />

      {(phase.name === "preview" ||
        phase.name === "applying" ||
        phase.name === "result") && (
        <ImportModal
          phase={phase}
          onApply={handleApply}
          onClose={() => setPhase({ name: "idle" })}
        />
      )}
    </>
  );
}

/* ── Preview modal ──────────────────────────────────────────── */

function ValueCell({ value }: { value: string | null }) {
  if (value == null) {
    return <span className="italic text-gray-300">empty</span>;
  }
  const isColor = /^#[0-9a-f]{6}$/.test(value);
  const display = value.length > 70 ? `${value.slice(0, 70)}…` : value;
  return (
    <span className="inline-flex items-center gap-1.5" title={value}>
      {isColor ? (
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-sm border border-gray-200"
          style={{ backgroundColor: value }}
        />
      ) : null}
      <span className="whitespace-pre-wrap break-words">{display}</span>
    </span>
  );
}

function ImportModal({
  phase,
  onApply,
  onClose,
}: {
  phase: Extract<Phase, { name: "preview" | "applying" | "result" }>;
  onApply: (plan: ImportPlan, invByPart: Map<string, InvRow>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Import product copy</h2>
            {phase.name === "preview" ? (
              <p className="mt-0.5 text-xs text-gray-500">
                {phase.plan.changes.length === 0
                  ? "No changes — the file matches the database."
                  : `${phase.plan.changes.length} change${phase.plan.changes.length === 1 ? "" : "s"} across ${phase.plan.touchedParts.length} product${phase.plan.touchedParts.length === 1 ? "" : "s"}. Nothing is saved until you apply.`}
              </p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            disabled={phase.name === "applying"}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {phase.name === "preview" && (
            <>
              {phase.plan.issues.length > 0 && (
                <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-800">
                    <AlertTriangle size={13} />
                    {phase.plan.issues.length} skipped
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-amber-700">
                    {phase.plan.issues.slice(0, 12).map((issue, i) => (
                      <li key={i}>
                        {issue.part ? <span className="font-mono">{issue.part}</span> : null}{" "}
                        {issue.message}
                      </li>
                    ))}
                    {phase.plan.issues.length > 12 && (
                      <li>+{phase.plan.issues.length - 12} more</li>
                    )}
                  </ul>
                </div>
              )}

              {phase.plan.changes.length > 0 && (
                <table className="mt-4 w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="px-5 py-2 text-left font-medium">SKU</th>
                      <th className="px-2 py-2 text-left font-medium">Field</th>
                      <th className="px-2 py-2 text-left font-medium">Current</th>
                      <th className="px-2 py-2 text-left font-medium">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phase.plan.changes.map((c, i) => {
                      const firstOfPart =
                        i === 0 || phase.plan.changes[i - 1].part !== c.part;
                      return (
                        <tr
                          key={`${c.part}-${c.key}`}
                          className={clsx(
                            "align-top",
                            firstOfPart && i !== 0 && "border-t border-gray-100"
                          )}
                        >
                          <td className="px-5 py-1.5 font-mono text-gray-600 whitespace-nowrap">
                            {firstOfPart ? c.part : ""}
                          </td>
                          <td className="px-2 py-1.5 font-medium text-gray-900 whitespace-nowrap">
                            {c.header}
                          </td>
                          <td className="max-w-[200px] px-2 py-1.5 text-gray-500">
                            <ValueCell value={c.from} />
                          </td>
                          <td className="max-w-[200px] px-2 py-1.5 text-gray-900">
                            <ValueCell value={c.to} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {phase.plan.changes.length === 0 && phase.plan.issues.length === 0 && (
                <div className="px-5 py-12 text-center text-sm text-gray-400">
                  Everything in the file already matches.
                </div>
              )}
            </>
          )}

          {phase.name === "applying" && (
            <div className="flex flex-col items-center gap-3 py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
              <p className="text-sm text-gray-600">
                Applying {phase.done}/{phase.total} products…
              </p>
            </div>
          )}

          {phase.name === "result" && (
            <div className="px-5 py-8">
              <p className="text-sm font-medium text-gray-900">
                Updated {phase.applied} product{phase.applied === 1 ? "" : "s"}.
              </p>
              {phase.errors.length > 0 && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-xs font-medium text-red-700">
                    {phase.errors.length} failed:
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-red-600">
                    {phase.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          {phase.name === "preview" && (
            <>
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => onApply(phase.plan, phase.invByPart)}
                disabled={phase.plan.changes.length === 0}
                className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-40"
              >
                Apply {phase.plan.changes.length > 0 ? `${phase.plan.changes.length} changes` : ""}
              </button>
            </>
          )}
          {phase.name === "result" && (
            <button
              onClick={onClose}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
