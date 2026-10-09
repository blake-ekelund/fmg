"use client";

import clsx from "clsx";

/**
 * Confirm dialog — used instead of window.confirm so every "are you sure"
 * looks the same and says plainly what will happen (social posts, blog posts).
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = "primary",
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={busy ? undefined : onCancel}>
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pb-2 pt-6">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {children && <div className="mt-2 text-[15px] leading-relaxed text-gray-600">{children}</div>}
        </div>
        <div className="flex justify-end gap-2 px-6 pb-6 pt-4">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className={clsx(
              "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60",
              tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-gray-900 hover:bg-gray-800",
            )}
          >
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
