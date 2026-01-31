"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Plus } from "lucide-react";

import PlatformsTable from "./PlatformsTable";

export type CompanyPlatform = {
  id: string;
  name: string;
  purpose: string | null;
  login: string | null;
  login_url: string | null;
  access_method: string;
};

export default function PlatformsSection() {
  const [rows, setRows] = useState<CompanyPlatform[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data } = await supabase
      .from("company_platforms")
      .select("*")
      .order("name");

    setRows(data ?? []);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">
            Platforms & Technology
          </h2>
          <p className="mt-1 text-sm text-gray-500 max-w-xl">
            Tools and systems used by the company. Credentials are managed
            securely outside this system.
          </p>
        </div>

        <button className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm text-white">
          <Plus size={16} />
          Add Platform
        </button>
      </div>

      {/* Table */}
      <PlatformsTable rows={rows} loading={loading} />
    </div>
  );
}
