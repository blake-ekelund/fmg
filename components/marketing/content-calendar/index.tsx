"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";

import { ContentItem, ViewMode } from "./types";
import type { Promotion } from "@/components/promotions/types";

import ViewToggle from "./ToggleView";
import CalendarView from "./CalendarView";
import TableView from "./TableView";
import MobileDayTable from "./MobileDayTable";
import SidePanel from "./SidePanel";
import AddContentModal from "./modal/AddContentModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

export default function MarketingContentSection() {
  const { brand } = useBrand();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [view, setView] = useState<ViewMode>("calendar");

  const [month, setMonth] = useState(new Date());

  const [addOpen, setAddOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<ContentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null);

  // Side panel state
  const [panelDate, setPanelDate] = useState<string | null>(null);

  useEffect(() => {
    load();
    loadPromotions();
  }, [brand]);

  async function load() {
    let q = supabase
      .from("marketing_content")
      .select("*")
      .order("publish_date");

    if (brand !== "all") {
      q = q.eq("brand", brand);
    }

    const { data } = await q;
    if (data) setItems(data);
  }

  async function loadPromotions() {
    // Only show promotions that have press_channels set (blog, social, or email)
    const { data } = await supabase
      .from("promotions")
      .select("*")
      .in("status", ["active", "scheduled"])
      .not("press_channels", "eq", "{}");

    if (data) setPromotions(data as Promotion[]);
  }

  const visibleItems = items;

  // Items for the selected panel date
  const panelItems = useMemo(() => {
    if (!panelDate) return [];
    return visibleItems.filter((i) => i.publish_date === panelDate);
  }, [visibleItems, panelDate]);

  // Upcoming items (next 14 days from today)
  const upcomingItems = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const twoWeeks = new Date(today);
    twoWeeks.setDate(today.getDate() + 14);

    const todayISO = today.toISOString().split("T")[0];
    const twoWeeksISO = twoWeeks.toISOString().split("T")[0];

    return visibleItems
      .filter((i) => i.publish_date >= todayISO && i.publish_date <= twoWeeksISO)
      .sort((a, b) => a.publish_date.localeCompare(b.publish_date));
  }, [visibleItems]);

  async function confirmDelete() {
    if (!deleteTarget) return;

    await supabase
      .from("marketing_content")
      .delete()
      .eq("id", deleteTarget.id);

    setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  function handleDayClick(dateISO: string) {
    setPanelDate(dateISO);
  }

  return (
    // The Marketing page already pads its tabs — no second gutter here.
    <div className="space-y-4">
      {/* Toolbar: month (calendar view) on the left, view + Add on the right */}
      <div className="flex flex-wrap items-center gap-3">
        {view === "calendar" && (
          <div className="hidden items-center gap-1 md:flex">
            <button
              onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-[150px] text-center text-base font-semibold text-gray-900">
              {month.toLocaleString("default", { month: "long", year: "numeric" })}
            </div>
            <button
              onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setMonth(new Date())}
              className="ml-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              Today
            </button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <button
            onClick={() => {
              setEditItem(null);
              setSelectedDate(panelDate);
              setAddOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
          >
            <Plus size={14} />
            Add content
          </button>
        </div>
      </div>

      {/* ─── MOBILE ─── */}
      <div className="md:hidden">
        <MobileDayTable
          items={visibleItems}
          onSelect={(item) => {
            setEditItem(item);
            setSelectedDate(item.publish_date);
            setAddOpen(true);
          }}
        />
      </div>

      {/* ─── DESKTOP: Calendar + Side Panel ─── */}
      <div className="hidden md:flex gap-4">
        {/* Calendar / Table area */}
        <div className="flex-1 min-w-0">
          {view === "calendar" && (
            <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <CalendarView
                month={month}
                items={visibleItems}
                promotions={promotions}
                onSelectDate={handleDayClick}
              />
            </div>
          )}

          {view === "table" && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <TableView
                items={visibleItems}
                onSelectItem={(item) => {
                  setEditItem(item);
                  setSelectedDate(null);
                  setAddOpen(true);
                }}
              />
            </div>
          )}
        </div>

        {/* Side Panel — always visible on desktop */}
        <SidePanel
          selectedDate={panelDate}
          items={panelItems}
          upcomingItems={upcomingItems}
          onAddNew={() => {
            setEditItem(null);
            setSelectedDate(panelDate);
            setAddOpen(true);
          }}
          onEditItem={(item) => {
            setEditItem(item);
            setAddOpen(true);
          }}
          onDeleteItem={setDeleteTarget}
          onClose={() => setPanelDate(null)}
        />
      </div>

      {/* Add / Edit Modal */}
      {addOpen && (
        <AddContentModal
          date={selectedDate}
          item={editItem}
          onClose={() => {
            setAddOpen(false);
            setSelectedDate(null);
            setEditItem(null);
          }}
          onSaved={() => {
            load();
            setAddOpen(false);
            setSelectedDate(null);
            setEditItem(null);
          }}
        />
      )}

      {/* Confirm Delete */}
      {deleteTarget && (
        <ConfirmDeleteModal
          title="Delete scheduled content?"
          description={`${deleteTarget.platform} — ${deleteTarget.content_type}`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
