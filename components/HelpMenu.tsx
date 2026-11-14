"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Bug, CircleHelp, Rocket, Sparkles, X } from "lucide-react";
import { useUser } from "@/components/UserContext";
import { getAllowedPaths } from "@/components/navConfig";
import { openHelpAssistant } from "@/components/HelpAssistant";
import BugReportModal from "@/components/BugReportModal";
import { WHATS_NEW, WHATS_NEW_SEEN_KEY, type WhatsNewEntry } from "@/lib/whatsNew";

/**
 * The top-bar "?" menu: Report a bug, What's new, Ask Sage, User guide. A dot
 * on the icon means there's a What's new entry this browser hasn't opened yet.
 */

function readSeen(): string | null {
  try {
    return localStorage.getItem(WHATS_NEW_SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeen(id: string) {
  try {
    localStorage.setItem(WHATS_NEW_SEEN_KEY, id);
  } catch {
    /* storage unavailable — the dot just reappears next visit */
  }
}

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function HelpMenu() {
  const { profile } = useUser();
  const [open, setOpen] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);
  const [seenLoaded, setSeenLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Only entries this role can follow; entries without a link are for everyone.
  const entries = useMemo<WhatsNewEntry[]>(() => {
    const allowed = new Set(getAllowedPaths(profile?.access ?? null));
    return WHATS_NEW.filter((e) => !e.href || allowed.has(e.href.split("?")[0]));
  }, [profile?.access]);
  const newestId = entries[0]?.id ?? null;
  const hasUnseen = seenLoaded && !!newestId && seen !== newestId;

  useEffect(() => {
    // localStorage is browser-only — read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeen(readSeen());
    setSeenLoaded(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openNews() {
    setOpen(false);
    setNewsOpen(true);
    if (newestId) {
      writeSeen(newestId);
      setSeen(newestId);
    }
  }

  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink-secondary transition hover:bg-surface-muted hover:text-ink";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface-muted hover:text-ink"
        aria-label={hasUnseen ? "Help — something new to see" : "Help"}
        aria-expanded={open}
      >
        <CircleHelp size={17} />
        {hasUnseen && (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent-600 ring-2 ring-surface" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-overlay">
          <button
            onClick={() => {
              setOpen(false);
              setBugOpen(true);
            }}
            className={item}
          >
            <Bug size={14} className="text-ink-subtle" />
            Report a bug
          </button>
          <button onClick={openNews} className={item}>
            <Rocket size={14} className="text-ink-subtle" />
            <span className="flex-1">What&apos;s new</span>
            {hasUnseen && <span className="h-1.5 w-1.5 rounded-full bg-accent-600" />}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              openHelpAssistant();
            }}
            className={item}
          >
            <Sparkles size={14} className="text-ink-subtle" />
            Ask Sage
          </button>
          <Link href="/help" onClick={() => setOpen(false)} className={item}>
            <BookOpen size={14} className="text-ink-subtle" />
            User guide
          </Link>
        </div>
      )}

      {bugOpen && <BugReportModal onClose={() => setBugOpen(false)} />}
      {newsOpen && <WhatsNewModal entries={entries} onClose={() => setNewsOpen(false)} />}
    </div>
  );
}

function WhatsNewModal({ entries, onClose }: { entries: WhatsNewEntry[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-line bg-surface shadow-overlay"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Rocket size={15} />
            </span>
            <h2 id="whats-new-title" className="text-sm font-semibold text-ink">
              What&apos;s new
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-ink-muted hover:bg-surface-muted hover:text-ink">
            <X size={17} />
          </button>
        </div>
        <ol className="flex-1 divide-y divide-line overflow-y-auto">
          {entries.map((e) => (
            <li key={e.id} className="px-5 py-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">{fmtDate(e.date)}</div>
              <div className="mt-0.5 text-sm font-semibold text-ink">{e.title}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{e.body}</p>
              {e.href && (
                <Link
                  href={e.href}
                  onClick={onClose}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                >
                  {e.linkLabel ?? "Take a look"} <ArrowRight size={12} />
                </Link>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
