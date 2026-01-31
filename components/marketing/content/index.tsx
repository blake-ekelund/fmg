// /marketing/content/MarketingContentSection.tsx
"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

import { ContentItem, ViewMode } from "./types";
import ViewToggle from "./ViewToggle";
import CalendarView from "./CalendarView";
import TableView from "./TableView";
import AddContentModal from "./AddContentModal";
import DayModal from "./DayModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

export default function MarketingContentSection() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [view, setView] = useState<ViewMode>("calendar");
  const [month, setMonth] = useState(new Date());

  const [addOpen, setAddOpen] = useState(false);
  const [selectedDate, setSelectedDate] =
    useState<string | null>(null);
  const [editItem, setEditItem] =
    useState<ContentItem | null>(null);

  const [dayModalDate, setDayModalDate] =
    useState<string | null>(null);
  const [dayModalItems, setDayModalItems] =
    useState<ContentItem[]>([]);

  const [deleteTarget, setDeleteTarget] =
    useState<ContentItem | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("marketing_content")
      .select("*")
      .order("publish_date");

    setItems(data ?? []);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    await supabase
      .from("marketing_content")
      .delete()
      .eq("id", deleteTarget.id);

    // Optimistic local update
    setItems((prev) =>
      prev.filter((i) => i.id !== deleteTarget.id)
    );

    // Keep DayModal in sync
    if (dayModalDate) {
      setDayModalItems((prev) =>
        prev.filter((i) => i.id !== deleteTarget.id)
      );
    }

    setDeleteTarget(null);
  }

  return (
    <section className="rounded-2xl border border-gray-200 p-6 space-y-6 bg-white">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">
          Content Calendar
        </h2>

        <ViewToggle view={view} onChange={setView} />
      </div>

      {/* Month Toggle — Calendar only */}
      {view === "calendar" && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() =>
              setMonth(
                (m) =>
                  new Date(
                    m.getFullYear(),
                    m.getMonth() - 1,
                    1
                  )
              )
            }
            className="h-8 w-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="text-sm font-medium text-gray-700 min-w-[140px] text-center">
            {month.toLocaleString("default", {
              month: "long",
              year: "numeric",
            })}
          </div>

          <button
            onClick={() =>
              setMonth(
                (m) =>
                  new Date(
                    m.getFullYear(),
                    m.getMonth() + 1,
                    1
                  )
              )
            }
            className="h-8 w-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Calendar View */}
      {view === "calendar" && (
        <CalendarView
          month={month}
          items={items}
          onSelectDate={(dateISO) => {
            setDayModalDate(dateISO);
            setDayModalItems(
              items.filter(
                (i) => i.publish_date === dateISO
              )
            );
          }}
        />
      )}

      {/* Table View */}
      {view === "table" && (
        <TableView
          items={items}
          onSelectItem={(item) => {
            setEditItem(item);
            setSelectedDate(null);
            setAddOpen(true);
          }}
        />
      )}

      {/* Day Modal */}
      {dayModalDate && (
        <DayModal
          date={dayModalDate}
          items={dayModalItems}
          onAddNew={() => {
            setSelectedDate(dayModalDate);
            setEditItem(null);
            setDayModalDate(null);
            setAddOpen(true);
          }}
          onSelectItem={(item) => {
            setEditItem(item);
            setDayModalDate(null);
            setAddOpen(true);
          }}
          onDeleteItem={(item) => setDeleteTarget(item)}
          onClose={() => setDayModalDate(null)}
        />
      )}

      {/* Add / Edit Modal */}
      {addOpen && (
        <AddContentModal
          date={selectedDate}
          item={editItem}
          onBack={() => {
            setAddOpen(false);
            setEditItem(null);
            if (selectedDate) {
              setDayModalDate(selectedDate);
              setDayModalItems(
                items.filter(
                  (i) =>
                    i.publish_date === selectedDate
                )
              );
            }
          }}
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

      {/* Confirm Delete Modal */}
      {deleteTarget && (
        <ConfirmDeleteModal
          title="Delete scheduled content?"
          description={`${deleteTarget.platform} — ${deleteTarget.content_type}`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </section>
  );
}
