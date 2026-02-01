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
    <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-start">
      <div className="space-y-0.5">
        <div className="text-xs font-mono text-gray-500">
          {part}
        </div>
        <h2 className="text-lg font-semibold text-gray-900">
          {displayName}
        </h2>
        {fragrance && (
          <p className="text-sm text-gray-500">
            {fragrance}
          </p>
        )}
      </div>

      <button
        onClick={onClose}
        className="p-2 rounded-lg hover:bg-gray-100"
      >
        <X size={18} />
      </button>
    </div>
  );
}
