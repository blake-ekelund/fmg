"use client";

import { useEffect, useRef, useState } from "react";
import { Bug, Check, ImagePlus, Loader2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useBrand } from "@/components/BrandContext";
import { uploadEmailImage } from "@/components/templates/uploadEmailImage";

/**
 * "Report a bug" (top-bar Help menu). The reporter types what went wrong and
 * can paste or attach a screenshot; the page, screen size, browser and brand
 * filter ride along automatically. /api/bug-report files it as a High-priority
 * task for the app owner.
 */

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Mount only while open — unmounting on close gives a fresh form next time. */
export default function BugReportModal({ onClose }: { onClose: () => void }) {
  const { brand } = useBrand();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [shot, setShot] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function attach(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Screenshots need to be an image.");
      return;
    }
    setUploading(true);
    setError(null);
    const res = await uploadEmailImage(file, "bug-reports");
    setUploading(false);
    if ("error" in res) setError(`Couldn't attach the screenshot: ${res.error}`);
    else setShot({ url: res.url, name: file.name || "screenshot.png" });
  }

  function onPaste(e: React.ClipboardEvent) {
    const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (img) {
      e.preventDefault();
      void attach(img);
    }
  }

  async function submit() {
    if (!title.trim() || sending || uploading) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          title,
          details,
          screenshotUrl: shot?.url,
          page: window.location.href,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}×${window.innerHeight}`,
          brand,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't send the report.");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the report.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-line bg-surface shadow-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <Bug size={15} />
            </span>
            <h2 id="bug-report-title" className="text-sm font-semibold text-ink">
              Report a bug
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-ink-muted hover:bg-surface-muted hover:text-ink">
            <X size={17} />
          </button>
        </div>

        {sent ? (
          <div className="px-5 py-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Check size={20} />
            </div>
            <p className="text-sm font-medium text-ink">Thanks — it&apos;s been reported.</p>
            <p className="mt-1 text-xs text-ink-muted">It&apos;s on the Task List as a high-priority bug.</p>
            <button
              onClick={onClose}
              className="mt-5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              Done
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            onPaste={onPaste}
            className="space-y-4 px-5 py-4"
          >
            <div>
              <label htmlFor="bug-title" className="mb-1 block text-xs font-medium text-ink-secondary">
                What went wrong?
              </label>
              <input
                id="bug-title"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={140}
                placeholder="e.g. Export button does nothing on the Orders page"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-brand-700/10"
              />
            </div>

            <div>
              <label htmlFor="bug-details" className="mb-1 block text-xs font-medium text-ink-secondary">
                Details <span className="font-normal text-ink-subtle">— what you did, what you expected</span>
              </label>
              <textarea
                id="bug-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="Steps to reproduce, error messages…"
                className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-brand-700/10"
              />
            </div>

            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void attach(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              {shot ? (
                <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shot.url} alt="Attached screenshot" className="h-10 w-16 rounded object-cover ring-1 ring-line" />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-secondary">{shot.name}</span>
                  <button
                    type="button"
                    onClick={() => setShot(null)}
                    className="text-xs font-medium text-ink-muted hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-xs text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-60"
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                  {uploading ? "Attaching…" : "Attach a screenshot — or paste one (Ctrl+V)"}
                </button>
              )}
            </div>

            <p className="text-[11px] leading-relaxed text-ink-subtle">
              The page you&apos;re on, your screen size and browser are included automatically.
            </p>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || sending || uploading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-40"
              >
                {sending && <Loader2 size={13} className="animate-spin" />}
                {sending ? "Sending…" : "Send report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
