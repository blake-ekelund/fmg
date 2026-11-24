import { X } from "lucide-react";

type Props = {
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteConfirmModal({
  loading,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="text-gray-700" size={18} />
          </div>
          <h3 className="text-sm font-semibold">
            Remove image from this product?
          </h3>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          The image comes off this product only. It stays in the
          Image Library, where it can be reused or deleted.
        </p>

        <div className="flex justify-end gap-3">
          <button
            className="px-4 py-2 text-sm rounded-xl hover:bg-gray-100"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm rounded-xl bg-gray-900 text-white hover:bg-gray-700"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
