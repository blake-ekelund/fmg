"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Clock,
  Package,
  Users,
  FileText,
  Hash,
  TrendingDown,
  CheckCircle2,
} from "lucide-react";

type AlertChip = {
  icon: React.ReactNode;
  label: string;
  count: number;
  href: string;
  color: string;
};

type Props = {
  overdueTaskCount: number;
  stockAlertCount: number;
  wsAtRiskCount: number;
  d2cAtRiskCount: number;
  blogReviewCount: number;
  socialReviewCount: number;
  salesVariance: number;
  loading: boolean;
};

export default function AttentionNeededBanner({
  overdueTaskCount,
  stockAlertCount,
  wsAtRiskCount,
  d2cAtRiskCount,
  blogReviewCount,
  socialReviewCount,
  salesVariance,
  loading,
}: Props) {
  if (loading) {
    return (
      <div className="h-12 rounded-xl bg-gray-50 animate-pulse" />
    );
  }

  const chips: AlertChip[] = [];

  if (overdueTaskCount > 0) {
    chips.push({
      icon: <Clock size={13} />,
      label: `${overdueTaskCount} overdue task${overdueTaskCount > 1 ? "s" : ""}`,
      count: overdueTaskCount,
      href: "#widget-tasks",
      color: "bg-red-50 text-red-700 border-red-200",
    });
  }

  if (stockAlertCount > 0) {
    chips.push({
      icon: <Package size={13} />,
      label: `${stockAlertCount} stock alert${stockAlertCount > 1 ? "s" : ""}`,
      count: stockAlertCount,
      href: "#widget-inventory",
      color: "bg-amber-50 text-amber-700 border-amber-200",
    });
  }

  if (wsAtRiskCount > 0) {
    chips.push({
      icon: <Users size={13} />,
      label: `${wsAtRiskCount} wholesale at-risk`,
      count: wsAtRiskCount,
      href: "#widget-wholesale",
      color: "bg-orange-50 text-orange-700 border-orange-200",
    });
  }

  if (d2cAtRiskCount > 0) {
    chips.push({
      icon: <Users size={13} />,
      label: `${d2cAtRiskCount} D2C at-risk`,
      count: d2cAtRiskCount,
      href: "#widget-d2c",
      color: "bg-orange-50 text-orange-700 border-orange-200",
    });
  }

  if (blogReviewCount > 0) {
    chips.push({
      icon: <FileText size={13} />,
      label: `${blogReviewCount} blog${blogReviewCount > 1 ? "s" : ""} in review`,
      count: blogReviewCount,
      href: "#widget-content",
      color: "bg-purple-50 text-purple-700 border-purple-200",
    });
  }

  if (socialReviewCount > 0) {
    chips.push({
      icon: <Hash size={13} />,
      label: `${socialReviewCount} social post${socialReviewCount > 1 ? "s" : ""} in review`,
      count: socialReviewCount,
      href: "#widget-content",
      color: "bg-pink-50 text-pink-700 border-pink-200",
    });
  }

  if (salesVariance < -500) {
    chips.push({
      icon: <TrendingDown size={13} />,
      label: `Sales down $${Math.abs(Math.round(salesVariance)).toLocaleString()} YTD`,
      count: 1,
      href: "#widget-sales",
      color: "bg-rose-50 text-rose-700 border-rose-200",
    });
  }

  // All clear — show nothing (zero noise)
  if (chips.length === 0) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3"
        >
          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
          <span className="text-sm text-emerald-700 font-medium">
            All clear — nothing needs your attention right now
          </span>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl bg-gradient-to-r from-amber-50 to-red-50 border border-amber-200/60 px-4 py-3"
      >
        <div className="flex items-center gap-2 mb-2.5">
          <AlertTriangle size={15} className="text-amber-500 shrink-0" />
          <span className="text-sm font-semibold text-gray-800">
            Needs Attention
          </span>
          <span className="text-xs text-gray-400">
            ({chips.length} item{chips.length > 1 ? "s" : ""})
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <a
              key={chip.label}
              href={chip.href}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all hover:shadow-sm hover:-translate-y-px ${chip.color}`}
            >
              {chip.icon}
              {chip.label}
            </a>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
