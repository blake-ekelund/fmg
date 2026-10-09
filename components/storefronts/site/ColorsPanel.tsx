"use client";

import { useState } from "react";
import { ChevronDown, Palette, RotateCcw, X } from "lucide-react";
import { SECTION_BG, THEME_TOKENS, type BlockColors } from "@/lib/site/pageBlocks";
import type { SiteBrand } from "@/lib/site/registry";

/**
 * Color controls for the Website editor. Colors are the store's own theme
 * tokens (pageBlocks THEME_TOKENS): the Colors page sets them site-wide, and
 * a block's Colors section overrides them for that block only.
 */

const HEX = /^#[0-9a-f]{6}$/i;

/** The site palette as picker chips (deduped by color). */
function chipsFor(brand: SiteBrand, palette: BlockColors) {
  const seen = new Set<string>();
  return THEME_TOKENS[brand]
    .map((t) => ({ label: t.label, color: palette[t.key] ?? t.value }))
    .filter((c) => !seen.has(c.color.toLowerCase()) && seen.add(c.color.toLowerCase()));
}

function Swatch({ color, size = 28 }: { color: string | null; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-md border border-black/10 shadow-inner"
      style={{
        width: size,
        height: size,
        background: color ?? "repeating-conic-gradient(#e5e7eb 0 25%, #fff 0 50%) 50% / 10px 10px",
      }}
    />
  );
}

/** Hex text box that only commits a complete #rrggbb. */
function HexInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setDraft(value);
  }
  return (
    <input
      value={draft}
      maxLength={7}
      spellCheck={false}
      onChange={(e) => {
        const v = e.target.value.trim();
        setDraft(v);
        const full = v.startsWith("#") ? v : `#${v}`;
        if (HEX.test(full)) onCommit(full.toUpperCase());
      }}
      onBlur={() => setDraft(value)}
      className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-mono text-xs text-gray-800 outline-none focus:border-indigo-400"
    />
  );
}

/**
 * One color: a swatch row that opens a picker with the site's palette and a
 * custom color. `value` is the override (undefined = follows `inherited`).
 */
function ColorRow({
  label,
  hint,
  value,
  inherited,
  inheritedLabel,
  chips,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string | undefined;
  /** What shows when there's no override (null = nothing, e.g. no band). */
  inherited: string | null;
  inheritedLabel: string;
  chips: { label: string; color: string }[];
  onChange: (v: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = value ?? inherited;
  return (
    <div className={`rounded-lg border ${open ? "border-indigo-200 bg-indigo-50/30" : "border-transparent"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-gray-50"
      >
        <Swatch color={shown} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-gray-800">{label}</span>
          {hint ? <span className="block truncate text-[10.5px] text-gray-400">{hint}</span> : null}
        </span>
        {value ? (
          <span className="font-mono text-[10px] text-indigo-600">{value.toUpperCase()}</span>
        ) : (
          <span className="text-[10px] text-gray-400">{inheritedLabel}</span>
        )}
      </button>
      {open ? (
        <div className="space-y-2 px-1.5 pb-2 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.color}
                type="button"
                title={`${c.label} ${c.color.toUpperCase()}`}
                onClick={() => onChange(c.color.toUpperCase())}
                className={`rounded-md p-0.5 ${
                  value?.toLowerCase() === c.color.toLowerCase() ? "ring-2 ring-indigo-500" : "hover:ring-2 hover:ring-gray-300"
                }`}
              >
                <Swatch color={c.color} size={22} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={HEX.test(shown ?? "") ? shown! : "#ffffff"}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-white p-0.5"
              aria-label={`Custom ${label.toLowerCase()} color`}
            />
            <HexInput value={(shown ?? "").toUpperCase()} onCommit={onChange} />
            {value ? (
              <button
                type="button"
                onClick={() => onChange(undefined)}
                title={`Back to ${inheritedLabel.toLowerCase()}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                <X size={12} /> {inheritedLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function setKey(colors: BlockColors | undefined, key: string, v: string | undefined): BlockColors {
  const next = { ...(colors ?? {}) };
  if (v) next[key] = v;
  else delete next[key];
  return next;
}

/** The Colors page: the site palette. */
export function PaletteForm({
  brand,
  palette,
  onChange,
}: {
  brand: SiteBrand;
  palette: BlockColors;
  onChange: (p: BlockColors) => void;
}) {
  const chips = chipsFor(brand, palette);
  const changed = THEME_TOKENS[brand].filter((t) => palette[t.key] && palette[t.key].toLowerCase() !== t.value.toLowerCase());
  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-gray-500">
        Each color is used all over the site — the preview shows a sample of every one, then the homepage. Publish to
        put the new colors live on every page.
      </p>
      <div className="space-y-0.5">
        {THEME_TOKENS[brand].map((t) => (
          <ColorRow
            key={t.key}
            label={t.label}
            hint={t.hint}
            value={palette[t.key] && palette[t.key].toLowerCase() !== t.value.toLowerCase() ? palette[t.key] : undefined}
            inherited={t.value}
            inheritedLabel="Original"
            chips={chips}
            onChange={(v) => onChange(setKey(palette, t.key, v))}
          />
        ))}
      </div>
      {changed.length ? (
        <button
          type="button"
          onClick={() => {
            if (confirm("Put every color back to the original?")) onChange({});
          }}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-800"
        >
          <RotateCcw size={12} /> Reset all {changed.length} to the original colors
        </button>
      ) : null}
    </div>
  );
}

/** A block's own colors, over the site palette. */
export function BlockColorsPanel({
  brand,
  colors,
  palette,
  onChange,
}: {
  brand: SiteBrand;
  colors: BlockColors | undefined;
  /** The site palette (Colors page draft), every token filled. */
  palette: BlockColors;
  onChange: (c: BlockColors | undefined) => void;
}) {
  const count = Object.keys(colors ?? {}).length;
  const [open, setOpen] = useState(count > 0);
  const chips = chipsFor(brand, palette);
  const set = (key: string, v: string | undefined) => {
    const next = setKey(colors, key, v);
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className="mt-5 border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left text-xs font-semibold text-gray-700"
      >
        <Palette size={13} className="text-gray-400" />
        <span className="flex-1">
          Colors
          {count ? <span className="ml-1.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">{count} changed</span> : null}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="mt-2 space-y-0.5">
          <p className="mb-2 text-[11px] leading-relaxed text-gray-500">
            For this block only. Anything left on <em>Site color</em> follows the site&apos;s Colors page.
          </p>
          <ColorRow
            label="Background band"
            hint="A full-width color behind the whole block."
            value={colors?.[SECTION_BG]}
            inherited={null}
            inheritedLabel="None"
            chips={chips}
            onChange={(v) => set(SECTION_BG, v)}
          />
          {THEME_TOKENS[brand].map((t) => (
            <ColorRow
              key={t.key}
              label={t.label}
              hint={t.hint}
              value={colors?.[t.key]}
              inherited={palette[t.key] ?? t.value}
              inheritedLabel="Site color"
              chips={chips}
              onChange={(v) => set(t.key, v)}
            />
          ))}
          {count ? (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-800"
            >
              <RotateCcw size={12} /> Use the site colors for everything
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
