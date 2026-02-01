import { CheckCircle, Plus } from "lucide-react";

type Props = {
  label: string;
  present: boolean;
};

export function CopyBadge({ label, present }: Props) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium
        ${
          present
            ? "bg-yellow-50 text-gray-900 ring-1 ring-yellow-400/40"
            : "bg-gray-100 text-gray-400 ring-1 ring-gray-200"
        }
      `}
    >
      {present ? (
        <CheckCircle size={14} className="text-yellow-500" />
      ) : (
        <Plus size={14} className="text-gray-400" />
      )}
      {label}
    </div>
  );
}
