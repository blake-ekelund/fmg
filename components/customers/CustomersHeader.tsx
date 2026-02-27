"use client";

import { motion } from "framer-motion";
import { Download } from "lucide-react";

export type CustomersHeaderStats = {
  active: number;
  atRisk: number;
  churned: number;
};

export default function CustomersHeader({
  stats,
  onDownload,
}: {
  stats: CustomersHeaderStats;
  onDownload: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.3 }}
      className="border-b border-gray-200 pb-3"
    >
      <div className="flex items-center justify-between">

        {/* Left */}
        <div className="flex items-end gap-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Customers
          </h1>
        </div>

        {/* Right */}
        <div className="flex items-center gap-10">

          {/* Stats */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.08 } },
            }}
            className="flex gap-8"
          >
            <HeaderStat
              label="Active"
              value={stats.active.toLocaleString()}
            />
            <HeaderStat
              label="At Risk"
              value={stats.atRisk.toLocaleString()}
              subtleWarning
            />
            <HeaderStat
              label="Churned"
              value={stats.churned.toLocaleString()}
            />
          </motion.div>

          {/* Download Button */}
          <button
            onClick={onDownload}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium 
                       bg-white border border-slate-200 rounded-xl
                       hover:bg-slate-50 transition shadow-sm"
          >
            <Download size={16} />
            Download
          </button>

        </div>
      </div>
    </motion.div>
  );
}
/* ------------------------------------------- */

function HeaderStat({
  label,
  value,
  subtleWarning,
}: {
  label: string;
  value: string;
  subtleWarning?: boolean;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 6 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.25 }}
      className="text-right text-xs space-y-1"
    >
      <div className="text-gray-500">{label}</div>

      <div
        className={`font-medium ${
          subtleWarning ? "text-amber-600" : "text-gray-800"
        }`}
      >
        {value}
      </div>
    </motion.div>
  );
}