import { Brand } from "../../types";

const BRAND_OPTIONS: Brand[] = ["NI", "Sassy"];

type Props = {
  brands: Brand[];
  onToggle: (b: Brand) => void;
  locked?: boolean;
};

export function BrandSelector({
  brands,
  onToggle,
  locked,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-700">
        Brand
      </div>

      <div className="flex gap-2 flex-wrap">
        {BRAND_OPTIONS.map((b) => {
          const active = brands.includes(b);

          return (
            <button
              key={b}
              type="button"
              disabled={locked}
              onClick={() => onToggle(b)}
              className={`
                px-3 py-1.5 rounded-lg text-sm font-medium
                transition
                ${
                  active
                    ? "bg-gray-900 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }
                ${locked ? "opacity-50 cursor-not-allowed" : ""}
              `}
            >
              {b}
            </button>
          );
        })}
      </div>

      {!locked && (
        <p className="text-xs text-gray-500">
          Selecting multiple brands creates one item per brand.
        </p>
      )}
    </div>
  );
}
