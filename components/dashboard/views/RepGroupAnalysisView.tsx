"use client";

import Link from "next/link";
import type { RepGroupRow } from "../hooks/useDashboardRepGroups";

type Props = {
  groups: RepGroupRow[];
  loading: boolean;
};

export default function RepGroupAnalysisView({ groups, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <span className="text-sm font-medium">No rep groups found</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 py-2 pr-4">Group</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 py-2 pr-4">Contact</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 py-2 pr-4">Territory</th>
              <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400 py-2">Commission</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-2 pr-4 font-medium text-gray-800">{g.name}</td>
                <td className="py-2 pr-4 text-gray-600">{g.contact_name}</td>
                <td className="py-2 pr-4 text-gray-600">{g.territory}</td>
                <td className="py-2 text-right tabular-nums text-gray-700">{g.commission_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pt-2 border-t border-gray-100">
        <Link href="/rep-groups" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          View rep groups
        </Link>
      </div>
    </div>
  );
}
