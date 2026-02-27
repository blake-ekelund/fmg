// /modal/components/ModalShell.tsx
"use client";

import { motion } from "framer-motion";

export default function ModalShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="bg-white w-full max-w-6xl h-[650px] rounded-3xl shadow-2xl border border-slate-200/60 overflow-hidden flex"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}