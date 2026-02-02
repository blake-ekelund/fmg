import { PhotoAsset } from "@/types/photoShare";

type Props = {
  assets: PhotoAsset[];
  onSelect: (asset: PhotoAsset) => void;
};

export default function PhotoTable({ assets, onSelect }: Props) {
  return (
    <>
      {/* =========================
          MOBILE: stacked cards
         ========================= */}
      <div className="md:hidden space-y-3">
        {assets.map((a) => (
          <div
            key={a.id}
            onClick={() => onSelect(a)}
            className="
              flex items-center gap-4
              p-4
              rounded-2xl
              border border-gray-200
              bg-white
              cursor-pointer
              transition
              hover:bg-gray-50
            "
          >
            <img
              src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/marketing-photo-share/${a.file_path}`}
              alt={a.title}
              className="h-14 w-14 rounded-xl object-cover border border-gray-200 shrink-0"
            />

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-gray-900 truncate">
                  {a.title}
                </h3>

                <span
                  className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    a.allow_third_party_use
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {a.allow_third_party_use ? "Approved" : "Internal"}
                </span>
              </div>

              {a.description && (
                <p className="text-sm text-gray-500 line-clamp-2">
                  {a.description}
                </p>
              )}

              <p className="text-xs text-gray-400">
                Uploaded {new Date(a.uploaded_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* =========================
          DESKTOP: table
         ========================= */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/60">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-gray-600">
                Image
              </th>
              <th className="px-5 py-3 text-left font-medium text-gray-600">
                Title
              </th>
              <th className="px-5 py-3 text-left font-medium text-gray-600">
                Description
              </th>
              <th className="px-5 py-3 text-left font-medium text-gray-600">
                3rd Party
              </th>
              <th className="px-5 py-3 text-left font-medium text-gray-600">
                Uploaded
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {assets.map((a) => (
              <tr
                key={a.id}
                onClick={() => onSelect(a)}
                className="
                  cursor-pointer
                  transition
                  hover:bg-gray-50/70
                  focus-within:bg-gray-50
                "
              >
                <td className="px-5 py-4">
                  <img
                    src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/marketing-photo-share/${a.file_path}`}
                    alt={a.title}
                    className="h-12 w-12 rounded-xl object-cover border border-gray-200"
                  />
                </td>

                <td className="px-5 py-4 font-medium text-gray-900">
                  {a.title}
                </td>

                <td className="px-5 py-4 text-gray-500 max-w-md truncate">
                  {a.description || "—"}
                </td>

                <td className="px-5 py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      a.allow_third_party_use
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {a.allow_third_party_use ? "Approved" : "Internal"}
                  </span>
                </td>

                <td className="px-5 py-4 text-gray-500">
                  {new Date(a.uploaded_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
