import { X } from "lucide-react";

type Props = {
  part: string;
  displayName: string;
  fragrance?: string;
  onClose: () => void;
};

export function ModalHeader({
  part,
  displayName,
  fragrance,
  onClose,
}: Props) {
  return (
    <div className="border-b border-gray-100">
      <div className="flex items-start justify-between gap-4 px-4 py-4 md:px-8 md:py-5">
        {/* Title block */}
        <div className="min-w-0 space-y-0.5">
          <div className="text-xs font-mono text-gray-500 truncate">
            {part}
          </div>

          <h2 className="text-base md:text-lg font-semibold text-gray-900 truncate">
            {displayName}
          </h2>

          {fragrance && (
            <p className="text-sm text-gray-500 truncate">
              {fragrance}
            </p>
          )}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
