"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useBrand } from "@/components/BrandContext";
import DailySalesLogView from "@/components/dashboard/views/DailySalesLogView";
import { useDailySalesLog } from "@/components/dashboard/hooks/useDailySalesLog";

/** "YYYY-MM" for the current month. */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Shift a "YYYY-MM" key by N months. */
function shiftMonth(key: string, delta: number): string {
  const y = Number(key.slice(0, 4));
  const m0 = Number(key.slice(5, 7)) - 1;
  const d = new Date(y, m0 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Valid "YYYY-MM"? */
function isMonthKey(v: string | null): v is string {
  return !!v && /^\d{4}-\d{2}$/.test(v);
}

function monthTitle(key: string): string {
  const y = Number(key.slice(0, 4));
  const m0 = Number(key.slice(5, 7)) - 1;
  return new Date(y, m0, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function DailySalesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { brand } = useBrand();

  const cur = currentMonthKey();
  const raw = params.get("month");
  const month = isMonthKey(raw) && raw <= cur ? raw : cur;

  const { days, kpis, loading, error } = useDailySalesLog(brand, month);

  const go = (key: string) => router.push(`/dashboard/daily-sales?month=${key}`);
  const atCurrent = month >= cur;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      {/* Header */}
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft size={15} /> Back to dashboard
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Daily Sales Log</h1>
          <p className="mt-1 text-sm text-gray-500">{monthTitle(month)}</p>
        </div>

        {/* Month stepper */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          <button
            onClick={() => go(shiftMonth(month, -1))}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-800"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[7rem] px-2 text-center text-sm font-medium text-gray-700">
            {monthTitle(month)}
          </span>
          <button
            onClick={() => !atCurrent && go(shiftMonth(month, 1))}
            disabled={atCurrent}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <DailySalesLogView days={days} kpis={kpis} loading={loading} error={error} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 p-8 text-sm text-gray-400">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </div>
      }
    >
      <DailySalesPage />
    </Suspense>
  );
}
