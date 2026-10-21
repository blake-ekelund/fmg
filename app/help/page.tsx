"use client";

import { Suspense } from "react";
import HelpCenterPage from "@/components/help/HelpCenterPage";

export default function Page() {
  return (
    <Suspense>
      <HelpCenterPage />
    </Suspense>
  );
}
