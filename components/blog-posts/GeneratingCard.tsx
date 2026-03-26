"use client";

import { motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import clsx from "clsx";

type Props = {
  title: string;
  brand: "NI" | "Sassy";
};

export default function GeneratingCard({ title, brand }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-purple-50 rounded-lg border border-purple-200 px-3 py-2.5 pointer-events-none"
    >
      {/* Shimmer bar */}
      <div className="relative h-1 rounded-full bg-purple-100 overflow-hidden mb-2.5">
        <motion.div
          className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-purple-400"
          animate={{ left: ["0%", "67%", "0%"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Title */}
      <div className="flex items-start gap-1.5">
        <Sparkles size={13} className="shrink-0 mt-0.5 text-purple-400" />
        <h4 className="text-[13px] font-medium text-purple-700 leading-snug line-clamp-2 flex-1">
          {title}
        </h4>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-1.5 mt-2">
        <span
          className={clsx(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded",
            brand === "NI" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600"
          )}
        >
          {brand}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-purple-500 ml-auto">
          <Loader2 size={10} className="animate-spin" />
          Generating…
        </span>
      </div>
    </motion.div>
  );
}
