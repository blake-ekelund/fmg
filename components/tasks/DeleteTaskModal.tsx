"use client";

type Props = {
  open: boolean;
  taskName?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteTaskModal({
  open,
  taskName,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onCancel}
      />

      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-medium">Delete task</h2>
        </div>

        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-gray-600">
            You’re about to permanently delete:
          </p>

          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium">
            {taskName}
          </div>

          <p className="text-sm text-gray-500">
            This action cannot be undone.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-between">
          <button
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Delete task
          </button>
        </div>
      </div>
    </div>
  );
}
