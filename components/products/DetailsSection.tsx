"use client";

import { useEffect, useRef, useState } from "react";
import { LayoutGroup } from "framer-motion";
import clsx from "clsx";
import { AlertTriangle, CheckCircle } from "lucide-react";

import type { Product, StorefrontChannel } from "@/components/inventory/types";
import { composeDisplayName, normalizeHexColor } from "./copySheet";
import RichTextField from "./RichTextField";
import FragranceMultiSelect from "./FragranceMultiSelect";
import { richTextToPlain } from "@/lib/richText";

type Update = <K extends keyof Product>(key: K, value: Product[K]) => void;

export type CopyKey =
  | "short_description"
  | "long_description"
  | "benefits"
  | "ingredients_text"
  | "how_to_use"
  | "retailer_notes";

// ---------------------------------------------------------------------------
// Brand → collection options
// ---------------------------------------------------------------------------
const COLLECTIONS: Record<"NI" | "Sassy", { slug: string; label: string }[]> = {
  Sassy: [
    { slug: "love", label: "Love" },
    { slug: "everyday", label: "Everyday" },
    { slug: "holiday", label: "Holiday" },
  ],
  NI: [
    { slug: "agave-pear", label: "Agave Pear" },
    { slug: "coconut-ambre-vanille", label: "Coconut Ambre Vanille" },
    { slug: "cypres", label: "Cyprès" },
    { slug: "eucalyptus-rosemary-mint", label: "Eucalyptus Rosemary Mint" },
    { slug: "grapefruit-bergamot", label: "Grapefruit Bergamot" },
    { slug: "lavender-ylang", label: "Lavender Ylang" },
    { slug: "orange-ginger", label: "Orange Ginger" },
    { slug: "sea-salt-citrus", label: "Sea Salt Citrus" },
  ],
};

const BRAND_DESTINATION: Record<"NI" | "Sassy", string> = {
  Sassy: "Appears on sassyandco.com",
  NI: "Appears on naturalinspirations.com (coming soon)",
};

// Display name composition lives in ./copySheet (shared with the Excel
// import, which recomposes display_name the same way).

// ---------------------------------------------------------------------------
// Fragrance notes — stored in metafields.notes as {top, mid, dry}
// ---------------------------------------------------------------------------
type FragranceNotes = { top?: string; mid?: string; dry?: string };

function getNotes(p: Product): FragranceNotes {
  const m = p.metafields;
  if (
    m &&
    typeof m === "object" &&
    m.notes &&
    typeof m.notes === "object" &&
    !Array.isArray(m.notes)
  ) {
    return m.notes as FragranceNotes;
  }
  return {};
}

// ---------------------------------------------------------------------------
// Text/Textarea inputs
// ---------------------------------------------------------------------------
function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(
        "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 transition focus:outline-none focus:ring-2 focus:ring-gray-300",
        disabled && "cursor-not-allowed bg-gray-50 text-gray-400",
        className
      )}
    />
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  hint,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <TextInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
      {hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}

/** Native select styled to match TextField (same label, height and hint). */
function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={clsx(
            "w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 pr-9 text-sm transition focus:outline-none focus:ring-2 focus:ring-gray-300",
            disabled && "cursor-not-allowed bg-gray-50 text-gray-400",
            !value && !disabled && "text-gray-400",
          )}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value} className="text-gray-900">
              {o.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        >
          <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      </div>
      {hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MoneyField — text input that formats as $1,234.56 on blur
// ---------------------------------------------------------------------------
function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MoneyField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  hint,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const [text, setText] = useState(formatMoney(value));
  const [focused, setFocused] = useState(false);

  // Keep local text in sync when value changes externally and we're not focused
  useEffect(() => {
    if (!focused) setText(formatMoney(value));
  }, [value, focused]);

  function commit() {
    const cleaned = text.replace(/[^\d.-]/g, "");
    if (!cleaned) {
      onChange(null);
      setText("");
      return;
    }
    const n = parseFloat(cleaned);
    if (Number.isFinite(n)) {
      onChange(n);
      setText(formatMoney(n));
    } else {
      onChange(null);
      setText("");
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={placeholder ?? "$0.00"}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => {
          setFocused(true);
          // Strip formatting on focus for easier editing
          if (value != null) setText(String(value));
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        className={clsx(
          "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm tabular-nums transition focus:outline-none focus:ring-2 focus:ring-gray-300",
          disabled && "cursor-not-allowed bg-gray-50 text-gray-400"
        )}
      />
      {hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IntField — text input that formats as 1,234 (no decimals)
// ---------------------------------------------------------------------------
function formatInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  return Math.round(n).toLocaleString("en-US");
}

function IntField({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  disabled,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  suffix?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(formatInt(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatInt(value));
  }, [value, focused]);

  function commit() {
    const cleaned = text.replace(/[^\d]/g, "");
    if (!cleaned) {
      onChange(null);
      setText("");
      return;
    }
    const n = parseInt(cleaned, 10);
    if (Number.isFinite(n)) {
      onChange(n);
      setText(formatInt(n));
    } else {
      onChange(null);
      setText("");
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={text}
          placeholder={placeholder ?? "0"}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            setFocused(true);
            if (value != null) setText(String(Math.round(value)));
          }}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          className={clsx(
            "w-full rounded-lg border border-gray-200 bg-white py-2 text-sm tabular-nums transition focus:outline-none focus:ring-2 focus:ring-gray-300",
            suffix ? "pl-3 pr-14" : "px-3",
            disabled && "cursor-not-allowed bg-gray-50 text-gray-400"
          )}
        />
        {suffix ? (
          <span
            className={clsx(
              "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs uppercase tracking-wide",
              disabled ? "text-gray-300" : "text-gray-400"
            )}
          >
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ColorField — swatch picker + hex input; null means "storefront default"
// ---------------------------------------------------------------------------
function ColorField({
  label,
  value,
  onChange,
  fallback,
  hint,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  /** Swatch color shown while unset (what the storefront would use). */
  fallback: string;
  hint?: string;
}) {
  const [text, setText] = useState(value ?? "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value ?? "");
  }, [value, focused]);

  function commit() {
    const normalized = normalizeHexColor(text);
    onChange(normalized);
    setText(normalized ?? "");
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value ?? fallback}
          onChange={(e) => onChange(e.target.value)}
          className={clsx(
            "h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-white p-0.5",
            value ? "border-gray-200" : "border-dashed border-gray-300 opacity-60"
          )}
          title={value ? value : "Not set — using storefront default"}
        />
        <input
          value={text}
          placeholder="Default"
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm placeholder:text-gray-400 transition focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 rounded-lg px-2 py-2 text-xs font-medium text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            title="Clear — fall back to the storefront palette"
          >
            Clear
          </button>
        ) : null}
      </div>
      {hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card shell
// ---------------------------------------------------------------------------
function Card({
  title,
  hint,
  actions,
  children,
}: {
  title?: string;
  hint?: string;
  /** Right side of the header (status pills, quick controls). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-medium text-gray-900">{title}</h2>
            {hint ? <p className="mt-0.5 text-xs text-gray-400">{hint}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing — two aligned rows (Retail / Wholesale) on the Product card's
// 3-column grid. Never locked: a channel that isn't selling gets a quiet tag,
// so prices can be prepped before publishing.
// ---------------------------------------------------------------------------
function RowHeading({
  title,
  selling,
  notSellingLabel,
}: {
  title: string;
  selling: boolean;
  notSellingLabel: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">{title}</h3>
      {selling ? null : (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
          {notSellingLabel}
        </span>
      )}
    </div>
  );
}

/** Read-only value styled like an input, so computed numbers sit in the grid. */
function ReadoutField({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "good" | "warn";
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <div
        className={clsx(
          "flex h-[38px] items-center rounded-lg border border-dashed px-3 text-sm tabular-nums",
          tone === "good" && "border-green-200 bg-green-50/60 text-green-700",
          tone === "warn" && "border-amber-200 bg-amber-50/60 text-amber-700",
          tone === "muted" && "border-gray-200 bg-gray-50/60 text-gray-400",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function PricingRows({
  form,
  update,
  channel,
}: {
  form: Product;
  update: Update;
  channel: StorefrontChannel;
}) {
  const sellsD2c = channel === "d2c" || channel === "both";
  const sellsWholesale = channel === "wholesale" || channel === "both";

  const msrp = form.msrp ?? null;
  const compareAt = form.compare_at_price ?? null;
  const discountPct =
    msrp != null && compareAt != null && compareAt > msrp
      ? Math.round(((compareAt - msrp) / compareAt) * 100)
      : null;

  const unit = form.wholesale_price ?? null;
  const pack = form.case_pack ?? null;
  const caseTotal = unit != null && pack != null ? unit * pack : null;
  // What a retailer keeps between wholesale cost and MSRP (50% = keystone).
  const margin = unit != null && msrp != null && msrp > 0 ? (msrp - unit) / msrp : null;

  return (
    <div className="space-y-5">
      <div>
        <RowHeading title="Retail (D2C)" selling={sellsD2c || channel === "off"} notSellingLabel="Not selling D2C" />
        <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 md:grid-cols-3">
          <MoneyField label="Price (MSRP)" value={form.msrp} onChange={(v) => update("msrp", v)} />
          <MoneyField
            label="Compare-at price"
            value={form.compare_at_price}
            onChange={(v) => update("compare_at_price", v)}
            placeholder="Optional"
          />
          <ReadoutField
            label="Shoppers see"
            value={discountPct != null ? `−${discountPct}% off` : "Full price"}
            tone={discountPct != null ? "good" : "muted"}
          />
        </div>
      </div>

      <div className="border-t border-gray-100 pt-5">
        <RowHeading
          title="Wholesale"
          selling={sellsWholesale || channel === "off"}
          notSellingLabel="Not selling wholesale"
        />
        <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 md:grid-cols-3">
          <MoneyField
            label="Unit price"
            value={form.wholesale_price}
            onChange={(v) => update("wholesale_price", v)}
          />
          <IntField
            label="Case pack"
            value={form.case_pack}
            onChange={(v) => update("case_pack", v)}
            suffix="units"
            placeholder="12"
          />
          <IntField
            label="Minimum order"
            value={form.moq}
            onChange={(v) => update("moq", v)}
            suffix="cases"
            placeholder="1"
          />
        </div>
        {caseTotal != null || margin != null ? (
          <p className="mt-3 flex flex-wrap gap-x-3 text-xs tabular-nums text-gray-500">
            {caseTotal != null ? (
              <span>
                <span className="font-semibold text-gray-900">{formatMoney(caseTotal)}</span> per case
              </span>
            ) : null}
            {caseTotal != null && margin != null ? <span className="text-gray-300">·</span> : null}
            {margin != null ? (
              <span className={margin < 0.4 ? "text-amber-700" : undefined}>
                Retailer margin{" "}
                <span className={clsx("font-semibold", margin < 0.4 ? "text-amber-700" : "text-gray-900")}>
                  {Math.round(margin * 100)}%
                </span>
                {margin < 0.4 ? " — below the usual 50%" : null}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Availability — where it sells, whether it's purchasable, live on-hand.
// ---------------------------------------------------------------------------
const BRAND_SITE: Record<"NI" | "Sassy", string> = {
  Sassy: "sassyandco.com",
  NI: "naturalinspirations.com",
};

function availabilityLine(channel: StorefrontChannel, brand: "NI" | "Sassy"): string {
  const site = BRAND_SITE[brand] ?? "the storefront";
  switch (channel) {
    case "d2c":
      return `Live for shoppers on ${site}.`;
    case "wholesale":
      return "Live for approved stockists only.";
    case "both":
      return `Live for shoppers on ${site} and for approved stockists.`;
    default:
      return "Draft — hidden from the storefronts.";
  }
}

/* ─── Product header: stock pill + "Published on" multi-select ─── */

function StockPill({ onHand, inStock }: { onHand: number; inStock: boolean }) {
  const out = !inStock || onHand <= 0;
  return (
    <span
      className={clsx(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium tabular-nums",
        out ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700",
      )}
      title={!inStock ? "Marked out of stock (see Availability)" : "On hand from the latest inventory snapshot"}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", out ? "bg-red-500" : "bg-green-500")} />
      {onHand.toLocaleString()} in stock
      {!inStock ? <span className="font-normal text-red-500">· marked out</span> : null}
    </span>
  );
}

/** storefront_channel as two checkboxes: D2C and Wholesale (none = draft). */
function ChannelMultiSelect({
  channel,
  brand,
  archived,
  onChange,
}: {
  channel: StorefrontChannel;
  brand: "NI" | "Sassy";
  archived: boolean;
  onChange: (c: StorefrontChannel) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const d2c = channel === "d2c" || channel === "both";
  const wholesale = channel === "wholesale" || channel === "both";

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function set(nextD2c: boolean, nextWholesale: boolean) {
    onChange(nextD2c && nextWholesale ? "both" : nextD2c ? "d2c" : nextWholesale ? "wholesale" : "off");
  }

  const label = d2c && wholesale ? "D2C + Wholesale" : d2c ? "D2C" : wholesale ? "Wholesale" : "Not published";
  const options = [
    { key: "d2c", title: "D2C", sub: BRAND_SITE[brand] ?? "Storefront", on: d2c, toggle: () => set(!d2c, wholesale) },
    { key: "wholesale", title: "Wholesale", sub: "Approved stockists", on: wholesale, toggle: () => set(d2c, !wholesale) },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={clsx(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition",
          channel === "off"
            ? "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
            : "border-gray-900 bg-gray-900 text-white",
        )}
        title="Where this product is published"
      >
        <span className={clsx("font-normal", channel === "off" ? "text-gray-400" : "text-gray-300")}>Published on</span>
        {label}
        <svg viewBox="0 0 20 20" fill="none" className={clsx("h-3.5 w-3.5 transition-transform", open && "rotate-180")}>
          <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={o.toggle}
              aria-pressed={o.on}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50"
            >
              <span
                className={clsx(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  o.on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300",
                )}
              >
                {o.on ? (
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
                    <path d="M2.5 6.5l2.2 2L9.5 3.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                  </svg>
                ) : null}
              </span>
              <span>
                <span className="block text-sm font-medium text-gray-900">{o.title}</span>
                <span className="block text-[11px] text-gray-400">{o.sub}</span>
              </span>
            </button>
          ))}
          <div className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-400">
            {archived
              ? "Archived products always stay draft — un-archive to publish."
              : "Untick both to keep it as a draft."}
          </div>
        </div>
      )}
    </div>
  );
}

function AvailabilityRow({
  form,
  update,
  channel,
}: {
  form: Product;
  update: Update;
  channel: StorefrontChannel;
}) {
  const archived = form.is_forecasted === false;
  return (
    <div>
      <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 md:grid-cols-3">
        <SelectField
          label="In stock?"
          value={form.storefront_in_stock === false ? "no" : "yes"}
          onChange={(v) => update("storefront_in_stock", v === "yes")}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No — show it, but disable buying" },
          ]}
        />
      </div>
      <p
        className={clsx(
          "mt-3 flex items-center gap-1.5 text-xs",
          channel === "off" ? "text-gray-500" : "text-green-700",
        )}
      >
        <span
          className={clsx(
            "h-1.5 w-1.5 rounded-full",
            channel === "off" ? "bg-gray-400" : "bg-green-500",
          )}
        />
        {availabilityLine(channel, form.brand)}
        {archived ? (
          <span className="text-amber-700"> Archived products always stay draft.</span>
        ) : null}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
export type DetailsSectionProps = {
  form: Product;
  update: Update;
  isNewProduct: boolean;
  copy: Record<CopyKey, string>;
  updateCopy: (k: CopyKey, v: string) => void;
  /** Current on-hand quantity for this part (latest inventory snapshot). */
  onHand?: number;
};

export function DetailsSection({
  form,
  update,
  isNewProduct,
  copy,
  updateCopy,
  onHand = 0,
}: DetailsSectionProps) {
  const channel: StorefrontChannel = form.storefront_channel ?? "off";

  const brandCollections = COLLECTIONS[form.brand] ?? [];
  const collectionInThisBrand = brandCollections.some(
    (c) => c.slug === form.collection
  );

  const missingCopy: string[] = [];
  if (!copy.short_description.trim()) missingCopy.push("Short description");
  if (!copy.long_description.trim()) missingCopy.push("Long description");
  if (!copy.benefits.trim()) missingCopy.push("Benefits");
  if (!copy.ingredients_text.trim()) missingCopy.push("Ingredients");
  const copyComplete = missingCopy.length === 0;

  const notes = getNotes(form);

  /** Update a structured name part and recompose display_name with it. */
  function applyNameParts(patch: {
    product_name?: string | null;
    product_form?: string | null;
    is_tester?: boolean;
  }) {
    if ("product_name" in patch) update("product_name", patch.product_name ?? null);
    if ("product_form" in patch) update("product_form", patch.product_form ?? null);
    if ("is_tester" in patch) update("is_tester", patch.is_tester ?? false);
    const next = composeDisplayName({ ...form, ...patch });
    if (next) update("display_name", next);
  }

  /** Write one fragrance note into metafields.notes, pruning empties. */
  function updateNote(key: keyof FragranceNotes, v: string) {
    const nextNotes: FragranceNotes = { ...notes };
    if (v.trim()) nextNotes[key] = v;
    else delete nextNotes[key];
    const metafields = { ...(form.metafields ?? {}) } as Record<string, unknown>;
    if (Object.keys(nextNotes).length > 0) metafields.notes = nextNotes;
    else delete metafields.notes;
    update("metafields", metafields);
  }

  return (
    <LayoutGroup>
      <div className="space-y-5">
        {/* ── PRODUCT ── one 3-column grid so every input lines up:
            Brand · Collection · Type / name parts + fragrance / SKU · Barcode · Size.
            display_name is still recomposed from the name parts (the
            storefronts parse it), it just isn't shown. */}
        <Card
          title="Product"
          actions={
            <>
              <StockPill onHand={onHand} inStock={form.storefront_in_stock !== false} />
              <ChannelMultiSelect
                channel={channel}
                brand={form.brand}
                archived={form.is_forecasted === false}
                onChange={(c) => update("storefront_channel", c)}
              />
            </>
          }
        >
          <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 md:grid-cols-3">
            <SelectField
              label="Brand"
              value={form.brand}
              onChange={(v) => {
                const b = v as "NI" | "Sassy";
                update("brand", b);
                if (
                  form.collection &&
                  !COLLECTIONS[b].some((c) => c.slug === form.collection)
                ) {
                  update("collection", null);
                }
                // Brand changes the display-name convention.
                const next = composeDisplayName({ ...form, brand: b });
                if (next) update("display_name", next);
              }}
              options={[
                { value: "NI", label: "Natural Inspirations" },
                { value: "Sassy", label: "Sassy" },
              ]}
              hint={BRAND_DESTINATION[form.brand]}
            />
            <SelectField
              label="Collection"
              value={form.collection ?? ""}
              onChange={(v) => update("collection", v || null)}
              placeholder="Select a collection"
              options={[
                ...brandCollections.map((c) => ({ value: c.slug, label: c.label })),
                ...(form.collection && !collectionInThisBrand
                  ? [{ value: form.collection, label: `${form.collection} (legacy)` }]
                  : []),
              ]}
              disabled={!form.brand}
              hint={form.brand === "Sassy" ? "Love, Everyday or Holiday" : "One per fragrance line"}
            />
            <SelectField
              label="Product type"
              value={form.product_type}
              onChange={(v) => update("product_type", v as Product["product_type"])}
              options={[
                { value: "FG", label: "Finished good (FG)" },
                { value: "BOM", label: "Component (BOM)" },
              ]}
            />

            {form.brand === "Sassy" ? (
              <TextField
                label="Product name"
                value={form.product_name}
                onChange={(v) => applyNameParts({ product_name: v || null })}
                placeholder="Bougie Babe"
                hint="The personality"
              />
            ) : null}
            <TextField
              label="Form / format"
              value={form.product_form}
              onChange={(v) => applyNameParts({ product_form: v || null })}
              placeholder={form.brand === "Sassy" ? "Mini Hand Crème" : "Hand + Body Lotion"}
              hint="The physical format shoppers see"
            />
            <FragranceMultiSelect
              label="Fragrance"
              brand={form.brand}
              value={form.fragrance}
              onChange={(v) => update("fragrance", v)}
              placeholder={form.brand === "Sassy" ? "Eucalyptus Mint" : "Sea Salt"}
              hint="Pick several for a gift set"
            />
            {form.brand === "NI" ? (
              <SelectField
                label="Is this a tester?"
                value={form.is_tester ? "yes" : "no"}
                onChange={(v) => applyNameParts({ is_tester: v === "yes" })}
                options={[
                  { value: "no", label: "No" },
                  { value: "yes", label: "Yes" },
                ]}
              />
            ) : null}

            <TextField
              label="SKU / Part #"
              value={form.part}
              onChange={(v) => update("part", v)}
              disabled={!isNewProduct}
              placeholder="123-00-01"
              hint={isNewProduct ? "Locks once saved" : "Locked after it has shipped"}
            />
            <TextField
              label="Barcode (UPC / EAN)"
              value={form.barcode}
              onChange={(v) => update("barcode", v)}
              placeholder="816141017384"
            />
            <TextField
              label="Size"
              value={form.size}
              onChange={(v) => update("size", v)}
              placeholder="2oz"
              hint="Leave blank if not applicable"
            />
          </div>
        </Card>

        {/* ── PRICING ── right under Product: what it is, then what it costs. */}
        <Card title="Pricing & quantity">
          <PricingRows form={form} update={update} channel={channel} />
        </Card>

        {/* ── AVAILABILITY ── */}
        <Card title="Availability">
          <AvailabilityRow form={form} update={update} channel={channel} />
        </Card>

        {/* ── MARKETING COPY (merged with old Copy tab) ── */}
        <Card
          title="Marketing copy"
          hint="The copy that ships to sassyandco.com product pages and to retailer line sheets."
        >
          {/* Completeness banner */}
          {copyComplete ? (
            <div className="mb-5 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
              <CheckCircle size={14} />
              All copy complete
            </div>
          ) : (
            <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <AlertTriangle size={14} className="mt-0.5 text-amber-500" />
              <div className="text-xs text-amber-800">
                <span className="font-medium">Missing copy:</span>{" "}
                <span className="text-amber-700">
                  {missingCopy.join(", ")}
                </span>
              </div>
            </div>
          )}

          {/* Headline-level (single line) fields */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField
              label="Infused with"
              value={form.infused_with}
              onChange={(v) => update("infused_with", v)}
              placeholder="GLAM + LUXE ELEGANCE"
              hint="Renders as “infused with …” — don’t repeat the prefix."
            />
            <TextField
              label="Category path"
              value={form.category_path}
              onChange={(v) => update("category_path", v)}
              placeholder="Lotions & Moisturizers in Skin Care"
            />
          </div>

          {/* Fragrance notes → metafields.notes {top, mid, dry} */}
          <div className="mt-5 border-t border-gray-100 pt-5">
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-500">
                Fragrance notes
              </div>
              <p className="text-[11px] text-gray-400">
                Optional — powers a notes section on product pages once
                filled.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <TextField
                label="Top"
                value={notes.top ?? ""}
                onChange={(v) => updateNote("top", v)}
                placeholder="pistachio, almond"
              />
              <TextField
                label="Mid"
                value={notes.mid ?? ""}
                onChange={(v) => updateNote("mid", v)}
                placeholder="jasmine petals"
              />
              <TextField
                label="Dry"
                value={notes.dry ?? ""}
                onChange={(v) => updateNote("dry", v)}
                placeholder="vanilla, sandalwood"
              />
            </div>
          </div>

          {/* Longer copy */}
          <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
            <RichTextField
              label="Short description"
              value={copy.short_description}
              onChange={(v) => updateCopy("short_description", v)}
              rows={2}
              placeholder="The hook — persona voice for Sassy, scent story for NI."
              softMax={160}
              hint="Doubles as the page lead AND the Google search snippet — keep it under 160 characters."
            />
            <RichTextField
              label="Long description"
              value={copy.long_description}
              onChange={(v) => updateCopy("long_description", v)}
              rows={4}
              placeholder="Canonical description used on the product page and by retailers."
              hint="Formula facts. Sharing one paragraph across same-formula SKUs is fine — the short description carries the differentiation."
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <RichTextField
                label="Benefits"
                value={copy.benefits}
                onChange={(v) => updateCopy("benefits", v)}
                rows={4}
                placeholder={
                  "Deeply hydrating\nFast-absorbing\nPlane-approved"
                }
                hint="Use the bulleted-list button for one benefit per line — the storefronts show them as bullets."
              />
              <RichTextField
                label="Ingredients"
                value={copy.ingredients_text}
                onChange={(v) => updateCopy("ingredients_text", v)}
                rows={4}
                placeholder="Water (Aqua), Shea Butter, Squalane, ..."
                hint="Full INCI list, comma-separated."
              />
            </div>
            <RichTextField
              label="How to use"
              value={copy.how_to_use}
              onChange={(v) => updateCopy("how_to_use", v)}
              rows={2}
              placeholder="Apply generously. Accept compliments."
              hint="Application directions for the product page."
            />
            <RichTextField
              label="Retailer notes"
              value={copy.retailer_notes}
              onChange={(v) => updateCopy("retailer_notes", v)}
              rows={2}
              placeholder="Usage guidance, merchandising tips, restrictions…"
              hint="Internal + line sheets only — never shown on the storefronts."
            />
          </div>
        </Card>

        {/* ── PAGE COLORS ── */}
        <Card
          title="Product page colors"
          hint="Drives the storefront product page. Empty fields fall back to the brand's built-in collection palette."
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_240px]">
            <div className="space-y-4">
              <ColorField
                label="Background"
                value={form.page_bg_color}
                onChange={(v) => update("page_bg_color", v)}
                fallback="#fbf9f4"
                hint="Page background behind the whole product page."
              />
              <ColorField
                label="Headline"
                value={form.page_heading_color}
                onChange={(v) => update("page_heading_color", v)}
                fallback={form.page_text_color ?? "#2a3b35"}
                hint="Product name + section headings. Falls back to the body color when empty."
              />
              <ColorField
                label="Body copy"
                value={form.page_text_color}
                onChange={(v) => update("page_text_color", v)}
                fallback="#2a3b35"
                hint="Paragraphs and body text."
              />
              <ColorField
                label="Accent"
                value={form.page_accent_color}
                onChange={(v) => update("page_accent_color", v)}
                fallback="#44705f"
                hint="Links and highlights."
              />
              <ColorField
                label="Buy button"
                value={form.page_button_color}
                onChange={(v) => update("page_button_color", v)}
                fallback={form.page_accent_color ?? "#44705f"}
                hint="Main Buy button on the Sassy product page. Falls back to the accent color."
              />
            </div>

            {/* Live preview */}
            <div
              className="flex flex-col justify-between rounded-xl border border-gray-200 px-4 py-4 transition-colors"
              style={{
                backgroundColor: form.page_bg_color ?? "#f9fafb",
                color: form.page_text_color ?? "#111827",
              }}
            >
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] opacity-60">
                  Preview
                </div>
                <div
                  className="mt-2 text-base font-semibold leading-snug"
                  style={{
                    color:
                      form.page_heading_color ??
                      form.page_text_color ??
                      "#111827",
                  }}
                >
                  {form.display_name || "Product name"}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed opacity-80">
                  {richTextToPlain(copy.short_description) || "Short description copy appears here in the text color."}
                </p>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span
                  className="rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{
                    backgroundColor: form.page_accent_color ?? "#374151",
                    color: form.page_bg_color ?? "#ffffff",
                  }}
                >
                  Add to bag
                </span>
                <span
                  className="text-xs font-medium underline underline-offset-2"
                  style={{ color: form.page_accent_color ?? "#374151" }}
                >
                  Learn more
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* ── SHIPPING ── */}
        <Card
          title="Shipping & customs"
          hint="Used for box selection, customs, and tax."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <IntField
              label="Weight"
              value={form.weight_oz}
              onChange={(v) => update("weight_oz", v)}
              suffix="oz"
              placeholder="0"
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
            />
          </div>
        </Card>
      </div>
    </LayoutGroup>
  );
}
