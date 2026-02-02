import { Platform } from "../../types";

const PLATFORM_OPTIONS: Platform[] = [
  "Instagram",
  "Facebook",
  "TikTok",
  "Blog",
];

type Props = {
  platforms: Platform[];
  onToggle: (p: Platform) => void;
  locked?: boolean;
};

export function PlatformSelector({
  platforms,
  onToggle,
  locked,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-700">
        Platform
      </div>

      <div className="flex gap-2 flex-wrap">
        {PLATFORM_OPTIONS.map((p) => {
          const active = platforms.includes(p);

          return (
            <button
              key={p}
              type="button"
              disabled={locked}
              onClick={() => onToggle(p)}
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
              {p}
            </button>
          );
        })}
      </div>

      {!locked && (
        <p className="text-xs text-gray-500">
          A separate content item will be created for each platform.
        </p>
      )}
    </div>
  );
}
