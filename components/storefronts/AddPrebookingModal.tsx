"use client";

import { useMemo, useState } from "react";
import { X, Loader2, Gift, Plus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  SCENTS,
  hcField,
  gsField,
  lbField,
  HC_DISPLAY_KEY,
  LIP_BUTTER_KEY,
  HAND_CREME_PER_CASE,
  HAND_CREME_CASE_PRICE,
  GIFT_SETS_PER_CASE,
  GIFT_SET_CASE_PRICE,
  LIP_BUTTER_PER_PACK,
  LIP_BUTTER_PACK_PRICE,
  HC_DISPLAY_PRICE,
  LIP_DISPLAY_PRICE,
  LIP_BUTTER_PER_CASE,
  PREBOOK_STATUSES,
  estimatedTotal,
  money,
  type PrebookRequest,
} from "@/lib/storefrontPrebooking";

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Compact +/- stepper that also accepts a typed number — mirrors the store. */
function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const set = (n: number) => onChange(Math.max(0, Math.min(100000, n)));
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        aria-label="decrease"
        onClick={() => set(value - 1)}
        disabled={value === 0}
        className="w-7 text-sm font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-30"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={(e) => set(Math.floor(Number(e.target.value) || 0))}
        className="w-12 border-x border-gray-200 text-center text-sm font-semibold text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label="increase"
        onClick={() => set(value + 1)}
        className="w-7 text-sm font-bold text-gray-500 hover:bg-gray-100"
      >
        +
      </button>
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (row: PrebookRequest) => void;
};

export default function AddPrebookingModal({ open, onClose, onCreated }: Props) {
  const [store, setStore] = useState<"sassy" | "ni">("sassy");
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("new");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLine = (key: string, n: number) => setQty((q) => ({ ...q, [key]: n }));

  const total = useMemo(() => estimatedTotal(qty), [qty]);
  const caseCount = useMemo(
    () => SCENTS.reduce((s, sc) => s + (qty[hcField(sc.key)] ?? 0), 0),
    [qty],
  );

  function reset() {
    setStore("sassy");
    setBusinessName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setStatus("new");
    setNotes("");
    setQty({});
    setError(null);
    setSaving(false);
  }
  function close() {
    reset();
    onClose();
  }

  const canSave = businessName.trim() && contactName.trim() && email.trim() && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      store,
      business_name: businessName.trim(),
      contact_name: contactName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      notes: notes.trim() || null,
      status,
      ...qty,
    };
    try {
      const res = await fetch("/api/storefront-prebookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Couldn't save the prebooking.");
        setSaving(false);
        return;
      }
      onCreated(json.prebooking as PrebookRequest);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the prebooking.");
      setSaving(false);
    }
  }

  if (!open) return null;

  const inputCls =
    "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300";
  const labelCls = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-gray-500";
  const sectionCls = "text-[11px] font-semibold uppercase tracking-wider text-gray-400";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm" onClick={close}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-100">
              <Gift size={16} className="text-pink-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Add holiday prebooking</h2>
          </div>
          <button onClick={close} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {/* Buyer */}
          <div>
            <div className={`mb-2 ${sectionCls}`}>The business</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Store</label>
                <select value={store} onChange={(e) => setStore(e.target.value as "sassy" | "ni")} className={inputCls}>
                  <option value="sassy">Sassy</option>
                  <option value="ni">Natural Inspirations</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                  {PREBOOK_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Business name *</label>
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputCls} placeholder="Their store" />
              </div>
              <div>
                <label className={labelCls}>Contact name *</label>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputCls} placeholder="Buyer" />
              </div>
              <div>
                <label className={labelCls}>Email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@store.com" />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="Optional" />
              </div>
            </div>
          </div>

          {/* Per personality: hand crème case packs + gift sets */}
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <div className={sectionCls}>By personality</div>
              {caseCount > 0 ? (
                <span className="text-[11px] text-gray-400">
                  {caseCount} case pack{caseCount === 1 ? "" : "s"} · {caseCount * HAND_CREME_PER_CASE} minis
                </span>
              ) : null}
            </div>
            <div className="hidden items-center justify-end gap-4 pr-1 text-[9px] font-bold uppercase tracking-wider text-gray-400 sm:flex">
              <span className="w-24 text-center">Mini Hand Crème</span>
              <span className="w-24 text-center">Gift Sets</span>
              <span className="w-24 text-center">Lip Butters</span>
            </div>
            <div className="divide-y divide-gray-100">
              {SCENTS.map((s) => (
                <div key={s.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className="h-5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-xs font-semibold text-gray-800">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-24 text-center">
                      <QtyStepper value={qty[hcField(s.key)] ?? 0} onChange={(n) => setLine(hcField(s.key), n)} />
                    </div>
                    <div className="w-24 text-center">
                      <QtyStepper value={qty[gsField(s.key)] ?? 0} onChange={(n) => setLine(gsField(s.key), n)} />
                    </div>
                    <div className="w-24 text-center">
                      <QtyStepper value={qty[lbField(s.key)] ?? 0} onChange={(n) => setLine(lbField(s.key), n)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-gray-400">
              All quantities are case packs: {HAND_CREME_PER_CASE} minis ({money(HAND_CREME_CASE_PRICE)}) ·{" "}
              {GIFT_SETS_PER_CASE} gift sets ({money(GIFT_SET_CASE_PRICE)}) ·{" "}
              {LIP_BUTTER_PER_PACK} lip butters ({money(LIP_BUTTER_PACK_PRICE)}).
            </p>
          </div>

          {/* The two displays */}
          <div>
            <div className={`mb-2 ${sectionCls}`}>The displays</div>
            <div className="divide-y divide-gray-100">
              <div className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800">Holiday Sassy Mini Hand Crème Display</p>
                  <p className="text-[10px] text-gray-400">Full personality lineup · {money(HC_DISPLAY_PRICE)} each</p>
                </div>
                <QtyStepper value={qty[HC_DISPLAY_KEY] ?? 0} onChange={(n) => setLine(HC_DISPLAY_KEY, n)} />
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800">Holiday SPF 30 Lip Butter Display</p>
                  <p className="text-[10px] text-gray-400">{LIP_BUTTER_PER_CASE}-count · {money(LIP_DISPLAY_PRICE)} each</p>
                </div>
                <QtyStepper value={qty[LIP_BUTTER_KEY] ?? 0} onChange={(n) => setLine(LIP_BUTTER_KEY, n)} />
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Scent preferences, timing, questions…" />
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
          <div className="text-sm">
            <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Est. total </span>
            <span className="font-bold tabular-nums text-gray-900">{money(total)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={close} className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Add prebooking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
