"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import clsx from "clsx";
import { CheckCircle, EyeOff, Globe, Package, Sparkles } from "lucide-react";

import type { Product, StorefrontChannel } from "@/components/inventory/types";

type Update = <K extends keyof Product>(key: K, value: Product[K]) => void;

const SPRING = { type: "spring" as const, stiffness: 280, damping: 28, mass: 0.7 };
const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Channel option metadata ─── */
const CHANNELS: {
  value: StorefrontChannel;
  label: string;
  hint: string;
  Icon: typeof CheckCircle;
  activeClass: string;
  iconClass: string;
}[] = [
  {
    value: "off",
    label: "Off",
    hint: "Hidden from storefront",
    Icon: EyeOff,
    activeClass: "bg-gray-900 text-white border-gray-900",
    iconClass: "text-gray-500",
  },
  {
    value: "d2c",
    label: "D2C",
    hint: "Retail only · redek.io",
    Icon: Globe,
    activeClass: "bg-pink-50 text-pink-700 border-pink-300 ring-2 ring-pink-200",
    iconClass: "text-pink-500",
  },
  {
    value: "wholesale",
    label: "Wholesale",
    hint: "PO only · signed-in stockists",
    Icon: Package,
    activeClass:
      "bg-indigo-50 text-indigo-700 border-indigo-300 ring-2 ring-indigo-200",
    iconClass: "text-indigo-500",
  },
  {
    value: "both",
    label: "Both",
    hint: "Retail + wholesale",
    Icon: Sparkles,
    activeClass:
      "bg-gradient-to-br from-pink-50 to-indigo-50 text-gray-900 border-gray-900 ring-2 ring-gray-300",
    iconClass: "text-pink-500",
  },
];

/* ─── Channel pill toggle ─── */
function ChannelToggle({
  value,
  onChange,
}: {
  value: StorefrontChannel;
  onChange: (v: StorefrontChannel) => void;
}) {
  return (
    <LayoutGroup>
      <div className="grid grid-cols-4 gap-2">
        {CHANNELS.map((c) => {
          const active = value === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(c.value)}
              className={clsx(
                "relative rounded-xl border px-3 py-3 text-left transition-all",
                active
                  ? c.activeClass
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              )}
            >
              <div className="flex items-center gap-2">
                <c.Icon size={16} className={active ? "" : c.iconClass} />
                <span className="text-sm font-semibold">{c.label}</span>
              </div>
              <p
                className={clsx(
                  "mt-1 text-[11px] leading-tight",
                  active ? "opacity-80" : "text-gray-400"
                )}
              >
                {c.hint}
              </p>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/* ─── Numeric input (lightweight, controlled) ─── */
function NumInput({
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  step = "0.01",
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  step?: string;
}) {
  const [text, setText] = useState<string>(
    value == null || Number.isNaN(value) ? "" : String(value)
  );

  // Sync if external value changes (e.g. on load)
  useEffect(() => {
    setText(value == null || Number.isNaN(value) ? "" : String(value));
  }, [value]);

  function commit(raw: string) {
    if (raw.trim() === "") {
      onChange(null);
      return;
    }
    const n = parseFloat(raw);
    onChange(Number.isFinite(n) ? n : null);
  }

  return (
    <div className="relative">
      {prefix ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
          {prefix}
        </span>
      ) : null}
      <input
        type="number"
        step={step}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        className={clsx(
          "w-full rounded-lg border border-gray-200 bg-white py-2 text-sm tabular-nums transition focus:outline-none focus:ring-2 focus:ring-gray-300",
          prefix ? "pl-7 pr-3" : "px-3",
          suffix ? "pr-12" : ""
        )}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs uppercase tracking-wide text-gray-400">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

/* ─── Text input wrapper that matches FMG's Field style ─── */
function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <input
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
      />
      {hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  hint,
  step,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  hint?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <NumInput
        value={value}
        onChange={onChange}
        prefix={prefix}
        suffix={suffix}
        placeholder={placeholder}
        step={step}
      />
      {hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}

/* ─── D2C pricing block ─── */
function D2cPricing({
  form,
  update,
}: {
  form: Product;
  update: Update;
}) {
  const msrp = form.msrp ?? null;
  const compareAt = form.compare_at_price ?? null;
  const showDiscount = msrp != null && compareAt != null && compareAt > msrp;
  const discountPct = showDiscount
    ? Math.round(((compareAt! - msrp!) / compareAt!) * 100)
    : null;

  return (
    <motion.section
      layout
      key="d2c"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: EASE }}
      className="rounded-xl border border-pink-100 bg-pink-50/30 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-pink-500" />
          <h3 className="text-sm font-semibold text-pink-700">D2C Pricing</h3>
        </div>
        {showDiscount ? (
          <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[11px] font-semibold text-pink-700">
            −{discountPct}% off
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumField
          label="Price (MSRP)"
          value={form.msrp}
          onChange={(v) => update("msrp", v)}
          prefix="$"
          placeholder="0.00"
        />
        <NumField
          label="Compare-at"
          value={form.compare_at_price}
          onChange={(v) => update("compare_at_price", v)}
          prefix="$"
          placeholder="optional"
          hint="Shown as strikethrough"
        />
      </div>
    </motion.section>
  );
}

/* ─── Wholesale pricing block ─── */
function WholesalePricing({
  form,
  update,
}: {
  form: Product;
  update: Update;
}) {
  const unit = form.wholesale_price ?? null;
  const pack = form.case_pack ?? null;
  const caseTotal = unit != null && pack != null ? unit * pack : null;

  return (
    <motion.section
      layout
      key="wholesale"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: EASE }}
      className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={14} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-indigo-700">
            Wholesale Pricing
          </h3>
        </div>
        {caseTotal !== null ? (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 tabular-nums">
            ${caseTotal.toFixed(2)} / case
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <NumField
          label="Per-unit price"
          value={form.wholesale_price}
          onChange={(v) => update("wholesale_price", v)}
          prefix="$"
          placeholder="0.00"
        />
        <NumField
          label="Case pack"
          value={form.case_pack}
          onChange={(v) => update("case_pack", v == null ? null : Math.round(v))}
          suffix="units"
          placeholder="12"
          step="1"
        />
        <NumField
          label="MOQ"
          value={form.moq}
          onChange={(v) => update("moq", v == null ? null : Math.round(v))}
          suffix="cases"
          placeholder="1"
          step="1"
        />
      </div>
    </motion.section>
  );
}

/* ─── Card shell ─── */
function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-medium text-gray-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-gray-400">{hint}</p> : null}
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

/* ─── Status banner ─── */
function StatusBanner({ channel }: { channel: StorefrontChannel }) {
  const map: Record<StorefrontChannel, { bg: string; text: string; label: string; sub: string }> = {
    off: {
      bg: "bg-gray-100",
      text: "text-gray-600",
      label: "Hidden",
      sub: "This product is not visible on any storefront.",
    },
    d2c: {
      bg: "bg-pink-100",
      text: "text-pink-700",
      label: "Live on redek.io",
      sub: "Visible to D2C shoppers. Wholesale users do not see this product.",
    },
    wholesale: {
      bg: "bg-indigo-100",
      text: "text-indigo-700",
      label: "Live for wholesale",
      sub: "Visible to approved stockists in their PO portal only.",
    },
    both: {
      bg: "bg-gradient-to-r from-pink-100 to-indigo-100",
      text: "text-gray-800",
      label: "Live on both channels",
      sub: "Visible to D2C shoppers and approved wholesale accounts.",
    },
  };
  const s = map[channel];
  return (
    <motion.div
      layout
      key={channel}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: EASE }}
      className={clsx("flex items-center gap-3 rounded-xl px-4 py-3", s.bg)}
    >
      <CheckCircle size={18} className={s.text} />
      <div>
        <div className={clsx("text-sm font-semibold", s.text)}>{s.label}</div>
        <div className="text-xs text-gray-600">{s.sub}</div>
      </div>
    </motion.div>
  );
}

/* ─── Main section ─── */
export function StorefrontSection({
  form,
  update,
}: {
  form: Product;
  update: Update;
}) {
  const channel: StorefrontChannel = form.storefront_channel ?? "off";
  const showD2c = channel === "d2c" || channel === "both";
  const showWholesale = channel === "wholesale" || channel === "both";

  return (
    <div className="space-y-5">
      {/* Publish controls */}
      <Card
        title="Publish to storefront"
        hint="Controls visibility on redek.io and the wholesale PO portal."
      >
        <div className="space-y-4">
          <ChannelToggle
            value={channel}
            onChange={(v) => update("storefront_channel", v)}
          />
          <StatusBanner channel={channel} />
        </div>
      </Card>

      {/* Pricing (collapses entirely when Off) */}
      <AnimatePresence initial={false} mode="popLayout">
        {channel !== "off" && (
          <motion.div
            key="pricing-shell"
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <Card title="Pricing">
              <LayoutGroup>
                <div className="space-y-3">
                  <AnimatePresence initial={false} mode="popLayout">
                    {showD2c && <D2cPricing key="d2c" form={form} update={update} />}
                    {showWholesale && (
                      <WholesalePricing
                        key="wholesale"
                        form={form}
                        update={update}
                      />
                    )}
                  </AnimatePresence>
                  <motion.div layout className="grid grid-cols-2 gap-3 pt-1">
                    <NumField
                      label="Cost per unit (COGS)"
                      value={form.cogs}
                      onChange={(v) => update("cogs", v ?? 0)}
                      prefix="$"
                      placeholder="0.00"
                    />
                    <TextField
                      label="Barcode (UPC / EAN)"
                      value={form.barcode}
                      onChange={(v) => update("barcode", v)}
                      placeholder="816141017384"
                    />
                  </motion.div>
                </div>
              </LayoutGroup>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Marketing copy */}
      <Card title="Marketing" hint="Headline-level copy shown on the product page.">
        <div className="space-y-4">
          <TextField
            label="Subtitle"
            value={form.subtitle}
            onChange={(v) => update("subtitle", v)}
            placeholder="Sassy + Co Everyday Collection"
            hint='Small text under the product name on the storefront.'
          />
          <TextField
            label="Infused with"
            value={form.infused_with}
            onChange={(v) => update("infused_with", v)}
            placeholder="GLAM + LUXE ELEGANCE"
            hint="One-line tagline shown as a metadata chip."
          />
          <TextField
            label="Category path"
            value={form.category_path}
            onChange={(v) => update("category_path", v)}
            placeholder="Lotions & Moisturizers in Skin Care"
            hint="Display category. Drives breadcrumbs + search filters."
          />
        </div>
      </Card>

      {/* Shipping */}
      <Card title="Shipping & customs" hint="Used for box selection, tax, and customs.">
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label="Weight"
            value={form.weight_oz}
            onChange={(v) => update("weight_oz", v)}
            suffix="oz"
            placeholder="0.0"
          />
          <TextField
            label="Country of origin"
            value={form.country_of_origin}
            onChange={(v) => update("country_of_origin", v)}
            placeholder="USA"
          />
          <TextField
            label="HS code"
            value={form.hs_code}
            onChange={(v) => update("hs_code", v)}
            placeholder="3304.99.5000"
            hint="Harmonized System code for international shipments."
          />
        </div>
      </Card>
    </div>
  );
}
