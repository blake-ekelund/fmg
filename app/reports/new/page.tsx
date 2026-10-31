"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReportDetail from "@/components/reports/ReportDetail";

/** /reports/new?template=<key> — preview a starter report with live data, then save it. */
function NewReport() {
  const key = useSearchParams().get("template") ?? "";
  return <ReportDetail key={key} templateKey={key} />;
}

export default function NewReportPage() {
  return (
    <Suspense>
      <NewReport />
    </Suspense>
  );
}
