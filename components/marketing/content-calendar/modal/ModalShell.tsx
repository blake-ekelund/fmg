import { ArrowLeft } from "lucide-react";

type Props = {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
};

export function ModalShell({
  title,
  onClose,
  onBack,
  children,
  footer,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="
          relative w-full max-w-lg
          rounded-2xl bg-white shadow-xl ring-1 ring-gray-200
          h-[80vh] max-h-[80vh]
          flex flex-col
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (fixed) */}
        <div className="px-6 pt-6 flex items-center gap-2 shrink-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-gray-500 hover:text-black"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <h3 className="text-lg font-medium">{title}</h3>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 px-6 pt-4">
          {children}
        </div>

        {/* Footer (fixed) */}
        <div className="px-6 pb-6 pt-4 border-t border-gray-100 shrink-0">
          {footer}
        </div>
      </div>
    </div>
  );
}
