"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  ExternalLink,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  X,
  Globe,
  Copy,
  Check,
} from "lucide-react";
import clsx from "clsx";

import { supabase } from "@/lib/supabaseClient";

/* ─── Types ─── */

export type CompanyPlatform = {
  id: string;
  name: string;
  purpose: string | null;
  login: string | null;
  password: string | null;
  login_url: string | null;
  access_method: string;
  notes: string | null;
};

/* ─── Main Component ─── */

export default function PlatformsSection() {
  const [rows, setRows] = useState<CompanyPlatform[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<CompanyPlatform | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyPlatform | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("company_platforms")
      .select("*")
      .order("name");
    setRows((data as CompanyPlatform[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setEditItem(null);
    setModalOpen(true);
  }

  function openEdit(item: CompanyPlatform) {
    setEditItem(item);
    setModalOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await supabase.from("company_platforms").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    load();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Platforms & Logins</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Store login credentials and links for tools your team uses.
          </p>
        </div>

        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:shadow-sm transition"
        >
          <Plus size={14} />
          Add Platform
        </button>
      </div>

      {/* Platform cards */}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">Loading platforms…</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center">
          <Globe size={24} className="mx-auto text-gray-300 mb-2" />
          <div className="text-sm text-gray-400">No platforms added yet</div>
          <button
            onClick={openAdd}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 transition"
          >
            <Plus size={12} /> Add your first platform
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((item) => (
            <PlatformCard
              key={item.id}
              item={item}
              onEdit={() => openEdit(item)}
              onDelete={() => setDeleteTarget(item)}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <PlatformModal
          item={editItem}
          onClose={() => setModalOpen(false)}
          onSaved={load}
        />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Delete platform?</h3>
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{deleteTarget.name}</span> and its stored credentials will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition"
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

/* ─── Platform Card ─── */

function PlatformCard({
  item,
  onEdit,
  onDelete,
}: {
  item: CompanyPlatform;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function copyToClipboard(value: string, field: string) {
    navigator.clipboard.writeText(value);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 group hover:shadow-sm transition">
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500 shrink-0">
            <Globe size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">{item.name}</div>
            {item.purpose && (
              <div className="text-[11px] text-gray-500 truncate">{item.purpose}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {item.login_url && (
            <a
              href={item.login_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              title="Open site"
            >
              <ExternalLink size={13} />
            </a>
          )}
          <button
            onClick={onEdit}
            className="rounded-md p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition opacity-0 group-hover:opacity-100"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Credentials */}
      <div className="space-y-2">
        {item.login && (
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
            <div>
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Login</div>
              <div className="text-xs font-medium text-gray-700">{item.login}</div>
            </div>
            <button
              onClick={() => copyToClipboard(item.login!, "login")}
              className="text-gray-400 hover:text-gray-600 transition"
              title="Copy"
            >
              {copied === "login" ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            </button>
          </div>
        )}

        {item.password && (
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Password</div>
              <div className="text-xs font-medium text-gray-700 font-mono">
                {showPassword ? item.password : "••••••••••"}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-400 hover:text-gray-600 transition"
                title={showPassword ? "Hide" : "Show"}
              >
                {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button
                onClick={() => copyToClipboard(item.password!, "password")}
                className="text-gray-400 hover:text-gray-600 transition"
                title="Copy"
              >
                {copied === "password" ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        )}

        {item.notes && (
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Notes</div>
            <div className="text-xs text-gray-600 whitespace-pre-wrap mt-0.5">{item.notes}</div>
          </div>
        )}

        {item.access_method && item.access_method !== "credentials" && (
          <div className="text-[10px] text-gray-400">
            Access: {item.access_method}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Add/Edit Platform Modal ─── */

function PlatformModal({
  item,
  onClose,
  onSaved,
}: {
  item: CompanyPlatform | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!item;
  const [name, setName] = useState(item?.name ?? "");
  const [purpose, setPurpose] = useState(item?.purpose ?? "");
  const [login, setLogin] = useState(item?.login ?? "");
  const [password, setPassword] = useState(item?.password ?? "");
  const [loginUrl, setLoginUrl] = useState(item?.login_url ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);

    const row = {
      name: name.trim(),
      purpose: purpose.trim() || null,
      login: login.trim() || null,
      password: password.trim() || null,
      login_url: loginUrl.trim() || null,
      access_method: login.trim() ? "credentials" : "other",
      notes: notes.trim() || null,
    };

    if (isEditing) {
      await supabase.from("company_platforms").update(row).eq("id", item.id);
    } else {
      await supabase.from("company_platforms").insert(row);
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <span className="text-sm font-semibold text-gray-900">
            {isEditing ? "Edit Platform" : "Add Platform"}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Name */}
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              Platform Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Shopify, QuickBooks, Supabase"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          {/* Purpose */}
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              Purpose <span className="normal-case text-gray-300">(optional)</span>
            </label>
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. E-commerce, Accounting"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          {/* URL */}
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              Login URL <span className="normal-case text-gray-300">(optional)</span>
            </label>
            <input
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
              placeholder="https://app.example.com/login"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          {/* Login + Password row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                Login / Email
              </label>
              <input
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="username or email"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>

            <div>
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 pr-9 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              Notes <span className="normal-case text-gray-300">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="API keys, 2FA details, shared account info…"
              rows={2}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-5 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40"
            >
              {saving ? "Saving…" : isEditing ? "Update" : "Add Platform"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
