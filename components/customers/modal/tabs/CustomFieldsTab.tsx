"use client";

import type { CustomField } from "../hooks/useCustomerCustomFields";

export default function CustomFieldsTab({
  fields,
  loading,
}: {
  fields: CustomField[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="text-sm text-gray-400 py-8">Loading custom fields...</div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <div className="text-sm text-gray-400">
          No custom fields found for this customer.
        </div>
        <div className="text-xs text-gray-300 mt-1">
          Custom fields will appear here after uploading sales data that includes them.
        </div>
      </div>
    );
  }

  // Hide fields shown elsewhere (territory fields are in Contact section)
  const CONTACT_FIELDS = new Set([
    "Territory Agency",
    "Territory Code",
    "Territory Sales Rep Name",
  ]);

  const visible = fields.filter((f) => !CONTACT_FIELDS.has(f.name));

  // Group fields: ones with values first, empty ones second
  const withValue = visible.filter((f) => f.value.trim() !== "");
  const empty = visible.filter((f) => f.value.trim() === "");

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-2.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                Field
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                Value
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {withValue.map((f) => (
              <tr key={f.key} className="hover:bg-gray-50/50 transition">
                <td className="px-4 py-3 text-gray-600 font-medium">
                  {f.name}
                </td>
                <td className="px-4 py-3 text-gray-900 font-mono text-xs">
                  {f.value}
                </td>
              </tr>
            ))}
            {empty.map((f) => (
              <tr key={f.key} className="hover:bg-gray-50/50 transition">
                <td className="px-4 py-3 text-gray-400">
                  {f.name}
                </td>
                <td className="px-4 py-3 text-gray-300 italic text-xs">
                  —
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
