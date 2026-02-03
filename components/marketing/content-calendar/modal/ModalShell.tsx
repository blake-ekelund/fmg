"use client";

import { ArrowLeft, X } from "lucide-react";

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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="
          relative
          w-full
          md:max-w-lg
          bg-white
          rounded-t-2xl md:rounded-2xl
          shadow-xl
          ring-1 ring-gray-200
          h-[85vh] md:h-[90vh]
          max-h-[85vh] md:max-h-[90vh]
          flex flex-col
          overflow-hidden
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (fixed) */}
        <div
          className="
            px-5 md:px-6
            pt-4 md:pt-6
            pb-3
            flex items-center gap-3
            shrink-0
            border-b border-gray-100
            bg-white
            sticky top-0 z-10
          "
        >
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-black"
            >
              <ArrowLeft size={16} />
            </button>
          )}

          <h3 className="text-lg font-medium flex-1 truncate">
            {title}
          </h3>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-black"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div
          className="
            flex-1
            overflow-y-auto
            px-5 md:px-6
            pt-4
            pb-6
          "
        >
          {children}
        </div>

        {/* Footer (fixed) */}
        <div
          className="
            px-5 md:px-6
            py-4
            border-t border-gray-100
            shrink-0
            bg-white
            sticky bottom-0
          "
        >
          {footer}
        </div>
      </div>
    </div>
  );
}
