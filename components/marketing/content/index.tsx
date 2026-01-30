// /marketing/content/MarketingContentSection.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { ContentItem, ViewMode } from "./types";
import ViewToggle from "./ViewToggle";
import CalendarView from "./CalendarView";
import TableView from "./TableView";
import AddContentModal from "./AddContentModal";
import DayModal from "./DayModal";

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

  return (
    <section className="border border-gray-200 rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">
          Content Calendar
        </h2>

        <ViewToggle view={view} onChange={setView} />
      </div>

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
    </section>
  );
}
