import { Check, X } from "lucide-react";
import { PhotoAsset } from "@/types/photoShare";

type Props = {
  assets: PhotoAsset[];
  onSelect: (asset: PhotoAsset) => void;
};

export default function PhotoGrid({ assets, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {assets.map((a) => (
        <div
          key={a.id}
          onClick={() => onSelect(a)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              onSelect(a);
            }
          }}
          className="
            group
            cursor-pointer
            rounded-2xl
            bg-white
            border border-gray-200
            shadow-sm
            overflow-hidden
            transition
            hover:shadow-md
            focus:outline-none
            focus:ring-2
            focus:ring-gray-300
          "
        >
          {/* Image */}
          <div className="relative aspect-[4/3] bg-gray-50">
            <img
              src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/marketing-photo-share/${a.file_path}`}
              alt={a.title}
              className="
                absolute inset-0
                h-full w-full
                object-cover
                transition
                group-hover:scale-[1.02]
              "
              loading="lazy"
            />
          </div>

          {/* Meta */}
          <div className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-gray-900 truncate">
                {a.title}
              </h3>

              {a.allow_third_party_use ? (
                <Check
                  size={16}
                  className="text-emerald-600 shrink-0"
                />
              ) : (
                <X
                  size={16}
                  className="text-gray-400 shrink-0"
                />
              )}
            </div>

            {a.description && (
              <p className="text-sm text-gray-500 line-clamp-2">
                {a.description}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
