"use client";

import { motion } from "framer-motion";
import clsx from "clsx";

type Segment =
  | "all"
  | "current"
  | "sixMonths"
  | "oneYear"
  | "churned";

export default function CustomersHeader({
  segment,
  setSegment,
}: {
  segment: Segment;
  setSegment: (s: Segment) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.3 }}
      className="border-b border-slate-200 pb-3"
    >
      <div className="flex items-end justify-between">

        {/* Left: Title + Tabs */}
        <div className="flex items-end gap-8">

          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Customers
          </h1>

        </div>

      </div>
    </motion.div>
  );
}

