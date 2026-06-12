"use client";

import { use } from "react";
import CompetitorForm from "@/components/marketing/competitors/CompetitorForm";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CompetitorForm id={id} />;
}
