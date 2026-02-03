"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

import {
  ContentItem,
  ViewMode,
  BrandView,
} from "./types";

import ViewToggle from "./ToggleView";
import BrandToggle from "./ToggleBrand";
import CalendarView from "./CalendarView";
import TableView from "./TableView";
import MobileDayTable from "./MobileDayTable";
import AddContentModal from "./modal/AddContentModal";
import DayModal from "./DayModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

export default function MarketingContentSection() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [view, setView] = useState<ViewMode>("calendar");
  const [brandView, setBrandView] =
    useState<BrandView>("all");

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

    if (data) setItems(data);
  }

  /* ---------------------------------------------
     Brand-filtered items
  --------------------------------------------- */
  const visibleItems = useMemo(() => {
    if (brandView === "all") return items;
    return items.filter(
      (i) => i.brand === brandView
    );
  }, [items, brandView]);

  async function confirmDelete() {
    if (!deleteTarget) return;

    await supabase
      .from("marketing_content")
      .delete()
      .eq("id", deleteTarget.id);

    setItems((prev) =>
      prev.filter((i) => i.id !== deleteTarget.id)
    );

    if (dayModalDate) {
      setDayModalItems((prev) =>
        prev.filter((i) => i.id !== deleteTarget.id)
      );
    }

    setDeleteTarget(null);
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-medium">
          Content Calendar
        </h2>

        <div className="flex items-center justify-between md:justify-end gap-3">
          <BrandToggle
            brand={brandView}
            onChange={setBrandView}
          />

          {/* Desktop only */}
          <ViewToggle
            view={view}
            onChange={setView}
          />
        </div>
      </div>

      {/* ---------------- MOBILE ---------------- */}
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

      {/* ---------------- DESKTOP ---------------- */}
      <div className="hidden md:block space-y-6">
        {/* Month toggle */}
        {view === "calendar" && (
          <div className="flex items-center justify-center gap-4">
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
              className="h-8 w-8 rounded-full hover:bg-gray-100"
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
              className="h-8 w-8 rounded-full hover:bg-gray-100"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* Calendar */}
        {view === "calendar" && (
          <CalendarView
            month={month}
            items={visibleItems}
            onSelectDate={(dateISO) => {
              setDayModalDate(dateISO);
              setDayModalItems(
                visibleItems.filter(
                  (i) =>
                    i.publish_date === dateISO
                )
              );
            }}
          />
        )}

        {/* Table */}
        {view === "table" && (
          <TableView
            items={visibleItems}
            onSelectItem={(item) => {
              setEditItem(item);
              setSelectedDate(null);
              setAddOpen(true);
            }}
          />
        )}
      </div>

      {/* Day modal — DESKTOP ONLY */}
      {dayModalDate && (
        <div className="hidden md:block">
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
            onDeleteItem={(item) =>
              setDeleteTarget(item)
            }
            onClose={() =>
              setDayModalDate(null)
            }
          />
        </div>
      )}

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
          onCancel={() =>
            setDeleteTarget(null)
          }
          onConfirm={confirmDelete}
        />
      )}
    </section>
  );
}
