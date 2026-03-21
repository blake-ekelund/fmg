"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Search,
  MapPin,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  Pencil,
  Trash2,
  X,
  Phone,
  Mail,
} from "lucide-react";
import clsx from "clsx";

import { supabase } from "@/lib/supabaseClient";

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */

type RepGroup = {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  territory: string;
  commission_pct: number;
  notes: string;
  created_at: string;
};

type RepGroupStats = {
  customers: number;
  ttmRevenue: number;
  priorTtmRevenue: number;
  totalOrders: number;
};

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function RepGroupsPage() {
  const [repGroups, setRepGroups] = useState<RepGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<RepGroup | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rep_groups")
      .select("*")
      .order("name");

    if (error) {
      console.error("Rep groups error:", error);
      // Table might not exist yet
      if (error.code === "42P01") {
        console.warn("rep_groups table does not exist yet. Run the SQL to create it.");
      }
    }

    setRepGroups((data as RepGroup[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = repGroups.filter(
    (g) =>
      !search ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.contact_name.toLowerCase().includes(search.toLowerCase()) ||
      g.territory.toLowerCase().includes(search.toLowerCase())
  );

  async function handleDelete() {
    if (!deleteId) return;
    await supabase.from("rep_groups").delete().eq("id", deleteId);
    setDeleteId(null);
    loadData();
  }

  async function handleSave(group: Partial<RepGroup>) {
    if (editingGroup) {
      await supabase.from("rep_groups").update(group).eq("id", editingGroup.id);
    } else {
      await supabase.from("rep_groups").insert(group);
    }
    setModalOpen(false);
    setEditingGroup(null);
    loadData();
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div />
        <button
          onClick={() => {
            setEditingGroup(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 transition"
        >
          <Plus size={14} />
          Add Rep Group
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          placeholder="Search rep groups..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">
          Loading rep groups…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <Users size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500 mb-1">
            {repGroups.length === 0
              ? "No rep groups yet"
              : "No matching rep groups"}
          </p>
          <p className="text-xs text-gray-400 mb-4">
            {repGroups.length === 0
              ? "Add your first rep group to start tracking territories and performance."
              : "Try adjusting your search."}
          </p>
          {repGroups.length === 0 && (
            <button
              onClick={() => {
                setEditingGroup(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 transition"
            >
              <Plus size={14} />
              Add Rep Group
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((group) => (
            <div
              key={group.id}
              className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm transition-shadow"
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {group.name}
                  </h3>
                  {group.contact_name && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {group.contact_name}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingGroup(group);
                      setModalOpen(true);
                    }}
                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setDeleteId(group.id)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Territory */}
              {group.territory && (
                <div className="flex items-center gap-1.5 mb-3">
                  <MapPin size={12} className="text-gray-400" />
                  <span className="text-[11px] text-gray-500">
                    {group.territory}
                  </span>
                </div>
              )}

              {/* Contact info */}
              <div className="flex flex-wrap gap-3 mb-3">
                {group.email && (
                  <a
                    href={`mailto:${group.email}`}
                    className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-900 transition"
                  >
                    <Mail size={11} />
                    {group.email}
                  </a>
                )}
                {group.phone && (
                  <a
                    href={`tel:${group.phone}`}
                    className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-900 transition"
                  >
                    <Phone size={11} />
                    {group.phone}
                  </a>
                )}
              </div>

              {/* Commission */}
              {group.commission_pct > 0 && (
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                    Commission
                  </span>
                  <span className="text-sm font-semibold text-gray-900 ml-2">
                    {group.commission_pct}%
                  </span>
                </div>
              )}

              {/* Notes */}
              {group.notes && (
                <p className="text-[11px] text-gray-400 mt-2 line-clamp-2">
                  {group.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <RepGroupModal
          group={editingGroup}
          onClose={() => {
            setModalOpen(false);
            setEditingGroup(null);
          }}
          onSave={handleSave}
        />
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setDeleteId(null)}
        >
          <div
            className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Delete Rep Group
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Are you sure? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MODAL
   ═══════════════════════════════════════════════════════════ */

function RepGroupModal({
  group,
  onClose,
  onSave,
}: {
  group: RepGroup | null;
  onClose: () => void;
  onSave: (g: Partial<RepGroup>) => void;
}) {
  const [name, setName] = useState(group?.name || "");
  const [contactName, setContactName] = useState(group?.contact_name || "");
  const [email, setEmail] = useState(group?.email || "");
  const [phone, setPhone] = useState(group?.phone || "");
  const [territory, setTerritory] = useState(group?.territory || "");
  const [commissionPct, setCommissionPct] = useState(
    group?.commission_pct?.toString() || ""
  );
  const [notes, setNotes] = useState(group?.notes || "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      contact_name: contactName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      territory: territory.trim(),
      commission_pct: parseFloat(commissionPct) || 0,
      notes: notes.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            {group ? "Edit Rep Group" : "Add Rep Group"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="text-[11px] font-medium text-gray-500 mb-1 block">
              Group Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
              placeholder="e.g., Southeast Sales Group"
              required
            />
          </div>

          {/* Contact + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                Contact Name
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                placeholder="john@example.com"
              />
            </div>
          </div>

          {/* Phone + Territory */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                Territory
              </label>
              <input
                type="text"
                value={territory}
                onChange={(e) => setTerritory(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                placeholder="Southeast US"
              />
            </div>
          </div>

          {/* Commission */}
          <div className="w-1/2">
            <label className="text-[11px] font-medium text-gray-500 mb-1 block">
              Commission %
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
              placeholder="10"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-medium text-gray-500 mb-1 block">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 resize-none"
              placeholder="Additional notes about this rep group..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition"
            >
              {group ? "Save Changes" : "Add Rep Group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
