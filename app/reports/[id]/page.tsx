"use client";

import { Suspense, use } from "react";
import ReportDetail from "@/components/reports/ReportDetail";

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <ReportDetail id={id} />
    </Suspense>
  );
}
