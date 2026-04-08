"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useUser } from "@/components/UserContext";
import { useBrand } from "@/components/BrandContext";
import { useDashboardSales } from "./hooks/useDashboardSales";
import {
  Plus,
  ListTodo,
  Sparkles,
  CalendarPlus,
  X,
} from "lucide-react";
import { AddTaskModal } from "@/components/tasks/AddTaskModal";
import GeneratePostModal from "@/components/blog-posts/GeneratePostModal";
import GenerateSocialPostModal from "@/components/social-media/GenerateSocialPostModal";
import ContentCategory from "./categories/ContentCategory";
import InventoryCategory from "./categories/InventoryCategory";
import PromotionsCategory from "./categories/PromotionsCategory";
import AssetLibraryCategory from "./categories/AssetLibraryCategory";
import WorkflowCategory from "./categories/WorkflowCategory";
import WholesaleCategory from "./categories/WholesaleCategory";
import D2CCategory from "./categories/D2CCategory";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/* ─── Stagger animation variants ─── */
const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

/* ─── Quick-create action types ─── */
type ActionModal =
  | null
  | "task"
  | "blog-ai"
  | "social-ai";

/* ─── Floating Action Button ─── */
function FloatingActionButton({
  onAction,
}: {
  onAction: (modal: ActionModal) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const items = [
    { key: "task" as const, icon: <ListTodo size={15} />, label: "New Task", color: "text-blue-600 bg-blue-50" },
    { key: "blog-ai" as const, icon: <Sparkles size={15} />, label: "AI Blog Post", color: "text-violet-600 bg-violet-50" },
    { key: "social-ai" as const, icon: <Sparkles size={15} />, label: "AI Social Post", color: "text-rose-600 bg-rose-50" },
  ];

  return (
    <div ref={menuRef} className="fixed bottom-6 right-6 z-50">
      {/* Dropdown menu */}
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 10 }}
          transition={{ duration: 0.15 }}
          className="absolute bottom-16 right-0 w-48 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden"
        >
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setOpen(false);
                onAction(item.key);
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className={`p-1.5 rounded-lg ${item.color}`}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}

          <div className="border-t border-gray-100">
            <a
              href="/task-list"
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
            >
              <span className="p-1.5 rounded-lg bg-gray-50 text-gray-400">
                <ListTodo size={15} />
              </span>
              Task Board
            </a>
            <a
              href="/content-calendar"
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
            >
              <span className="p-1.5 rounded-lg bg-gray-50 text-gray-400">
                <CalendarPlus size={15} />
              </span>
              Content Calendar
            </a>
          </div>
        </motion.div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
          open
            ? "bg-gray-800 text-white rotate-45"
            : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-xl"
        }`}
      >
        {open ? <X size={22} /> : <Plus size={24} />}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Main Page — Zoned Layout
   Zone A: Header (greeting + summary sentence)
   Zone B: Primary row — Wholesale | D2C (2-col on lg)
   Zone C: Secondary row — Content | Inventory (2-col on lg)
   Zone D: Reference — Promotions, Assets, Workflows (collapsed)
   + Floating Action Button (bottom-right)
   ═══════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { profile } = useUser();
  const { brand } = useBrand();
  const [activeModal, setActiveModal] = useState<ActionModal>(null);

  // ── Minimal data for summary sentence ──
  const { kpis: salesKpis, loading: salesLoading } = useDashboardSales(brand);

  const greeting = getGreeting();
  const todayStr = formatToday();

  const closeModal = () => setActiveModal(null);

  // Summary sentence
  const summaryParts: string[] = [];
  if (!salesLoading && salesKpis.total_variance !== 0) {
    const dir = salesKpis.total_variance > 0 ? "up" : "down";
    summaryParts.push(
      `Sales ${dir} ${fmt(Math.abs(salesKpis.total_variance))} YTD`
    );
  }

  return (
    <>
      <motion.div
        className="px-4 md:px-8 py-6 md:py-8 space-y-6 scroll-smooth"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* ═══ Zone A: Header ═══ */}
        <motion.div variants={itemVariants}>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}
            {profile?.first_name ? `, ${profile.first_name}` : ""}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{todayStr}</p>
          {summaryParts.length > 0 && (
            <p className="text-sm text-gray-500 mt-2">{summaryParts.join(". ")}.</p>
          )}
        </motion.div>

        {/* ═══ Zone B: Primary — Wholesale | D2C ═══ */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start"
        >
          <WholesaleCategory />
          <D2CCategory />
        </motion.div>

        {/* ═══ Zone C: Secondary — Content | Promotions ═══ */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start"
        >
          <ContentCategory />
          <PromotionsCategory />
        </motion.div>

        {/* ═══ Zone D: Reference — collapsed by default ═══ */}
        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-3 mb-4 mt-2">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              More
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <div className="space-y-4">
            <InventoryCategory />
            <AssetLibraryCategory />
            <WorkflowCategory />
          </div>
        </motion.div>
      </motion.div>

      {/* ─── Floating Action Button ─── */}
      <FloatingActionButton onAction={setActiveModal} />

      {/* ─── Modals ─── */}
      <AddTaskModal
        open={activeModal === "task"}
        onClose={closeModal}
        onSaved={closeModal}
      />

      <GeneratePostModal
        open={activeModal === "blog-ai"}
        onClose={closeModal}
        onGenerated={closeModal}
      />

      <GenerateSocialPostModal
        open={activeModal === "social-ai"}
        onClose={closeModal}
        onGenerated={closeModal}
      />
    </>
  );
}
