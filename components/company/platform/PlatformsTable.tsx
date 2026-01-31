import { MoreHorizontal } from "lucide-react";
import { CompanyPlatform } from "./PlatformsSection";

export default function PlatformsTable({
  rows,
  loading,
}: {
  rows: CompanyPlatform[];
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="px-4 py-3 text-left font-medium">
              Name
            </th>
            <th className="px-4 py-3 text-left font-medium">
              Purpose
            </th>
            <th className="px-4 py-3 text-left font-medium">
              Login
            </th>
            <th className="px-4 py-3 text-left font-medium">
              Access
            </th>
            <th className="px-4 py-3 text-left font-medium">
              URL
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>

        <tbody>
          {loading && (
            <tr>
              <td
                colSpan={6}
                className="px-4 py-6 text-center text-gray-500"
              >
                Loading platforms…
              </td>
            </tr>
          )}

          {!loading && rows.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="px-4 py-6 text-center text-gray-500"
              >
                No platforms added yet
              </td>
            </tr>
          )}

          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-t border-gray-100 hover:bg-gray-50"
            >
              <td className="px-4 py-3 font-medium">
                {r.name}
              </td>
              <td className="px-4 py-3">
                {r.purpose ?? "—"}
              </td>
              <td className="px-4 py-3">
                {r.login ?? "—"}
              </td>
              <td className="px-4 py-3">
                {r.access_method}
              </td>
              <td className="px-4 py-3">
                {r.login_url ? (
                  <a
                    href={r.login_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Open
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <button className="text-gray-400 hover:text-black">
                  <MoreHorizontal size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
