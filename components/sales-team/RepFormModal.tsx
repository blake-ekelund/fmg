"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Save, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { SalesRep } from "./reps";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Rep to edit; null = create a new rep. */
  rep: SalesRep | null;
  onSaved: () => void;
};

type Form = {
  name: string;
  agency: string;
  agencyCode: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  zip: string;
  territory: string;
  samples: string;
};

const EMPTY: Form = {
  name: "",
  agency: "",
  agencyCode: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  zip: "",
  territory: "",
  samples: "",
};

async function authHeader(): Promise<Record<string, string>> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const fieldCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300";
const labelCls =
  "text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1 block";

export default function RepFormModal({ open, onClose, rep, onSaved }: Props) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!rep?.id;

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (rep) {
      setForm({
        name: rep.name,
        agency: rep.agency,
        agencyCode: rep.agencyCode ? String(rep.agencyCode) : "",
        email: rep.email,
        phone: rep.phone,
        city: rep.city,
        state: rep.state,
        zip: rep.zip,
        territory: rep.territory,
        samples: rep.samples,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, rep]);

  if (!open) return null;

  function set<K extends keyof Form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        agency: form.agency,
        agency_code: form.agencyCode.trim() === "" ? null : Number(form.agencyCode),
        email: form.email,
        phone: form.phone,
        city: form.city,
        state: form.state,
        zip: form.zip,
        territory: form.territory,
        samples: form.samples,
      };
      const url = isEdit ? `/api/sales-reps/${rep!.id}` : "/api/sales-reps";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? `Save failed (${res.status})`);
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!rep?.id) return;
    if (!confirm(`Delete ${rep.name} from the roster? This can't be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-reps/${rep.id}`, {
        method: "DELETE",
        headers: await authHeader(),
      });
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => ({}));
        setError(json?.error ?? `Delete failed (${res.status})`);
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="text-sm font-semibold text-gray-900">
            {isEdit ? "Edit Rep" : "Add Rep"}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className={labelCls}>Name *</label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Jane Smith"
              className={fieldCls}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Agency</label>
              <input
                value={form.agency}
                onChange={(e) => set("agency", e.target.value)}
                placeholder="Sales Producers"
                className={fieldCls}
              />
            </div>
            <div>
              <label className={labelCls}>Agency code</label>
              <input
                value={form.agencyCode}
                onChange={(e) => set("agencyCode", e.target.value.replace(/[^\d]/g, ""))}
                placeholder="210"
                inputMode="numeric"
                className={fieldCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Email</label>
              <input
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="jane@example.com"
                className={fieldCls}
              />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="555-123-4567"
                className={fieldCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-3">
              <label className={labelCls}>City</label>
              <input
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                className={fieldCls}
              />
            </div>
            <div className="col-span-1">
              <label className={labelCls}>State</label>
              <input
                value={form.state}
                onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))}
                placeholder="CA"
                className={fieldCls}
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Zip</label>
              <input
                value={form.zip}
                onChange={(e) => set("zip", e.target.value)}
                className={fieldCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Territory / Role</label>
            <input
              value={form.territory}
              onChange={(e) => set("territory", e.target.value)}
              placeholder="Southern California"
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>
              Samples <span className="lowercase tracking-normal">(A, B, Cat, Cat+, …)</span>
            </label>
            <input
              value={form.samples}
              onChange={(e) => set("samples", e.target.value)}
              placeholder="A"
              className={fieldCls}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          {isEdit ? (
            <button
              onClick={remove}
              disabled={deleting || saving}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-700 transition disabled:opacity-40"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || deleting}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isEdit ? "Save changes" : "Add rep"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
