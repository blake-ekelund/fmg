"use client";

import { useEffect, useState } from "react";
import { motion, LayoutGroup } from "framer-motion";
import clsx from "clsx";
import {
  AlertTriangle,
  CheckCircle,
  EyeOff,
  Globe,
  Lock,
  Package,
  Sparkles,
} from "lucide-react";

import type { Product, StorefrontChannel } from "@/components/inventory/types";
import { composeDisplayName, normalizeHexColor } from "./copySheet";

type Update = <K extends keyof Product>(key: K, value: Product[K]) => void;

export type CopyKey =
  | "short_description"
  | "long_description"
  | "benefits"
  | "ingredients_text"
  | "how_to_use"
  | "retailer_notes";

const EASE = [0.22, 1, 0.36, 1] as const;

// ---------------------------------------------------------------------------
// Brand → collection options
// ---------------------------------------------------------------------------
const COLLECTIONS: Record<"NI" | "Sassy", { slug: string; label: string }[]> = {
  Sassy: [
    { slug: "everyday", label: "Everyday" },
    { slug: "love", label: "Love" },
    { slug: "holiday", label: "Holiday" },
  ],
  NI: [
    { slug: "agave-pear", label: "Agave Pear" },
    { slug: "coconut-ambre-vanille", label: "Coconut Ambre Vanille" },
    { slug: "cypres", label: "Cyprès" },
    { slug: "eucalyptus-rosemary-mint", label: "Eucalyptus Rosemary Mint" },
    { slug: "grapefruit-bergamot", label: "Grapefruit Bergamot" },
    { slug: "lavender-ylang", label: "Lavender Ylang" },
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
// Channel toggle
// ---------------------------------------------------------------------------
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
    hint: "Draft mode",
    Icon: EyeOff,
    activeClass: "bg-gray-900 text-white border-gray-900",
    iconClass: "text-gray-500",
  },
  {
    value: "d2c",
    label: "D2C only",
    hint: "Retail only",
    Icon: Globe,
    activeClass: "bg-pink-50 text-pink-700 border-pink-300 ring-2 ring-pink-200",
    iconClass: "text-pink-500",
  },
  {
    value: "wholesale",
    label: "Wholesale only",
    hint: "Stockists only",
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

function ChannelToggle({
  value,
  onChange,
}: {
  value: StorefrontChannel;
  onChange: (v: StorefrontChannel) => void;
}) {
  return (
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
  );
}

function StatusBanner({ channel }: { channel: StorefrontChannel }) {
  const map: Record<
    StorefrontChannel,
    { bg: string; text: string; label: string; sub: string }
  > = {
    off: {
      bg: "bg-gray-100",
      text: "text-gray-700",
      label: "Draft — hidden from storefront",
      sub: "Both pricing columns stay editable so you can prep data before publishing.",
    },
    d2c: {
      bg: "bg-pink-100",
      text: "text-pink-700",
      label: "Live on sassyandco.com (D2C only)",
      sub: "Wholesale column is locked. Switch to Both to also sell to stockists.",
    },
    wholesale: {
      bg: "bg-indigo-100",
      text: "text-indigo-700",
      label: "Live for wholesale (only)",
      sub: "D2C column is locked. Switch to Both to also sell on sassyandco.com.",
    },
    both: {
      bg: "bg-gradient-to-r from-pink-100 to-indigo-100",
      text: "text-gray-800",
      label: "Live on both channels",
      sub: "Visible to retail shoppers and approved stockists.",
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

function TextareaField({
  label,
  value,
  onChange,
  rows,
  placeholder,
  hint,
  /** Show a live character counter that turns amber past this length. */
  softMax,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  hint?: string;
  softMax?: number;
}) {
  const over = softMax != null && value.length > softMax;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-gray-500">{label}</label>
        {softMax != null ? (
          <span
            className={clsx(
              "text-[11px] tabular-nums",
              over ? "font-semibold text-amber-600" : "text-gray-400"
            )}
          >
            {value.length}/{softMax}
          </span>
        ) : null}
      </div>
      <textarea
        rows={rows ?? 3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition focus:outline-none focus:ring-2 focus:ring-gray-300"
      />
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
  children,
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {title ? (
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-900">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-gray-400">{hint}</p> : null}
        </div>
      ) : null}
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing columns
// ---------------------------------------------------------------------------
function D2cColumn({
  form,
  update,
  active,
}: {
  form: Product;
  update: Update;
  active: boolean;
}) {
  const msrp = form.msrp ?? null;
  const compareAt = form.compare_at_price ?? null;
  const showDiscount = msrp != null && compareAt != null && compareAt > msrp;
  const discountPct = showDiscount
    ? Math.round(((compareAt! - msrp!) / compareAt!) * 100)
    : null;

  return (
    <motion.div
      layout
      animate={{ opacity: active ? 1 : 0.45 }}
      transition={{ duration: 0.2, ease: EASE }}
      className={clsx(
        "rounded-xl border p-4 transition-colors",
        active
          ? "border-pink-200 bg-pink-50/30"
          : "border-gray-200 bg-gray-50/40"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={14} className={active ? "text-pink-500" : "text-gray-400"} />
          <h3 className={clsx("text-sm font-semibold", active ? "text-pink-700" : "text-gray-500")}>
            D2C
          </h3>
          {active ? null : <Lock size={11} className="text-gray-400" aria-label="locked" />}
        </div>
        {active && showDiscount ? (
          <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[11px] font-semibold text-pink-700">
            −{discountPct}% off
          </span>
        ) : null}
      </div>
      <div className="space-y-3">
        <MoneyField
          label="Price (MSRP)"
          value={form.msrp}
          onChange={(v) => update("msrp", v)}
          disabled={!active}
        />
        <MoneyField
          label="Compare-at"
          value={form.compare_at_price}
          onChange={(v) => update("compare_at_price", v)}
          disabled={!active}
          hint="Shown as strikethrough if higher than MSRP."
        />
      </div>
    </motion.div>
  );
}

function WholesaleColumn({
  form,
  update,
  active,
}: {
  form: Product;
  update: Update;
  active: boolean;
}) {
  const unit = form.wholesale_price ?? null;
  const pack = form.case_pack ?? null;
  const caseTotal = unit != null && pack != null ? unit * pack : null;

  return (
    <motion.div
      layout
      animate={{ opacity: active ? 1 : 0.45 }}
      transition={{ duration: 0.2, ease: EASE }}
      className={clsx(
        "rounded-xl border p-4 transition-colors",
        active
          ? "border-indigo-200 bg-indigo-50/30"
          : "border-gray-200 bg-gray-50/40"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={14} className={active ? "text-indigo-500" : "text-gray-400"} />
          <h3 className={clsx("text-sm font-semibold", active ? "text-indigo-700" : "text-gray-500")}>
            Wholesale
          </h3>
          {active ? null : <Lock size={11} className="text-gray-400" aria-label="locked" />}
        </div>
        {active && caseTotal !== null ? (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 tabular-nums">
            {formatMoney(caseTotal)} / case
          </span>
        ) : null}
      </div>
      <div className="space-y-3">
        <MoneyField
          label="Per-unit price"
          value={form.wholesale_price}
          onChange={(v) => update("wholesale_price", v)}
          disabled={!active}
        />
        <div className="grid grid-cols-2 gap-3">
          <IntField
            label="Case pack"
            value={form.case_pack}
            onChange={(v) => update("case_pack", v)}
            suffix="units"
            placeholder="12"
            disabled={!active}
          />
          <IntField
            label="MOQ"
            value={form.moq}
            onChange={(v) => update("moq", v)}
            suffix="cases"
            placeholder="1"
            disabled={!active}
          />
        </div>
      </div>
    </motion.div>
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

  const d2cActive = channel === "off" || channel === "d2c" || channel === "both";
  const wholesaleActive =
    channel === "off" || channel === "wholesale" || channel === "both";

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

  const composed = composeDisplayName(form);
  const displayNameGenerated = composed.length > 0;
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
        {/* ── PRODUCT ── */}
        <Card title="Product">
          {/* Structured name parts — these compose the display name. */}
          <div
            className={clsx(
              "grid grid-cols-1 gap-5",
              form.brand === "Sassy"
                ? "md:grid-cols-2"
                : "md:grid-cols-[1fr_auto]"
            )}
          >
            {form.brand === "Sassy" ? (
              <TextField
                label="Product name"
                value={form.product_name}
                onChange={(v) => applyNameParts({ product_name: v || null })}
                placeholder="Bougie Babe"
                hint="The personality. Pairs with the form to build the display name."
              />
            ) : null}
            <TextField
              label="Form / format"
              value={form.product_form}
              onChange={(v) => applyNameParts({ product_form: v || null })}
              placeholder={
                form.brand === "Sassy" ? "Mini Hand Crème" : "Hand + Body Lotion"
              }
              hint="The physical format shoppers see."
            />
            {form.brand === "NI" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">
                  Tester unit
                </label>
                <button
                  type="button"
                  onClick={() => applyNameParts({ is_tester: !form.is_tester })}
                  className={clsx(
                    "flex h-[38px] items-center rounded-lg border px-4 text-sm font-medium transition",
                    form.is_tester
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100"
                      : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
                  )}
                >
                  {form.is_tester ? "TESTER" : "Not a tester"}
                </button>
              </div>
            ) : null}
          </div>

          {/* Display Name — composed from the parts above; the storefronts
              parse this string, so hand-typing it is the legacy fallback. */}
          <div className="mt-5 space-y-1.5">
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-medium text-gray-500">
                Display name
              </label>
              {displayNameGenerated ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  auto-composed
                </span>
              ) : null}
            </div>
            <TextInput
              value={form.display_name}
              onChange={(v) => update("display_name", v)}
              disabled={displayNameGenerated}
              placeholder={
                form.brand === "Sassy"
                  ? "Bougie Babe – Mini Hand Crème"
                  : "Hand + Body Lotion"
              }
              className="!py-3 !text-base font-medium"
            />
            <p className="text-[11px] text-gray-400">
              {displayNameGenerated
                ? form.brand === "Sassy"
                  ? "Composed as “name – form”. The storefront splits on that dash — composing keeps it exact."
                  : "Composed from the form (plus TESTER when flagged). The NI storefront adds the fragrance to titles."
                : "Fill the fields above to compose this automatically. Manual entries must match the brand convention exactly."}
            </p>
          </div>

          {/* Brand + Collection */}
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">Brand</label>
              <div className="flex gap-2">
                {(["NI", "Sassy"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
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
                    className={clsx(
                      "flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition",
                      form.brand === b
                        ? b === "NI"
                          ? "bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-100"
                          : "bg-pink-50 text-pink-700 border-pink-300 ring-2 ring-pink-100"
                        : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400">
                {BRAND_DESTINATION[form.brand]}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">
                Collection
              </label>
              <div className="relative">
                <select
                  value={form.collection ?? ""}
                  onChange={(e) =>
                    update("collection", e.target.value || null)
                  }
                  className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  <option value="">— Select a collection —</option>
                  {brandCollections.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                  {form.collection && !collectionInThisBrand ? (
                    <option value={form.collection}>
                      {form.collection} (legacy)
                    </option>
                  ) : null}
                </select>
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                >
                  <path
                    d="M6 8l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <p className="text-[11px] text-gray-400">
                {form.brand === "Sassy"
                  ? "Sassy: everyday, love, or holiday."
                  : "NI: per fragrance line."}
              </p>
            </div>
          </div>

          {/* SKU + Barcode side-by-side */}
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <TextField
              label="SKU / Part #"
              value={form.part}
              onChange={(v) => update("part", v)}
              disabled={!isNewProduct}
              placeholder="123-00-01"
              hint={
                isNewProduct
                  ? "Locks once saved."
                  : "Locked after a product has shipped."
              }
            />
            <TextField
              label="Barcode (UPC / EAN)"
              value={form.barcode}
              onChange={(v) => update("barcode", v)}
              placeholder="816141017384"
            />
          </div>

          {/* Product Type + Fragrance + Size */}
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">
                Product type
              </label>
              <div className="flex gap-2">
                {(["FG", "BOM"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => update("product_type", t)}
                    className={clsx(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition",
                      form.product_type === t
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <TextField
              label="Fragrance"
              value={form.fragrance}
              onChange={(v) => update("fragrance", v)}
              placeholder={
                form.brand === "Sassy" ? "Eucalyptus Mint" : "Sea Salt"
              }
              hint={
                form.brand === "Sassy"
                  ? "The scent, not the product name."
                  : "NI storefront matches collections on this value."
              }
            />
            <TextField
              label="Size"
              value={form.size}
              onChange={(v) => update("size", v)}
              placeholder="2oz"
              hint="Leave blank if not applicable — placeholder text like “N/A” shows up on storefronts."
            />
          </div>
        </Card>

        {/* ── PUBLISH ── */}
        <Card title="Publish" hint="Where this product is visible.">
          <div className="space-y-4">
            <ChannelToggle
              value={channel}
              onChange={(v) => update("storefront_channel", v)}
            />
            <StatusBanner channel={channel} />

            {/* Availability — manual flag + live on-hand the storefronts read. */}
            <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.storefront_in_stock !== false}
                  onChange={(e) =>
                    update("storefront_in_stock", e.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    In stock
                  </div>
                  <p className="text-xs text-gray-400">
                    Uncheck to mark out of stock — keeps the product visible but
                    lets the storefronts disable purchasing.
                  </p>
                </div>
              </label>
              <div className="shrink-0 text-right">
                <div className="text-base font-semibold text-gray-900 tabular-nums">
                  {onHand.toLocaleString()}
                </div>
                <div className="text-[11px] uppercase tracking-wider text-gray-400">
                  On hand
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ── PRICING (side-by-side) ── */}
        <Card
          title="Pricing & quantity"
          hint="D2C and wholesale run in parallel. The channel above controls which side is locked."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <D2cColumn form={form} update={update} active={d2cActive} />
            <WholesaleColumn
              form={form}
              update={update}
              active={wholesaleActive}
            />
          </div>
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
            <TextareaField
              label="Short description"
              value={copy.short_description}
              onChange={(v) => updateCopy("short_description", v)}
              rows={2}
              placeholder="The hook — persona voice for Sassy, scent story for NI."
              softMax={160}
              hint="Doubles as the page lead AND the Google search snippet — keep it under 160 characters."
            />
            <TextareaField
              label="Long description"
              value={copy.long_description}
              onChange={(v) => updateCopy("long_description", v)}
              rows={4}
              placeholder="Canonical description used on the product page and by retailers."
              hint="Formula facts. Sharing one paragraph across same-formula SKUs is fine — the short description carries the differentiation."
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextareaField
                label="Benefits"
                value={copy.benefits}
                onChange={(v) => updateCopy("benefits", v)}
                rows={4}
                placeholder={
                  "Deeply hydrating\nFast-absorbing\nPlane-approved"
                }
                hint="One benefit per line — the storefronts render each line as a bullet."
              />
              <TextareaField
                label="Ingredients"
                value={copy.ingredients_text}
                onChange={(v) => updateCopy("ingredients_text", v)}
                rows={4}
                placeholder="Water (Aqua), Shea Butter, Squalane, ..."
                hint="Full INCI list, comma-separated."
              />
            </div>
            <TextareaField
              label="How to use"
              value={copy.how_to_use}
              onChange={(v) => updateCopy("how_to_use", v)}
              rows={2}
              placeholder="Apply generously. Accept compliments."
              hint="Application directions for the product page."
            />
            <TextareaField
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
                  {copy.short_description || "Short description copy appears here in the text color."}
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
