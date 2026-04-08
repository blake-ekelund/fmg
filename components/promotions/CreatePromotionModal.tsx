"use client";

import { useState, useEffect } from "react";
import {
  X,
  Percent,
  Truck,
  ShoppingBag,
  Store,
  Tag,
  Copy,
  RefreshCw,
  Check,
  Loader2,
  FileText,
  AtSign,
  Mail,
} from "lucide-react";
import clsx from "clsx";
import type {
  Promotion,
  PromotionStatus,
  DiscountType,
  PromotionChannel,
  AppliesTo,
  PressChannel,
  ShopifyCollection,
} from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (promo: Partial<Promotion>) => Promise<void>;
  /** Save + immediately sync to Shopify (for D2C "Create & Activate") */
  onSaveAndSync?: (promo: Partial<Promotion>) => Promise<void>;
  editing?: Promotion | null;
};

function generateCode(): string {
  const words = ["SAVE", "DEAL", "VIP", "GLOW", "TREAT", "FRESH", "LUXE"];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(Math.random() * 90 + 10);
  return `NI${word}${num}`;
}

export default function CreatePromotionModal({ open, onClose, onSave, onSaveAndSync, editing }: Props) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<PromotionChannel>("d2c");
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [minimumPurchase, setMinimumPurchase] = useState("");
  const [code, setCode] = useState("");
  const [onePerCustomer, setOnePerCustomer] = useState(false);
  const [appliesTo, setAppliesTo] = useState<AppliesTo>("all");
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [pressChannels, setPressChannels] = useState<PressChannel[]>([]);
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingMode, setSavingMode] = useState<"draft" | "sync" | null>(null);

  // Shopify collections
  const [shopifyCollections, setShopifyCollections] = useState<ShopifyCollection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionSearch, setCollectionSearch] = useState("");

  useEffect(() => {
    if (appliesTo === "specific_collections" && shopifyCollections.length === 0) {
      setCollectionsLoading(true);
      fetch("/api/shopify/collections")
        .then((r) => r.json())
        .then((data) => {
          if (data.collections) setShopifyCollections(data.collections);
        })
        .catch(() => {})
        .finally(() => setCollectionsLoading(false));
    }
  }, [appliesTo]);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setChannel(editing.channel);
      setDiscountType(editing.discount_type === "percentage" || editing.discount_type === "free_shipping" ? editing.discount_type : "percentage");
      setDiscountValue(editing.discount_value?.toString() || "");
      setMinimumPurchase(editing.minimum_purchase?.toString() || "");
      setCode(editing.code || "");
      setOnePerCustomer(editing.one_per_customer);
      setAppliesTo(editing.applies_to);
      setSelectedCollectionIds(editing.collection_ids || []);
      setPressChannels(editing.press_channels || []);
      setStartsAt(editing.starts_at ? new Date(editing.starts_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16));
      setEndsAt(editing.ends_at ? new Date(editing.ends_at).toISOString().slice(0, 16) : "");
    } else {
      setName("");
      setChannel("d2c");
      setDiscountType("percentage");
      setDiscountValue("");
      setMinimumPurchase("");
      setCode("");
      setOnePerCustomer(false);
      setAppliesTo("all");
      setSelectedCollectionIds([]);
      setPressChannels([]);
      setStartsAt(new Date().toISOString().slice(0, 16));
      setEndsAt("");
      setCollectionSearch("");
    }
  }, [editing, open]);

  if (!open) return null;

  const isD2C = channel === "d2c";

  const filteredCollections = collectionSearch
    ? shopifyCollections.filter((c) => c.title.toLowerCase().includes(collectionSearch.toLowerCase()))
    : shopifyCollections;

  function toggleCollection(id: string) {
    setSelectedCollectionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function buildPromo(status: PromotionStatus): Partial<Promotion> {
    return {
      ...(editing?.id ? { id: editing.id } : {}),
      name: name.trim(),
      description: null,
      brand: "ni",
      channel,
      discount_type: discountType,
      discount_value: discountType === "free_shipping" ? 100 : discountValue ? parseFloat(discountValue) : null,
      minimum_purchase: minimumPurchase ? parseFloat(minimumPurchase) : null,
      code: code.trim().toUpperCase() || null,
      auto_apply: false,
      max_uses: null,
      one_per_customer: onePerCustomer,
      allocation_method: "across",
      applies_to: appliesTo,
      collection_ids: appliesTo === "specific_collections" && selectedCollectionIds.length > 0 ? selectedCollectionIds : null,
      collection_tags: null,
      product_ids: null,
      buy_quantity: null,
      get_quantity: null,
      get_discount_percent: null,
      press_channels: pressChannels,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      status,
    };
  }

  async function handleSaveDraft() {
    if (!name.trim()) return;
    if (isD2C && !code.trim()) return;
    setSaving(true);
    setSavingMode("draft");
    try {
      await onSave(buildPromo(editing?.status || "draft"));
      onClose();
    } catch (e) {
      console.error("Save failed:", e);
    } finally {
      setSaving(false);
      setSavingMode(null);
    }
  }

  async function handleSaveAndSync() {
    if (!name.trim() || !code.trim()) return;
    setSaving(true);
    setSavingMode("sync");
    try {
      if (onSaveAndSync) {
        await onSaveAndSync(buildPromo("active"));
      } else {
        await onSave(buildPromo("active"));
      }
      onClose();
    } catch (e) {
      console.error("Save & sync failed:", e);
    } finally {
      setSaving(false);
      setSavingMode(null);
    }
  }

  const codeRequired = isD2C && !code.trim();
  const canSubmit = name.trim() && !codeRequired && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
              <Tag size={14} className="text-amber-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">
              {editing ? "Edit Promotion" : "New Promotion"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3.5">
          {/* Row 1: Name + Channel */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Summer Sale 25% Off"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Channel</label>
              <div className="flex gap-1">
                {([
                  { v: "d2c" as PromotionChannel, l: "D2C" },
                  { v: "wholesale" as PromotionChannel, l: "Wholesale" },
                ]).map((c) => (
                  <button
                    key={c.v}
                    onClick={() => setChannel(c.v)}
                    className={clsx(
                      "flex-1 flex items-center justify-center py-2 rounded-lg text-[10px] font-medium transition",
                      channel === c.v
                        ? "bg-gray-900 text-white"
                        : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                    )}
                  >
                    {c.l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Type + Value + Min Purchase */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Type</label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setDiscountType("percentage")}
                  className={clsx(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition border",
                    discountType === "percentage"
                      ? "bg-amber-50 border-amber-200 text-amber-800"
                      : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                  )}
                >
                  <Percent size={12} /> %
                </button>
                <button
                  onClick={() => setDiscountType("free_shipping")}
                  className={clsx(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition border",
                    discountType === "free_shipping"
                      ? "bg-amber-50 border-amber-200 text-amber-800"
                      : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                  )}
                >
                  <Truck size={12} /> Ship
                </button>
              </div>
            </div>
            {discountType === "percentage" ? (
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Off (%)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="15"
                    className="w-full rounded-lg border border-gray-200 pl-7 pr-2 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
                  />
                </div>
              </div>
            ) : (
              <div />
            )}
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Min. Purchase</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                <input
                  type="number"
                  value={minimumPurchase}
                  onChange={(e) => setMinimumPurchase(e.target.value)}
                  placeholder="None"
                  className="w-full rounded-lg border border-gray-200 pl-7 pr-2 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
                />
              </div>
            </div>
          </div>

          {/* Row 3: Code + One per customer */}
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">
              Promo Code{isD2C && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. SUMMER25"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition uppercase"
              />
              <button onClick={() => setCode(generateCode())} className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 transition" title="Generate">
                <RefreshCw size={13} />
              </button>
              <button onClick={() => { if (code) navigator.clipboard.writeText(code); }} className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 transition" title="Copy">
                <Copy size={13} />
              </button>
              <label className="flex items-center gap-1.5 shrink-0 ml-1">
                <input
                  type="checkbox"
                  checked={onePerCustomer}
                  onChange={(e) => setOnePerCustomer(e.target.checked)}
                  className="rounded border-gray-300 text-gray-900 focus:ring-gray-300 w-3.5 h-3.5"
                />
                <span className="text-[10px] text-gray-500 whitespace-nowrap">One per customer</span>
              </label>
            </div>
          </div>

          {/* Row 4: Applies to */}
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Applies To</label>
            <div className="flex gap-1.5">
              <button
                onClick={() => setAppliesTo("all")}
                className={clsx(
                  "px-4 py-1.5 rounded-lg text-xs font-medium transition",
                  appliesTo === "all" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                )}
              >
                All Products
              </button>
              <button
                onClick={() => setAppliesTo("specific_collections")}
                className={clsx(
                  "px-4 py-1.5 rounded-lg text-xs font-medium transition",
                  appliesTo === "specific_collections" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                )}
              >
                Specific Collections
              </button>
            </div>
            {appliesTo === "specific_collections" && (
              <div className="mt-2">
                {collectionsLoading ? (
                  <div className="flex items-center gap-2 py-2 text-gray-400">
                    <Loader2 size={12} className="animate-spin" />
                    <span className="text-[10px]">Loading collections...</span>
                  </div>
                ) : shopifyCollections.length === 0 ? (
                  <p className="text-[10px] text-gray-400 py-1">No collections found.</p>
                ) : (
                  <>
                    <input
                      type="text"
                      value={collectionSearch}
                      onChange={(e) => setCollectionSearch(e.target.value)}
                      placeholder="Search collections..."
                      className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition mb-1.5"
                    />
                    <div className="max-h-28 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                      {filteredCollections.map((col) => {
                        const sel = selectedCollectionIds.includes(col.id);
                        return (
                          <button key={col.id} onClick={() => toggleCollection(col.id)} className={clsx("flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition", sel ? "bg-amber-50" : "hover:bg-gray-50")}>
                            <div className={clsx("w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0", sel ? "bg-amber-500 border-amber-500" : "border-gray-300")}>
                              {sel && <Check size={8} className="text-white" />}
                            </div>
                            <span className="text-[11px] text-gray-800 truncate">{col.title}</span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedCollectionIds.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">{selectedCollectionIds.length} selected</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Row 5: Promote In */}
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Promote In</label>
            <div className="flex gap-1.5">
              {([
                { v: "blog" as PressChannel, l: "Blog", icon: FileText },
                { v: "social" as PressChannel, l: "Social", icon: AtSign },
                { v: "email" as PressChannel, l: "Email", icon: Mail },
              ]).map((ch) => {
                const active = pressChannels.includes(ch.v);
                return (
                  <button
                    key={ch.v}
                    onClick={() =>
                      setPressChannels((prev) =>
                        active ? prev.filter((x) => x !== ch.v) : [...prev, ch.v]
                      )
                    }
                    className={clsx(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border",
                      active
                        ? "bg-blue-50 border-blue-200 text-blue-700"
                        : "bg-white border-gray-200 text-gray-400 hover:bg-gray-50"
                    )}
                  >
                    <ch.icon size={12} />
                    {ch.l}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 6: Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">Starts</label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1 block">
                Ends <span className="text-gray-300 normal-case tracking-normal">(optional)</span>
              </label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50 shrink-0">
          <div>
            {codeRequired && <p className="text-[10px] text-red-500">Promo code required for Shopify</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition">
              Cancel
            </button>
            {editing ? (
              <button
                onClick={handleSaveDraft}
                disabled={!canSubmit}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-gray-900 hover:bg-gray-800 transition disabled:opacity-40"
              >
                {savingMode === "draft" ? "Saving..." : "Update"}
              </button>
            ) : (
              <>
                <button
                  onClick={handleSaveDraft}
                  disabled={!canSubmit}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-100 transition disabled:opacity-40"
                >
                  {savingMode === "draft" ? "Saving..." : "Save Draft"}
                </button>
                {isD2C && onSaveAndSync && (
                  <button
                    onClick={handleSaveAndSync}
                    disabled={!canSubmit}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 transition disabled:opacity-40"
                  >
                    <ShoppingBag size={12} />
                    {savingMode === "sync" ? "Activating..." : "Create & Activate"}
                  </button>
                )}
                {!isD2C && (
                  <button
                    onClick={handleSaveDraft}
                    disabled={!canSubmit}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-gray-900 hover:bg-gray-800 transition disabled:opacity-40"
                  >
                    {savingMode === "draft" ? "Saving..." : "Create"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
