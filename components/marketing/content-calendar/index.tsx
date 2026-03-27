"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";

import { ContentItem, ViewMode } from "./types";

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
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content Calendar</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Plan and schedule content across all channels.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <button
            onClick={() => {
              setEditItem(null);
              setSelectedDate(panelDate);
              setAddOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition"
          >
            <Plus size={14} />
            Add Content
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
            <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
              {/* Month navigation */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() =>
                    setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                  }
                  className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition"
                >
                  <ChevronLeft size={18} className="text-gray-500" />
                </button>
                <div className="text-sm font-semibold text-gray-700 min-w-[160px] text-center">
                  {month.toLocaleString("default", {
                    month: "long",
                    year: "numeric",
                  })}
                </div>
                <button
                  onClick={() =>
                    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                  }
                  className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition"
                >
                  <ChevronRight size={18} className="text-gray-500" />
                </button>
              </div>

              <CalendarView
                month={month}
                items={visibleItems}
                onSelectDate={handleDayClick}
              />
            </div>
          )}

          {view === "table" && (
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
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
