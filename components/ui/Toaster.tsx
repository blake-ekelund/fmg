"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import clsx from "clsx";
import { dismissToast, useToasts, type Toast } from "@/lib/toast";

/** Corner stack for lib/toast.ts. Mounted once in the LayoutShell. */
export default function Toaster() {
  const toasts = useToasts();
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

const AUTO_CLOSE_MS = 7000;

function ToastCard({ toast: t }: { toast: Toast }) {
  const router = useRouter();
  const sticky = t.sticky || t.tone === "working";

  useEffect(() => {
    if (sticky) return;
    const timer = setTimeout(() => dismissToast(t.id), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [sticky, t.id, t.title]);

  return (
    <div className="pointer-events-auto flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
      <span
        className={clsx(
          "mt-0.5 shrink-0",
          t.tone === "success" && "text-green-600",
          t.tone === "error" && "text-red-600",
          t.tone === "info" && "text-gray-500",
          t.tone === "working" && "text-gray-400",
        )}
      >
        {t.tone === "success" ? (
          <CheckCircle2 size={18} />
        ) : t.tone === "error" ? (
          <AlertTriangle size={18} />
        ) : t.tone === "working" ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Info size={18} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{t.title}</p>
        {t.body && <p className="mt-0.5 text-xs text-gray-600">{t.body}</p>}
        {t.action && (
          <button
            onClick={() => {
              dismissToast(t.id);
              t.action!.run((href) => router.push(href));
            }}
            className="mt-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
          >
            {t.action.label}
          </button>
        )}
      </div>
      <button onClick={() => dismissToast(t.id)} className="-mr-1 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
        <X size={14} />
      </button>
    </div>
  );
}
