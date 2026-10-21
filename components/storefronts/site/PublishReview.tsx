"use client";

import { useEffect } from "react";
import { ArrowUpDown, Bookmark, Eye, EyeOff, Loader2, Minus, Palette, PencilLine, Plus, X } from "lucide-react";
import type { PageBlock } from "@/lib/site/pageBlocks";
import { summary } from "./blockMeta";

/**
 * What a publish would change on the live page — the draft compared with
 * what's live (or, for a page never published, with the original page the
 * site shows). Drives the "N changes not live" count in the editor's top bar
 * and the review dialog that Publish opens.
 */

export type PageChange = {
  kind: "added" | "removed" | "edited" | "colors" | "hidden" | "shown" | "moved" | "saved";
  label: string;
  /** Before → after, for text edits where the summary changed. */
  before?: string;
  after?: string;
};

const strip = (b: PageBlock) => {
  const { colors: _c, hidden: _h, ...rest } = b as PageBlock & { colors?: unknown; hidden?: boolean };
  void _c;
  void _h;
  return JSON.stringify(rest);
};

export function diffPage(
  live: PageBlock[],
  draft: PageBlock[],
  labelFor: (b: PageBlock) => string,
  /** Saved sections on this page whose own edits aren't live yet. */
  savedEdits: { name: string; otherPages: string[] }[] = [],
): PageChange[] {
  const out: PageChange[] = [];
  const liveById = new Map(live.map((b) => [b.id, b]));
  const draftIds = new Set(draft.map((b) => b.id));

  for (const b of draft) {
    const was = liveById.get(b.id);
    if (!was) {
      out.push({ kind: "added", label: labelFor(b) });
      continue;
    }
    if (!!was.hidden !== !!b.hidden) out.push({ kind: b.hidden ? "hidden" : "shown", label: labelFor(b) });
    if (strip(was) !== strip(b)) {
      const before = b.type === "widget" ? undefined : summary(was);
      const after = b.type === "widget" ? undefined : summary(b);
      out.push({ kind: "edited", label: labelFor(b), ...(before !== after ? { before, after } : {}) });
    }
    if (JSON.stringify(was.colors ?? null) !== JSON.stringify(b.colors ?? null)) out.push({ kind: "colors", label: labelFor(b) });
  }
  for (const b of live) if (!draftIds.has(b.id)) out.push({ kind: "removed", label: labelFor(b) });

  // Order: only among the sections on both, so an add/remove isn't also a "move".
  const liveOrder = live.filter((b) => draftIds.has(b.id)).map((b) => b.id);
  const draftOrder = draft.filter((b) => liveById.has(b.id)).map((b) => b.id);
  if (liveOrder.join() !== draftOrder.join()) out.push({ kind: "moved", label: "Sections reordered" });

  for (const s of savedEdits) {
    out.push({
      kind: "saved",
      label: s.name,
      after: s.otherPages.length ? `Also changes: ${s.otherPages.join(", ")}` : undefined,
    });
  }
  return out;
}

const KIND: Record<PageChange["kind"], { icon: typeof Plus; verb: string; cls: string }> = {
  added: { icon: Plus, verb: "Added", cls: "bg-emerald-50 text-emerald-700" },
  removed: { icon: Minus, verb: "Removed", cls: "bg-red-50 text-red-700" },
  edited: { icon: PencilLine, verb: "Edited", cls: "bg-indigo-50 text-indigo-700" },
  colors: { icon: Palette, verb: "New colors", cls: "bg-violet-50 text-violet-700" },
  hidden: { icon: EyeOff, verb: "Hidden", cls: "bg-gray-100 text-gray-600" },
  shown: { icon: Eye, verb: "Shown again", cls: "bg-emerald-50 text-emerald-700" },
  moved: { icon: ArrowUpDown, verb: "", cls: "bg-amber-50 text-amber-700" },
  saved: { icon: Bookmark, verb: "Saved section edited", cls: "bg-violet-50 text-violet-700" },
};

export function ChangeList({ changes }: { changes: PageChange[] }) {
  return (
    <ul className="space-y-1.5">
      {changes.map((c, i) => {
        const k = KIND[c.kind];
        const Icon = k.icon;
        return (
          <li key={i} className="flex items-start gap-2.5 rounded-lg border border-gray-100 px-3 py-2">
            <span className={`mt-0.5 rounded-md p-1 ${k.cls}`}>
              <Icon size={12} />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="text-gray-900">
                {k.verb ? <span className="font-medium">{k.verb}: </span> : null}
                {c.label}
              </div>
              {c.before !== undefined && c.kind === "edited" ? (
                <div className="mt-0.5 space-y-0.5 text-[11px] leading-snug">
                  <div className="truncate text-gray-400 line-through" title={c.before}>
                    {c.before || "Empty"}
                  </div>
                  <div className="truncate text-gray-700" title={c.after}>
                    {c.after || "Empty"}
                  </div>
                </div>
              ) : c.after ? (
                <div className="mt-0.5 text-[11px] text-gray-500">{c.after}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function PublishReview({
  open,
  page,
  host,
  firstPublish,
  changes,
  busy,
  onPublish,
  onClose,
}: {
  open: boolean;
  page: string;
  host: string;
  firstPublish: boolean;
  changes: PageChange[];
  busy: boolean;
  onPublish: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[10vh]" onMouseDown={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-label="Publish changes"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[75vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">Put {page} live?</h2>
            <p className="text-xs text-gray-500">
              {firstPublish
                ? `First publish — ${host} shows the original page until now.`
                : `${changes.length} ${changes.length === 1 ? "change" : "changes"} will go live on ${host}.`}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          {changes.length ? (
            <ChangeList changes={changes} />
          ) : (
            <p className="text-sm text-gray-500">Nothing differs from the original page — publishing just makes this draft the live version.</p>
          )}
          <p className="mt-4 text-[11px] text-gray-400">
            The site picks it up within a minute. Every publish is kept — Page settings → Published versions can bring an older one back.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Not yet
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Publish now
          </button>
        </div>
      </div>
    </div>
  );
}
