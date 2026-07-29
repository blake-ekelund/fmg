"use client";

import { createContext, useContext, useRef, useState } from "react";
import { Tag, Upload, Loader2, Images } from "lucide-react";
import type { EmailBlock, BlockType, SectionColumn, VAlign, Brand, Channel } from "./types";
import { newBlockId, BRAND_PRESETS } from "./types";
import { uploadEmailImage } from "./uploadEmailImage";
import MediaLibraryModal from "./MediaLibraryModal";
import MergeFieldTextarea from "@/components/email/MergeFieldTextarea";
import clsx from "clsx";

/* ─── Brand color swatches ─── */
type Swatch = { label: string; color: string };
/** Swatches offered by every ColorInput, provided by BlockEditor per template
 * brand. Empty = no quick-picks (just the custom color input). */
const SwatchContext = createContext<Swatch[]>([]);

/**
 * The quick-pick palette for color fields: the selected brand's colors first,
 * then black/white. "both" shows each brand's key colors. Custom colors stay
 * available via the color input beneath the swatches.
 */
function brandSwatches(brand: Brand): Swatch[] {
  const neutrals: Swatch[] = [
    { label: "White", color: "#ffffff" },
    { label: "Black", color: "#1a1a1a" },
  ];
  const cols = (b: (typeof BRAND_PRESETS)["ni"]): Swatch[] => [
    { label: "Primary", color: b.primaryColor },
    { label: "Secondary", color: b.secondaryColor },
    { label: "Background", color: b.bgColor },
    { label: "Text", color: b.textColor },
  ];
  if (brand === "ni") return [...cols(BRAND_PRESETS.ni), ...neutrals];
  if (brand === "sassy") return [...cols(BRAND_PRESETS.sassy), ...neutrals];
  return [
    { label: "NI Primary", color: BRAND_PRESETS.ni.primaryColor },
    { label: "NI Secondary", color: BRAND_PRESETS.ni.secondaryColor },
    { label: "Sassy Primary", color: BRAND_PRESETS.sassy.primaryColor },
    { label: "Sassy Secondary", color: BRAND_PRESETS.sassy.secondaryColor },
    ...neutrals,
  ];
}

/* ─── Generic input helpers ─── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
    />
  );
}

function NumberInput({ value, onChange, min, max, suffix }: { value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        className="w-20 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
      />
      {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const swatches = useContext(SwatchContext);
  return (
    <div className="space-y-1.5">
      {swatches.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {swatches.map((s) => {
            const active = (value ?? "").toLowerCase() === s.color.toLowerCase();
            return (
              <button
                key={s.color}
                type="button"
                title={`${s.label} · ${s.color}`}
                onClick={() => onChange(s.color)}
                className={clsx(
                  "h-6 w-6 rounded-md border transition",
                  active ? "border-gray-900 ring-2 ring-gray-900/20" : "border-gray-200 hover:border-gray-400",
                )}
                style={{ backgroundColor: s.color }}
              />
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded border border-gray-200 cursor-pointer" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <span className="text-[10px] text-gray-400">Custom</span>
      </div>
    </div>
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** URL input + "Upload" button that hosts a resized image and fills the URL. */
function ImageField({ value, onChange, prefix }: { value: string; onChange: (v: string) => void; prefix?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        />
        <button
          type="button"
          onClick={() => setLibOpen(true)}
          title="Browse the image library"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <Images size={13} />
        </button>
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          title="Upload a new image"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")} className="text-[11px] text-gray-400 hover:text-rose-500">
            clear
          </button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setErr(null);
          setBusy(true);
          const res = await uploadEmailImage(file, prefix);
          setBusy(false);
          if ("error" in res) setErr(res.error);
          else onChange(res.url);
        }}
      />
      {err && <p className="text-[11px] text-rose-600">{err}</p>}
      <MediaLibraryModal
        open={libOpen}
        onClose={() => setLibOpen(false)}
        onSelect={(url) => {
          onChange(url);
          setLibOpen(false);
        }}
        prefix={prefix ?? "images"}
      />
    </div>
  );
}

function TextArea({ value, onChange, rows, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows ?? 4}
      placeholder={placeholder}
      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
    />
  );
}

/* ─── Block-specific editors ─── */
export default function BlockEditor({
  block,
  onUpdate,
  brand = "both",
  channel = "both",
}: {
  block: EmailBlock;
  onUpdate: (b: EmailBlock) => void;
  brand?: Brand;
  channel?: Channel;
}) {
  function set<K extends keyof typeof block>(key: K, value: (typeof block)[K]) {
    onUpdate({ ...block, [key]: value } as EmailBlock);
  }

  return (
    <SwatchContext.Provider value={brandSwatches(brand)}>
    <div className="space-y-3">
      <div className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
        <span className={clsx(
          "w-2 h-2 rounded-full",
          block.type === "header" && "bg-emerald-500",
          block.type === "text" && "bg-blue-500",
          block.type === "image" && "bg-purple-500",
          block.type === "button" && "bg-amber-500",
          block.type === "divider" && "bg-gray-400",
          block.type === "spacer" && "bg-gray-300",
          block.type === "columns" && "bg-pink-500",
          block.type === "product" && "bg-orange-500",
          block.type === "social" && "bg-cyan-500",
          block.type === "hero" && "bg-rose-500",
          block.type === "promotion" && "bg-violet-500",
          block.type === "section" && "bg-indigo-500",
        )} />
        {block.type} Block
      </div>

      {block.type === "header" && (
        <>
          <Field label="Company Name"><TextInput value={block.companyName} onChange={(v) => set("companyName" as any, v)} /></Field>
          <Field label="Logo URL"><TextInput value={block.logoUrl} onChange={(v) => set("logoUrl" as any, v)} placeholder="https://..." /></Field>
          <Field label="Background Color"><ColorInput value={block.bgColor} onChange={(v) => set("bgColor" as any, v)} /></Field>
          <Field label="Text Color"><ColorInput value={block.textColor} onChange={(v) => set("textColor" as any, v)} /></Field>
          <Field label="Font Size (no-logo text)"><NumberInput value={block.fontSize ?? 20} onChange={(v) => set("fontSize" as any, v)} min={12} max={48} suffix="px" /></Field>
          <Field label="Padding"><NumberInput value={block.padding} onChange={(v) => set("padding" as any, v)} min={0} max={80} suffix="px" /></Field>
        </>
      )}

      {block.type === "text" && (
        <>
          <Field label="Content">
            <MergeFieldTextarea
              value={block.html}
              onValueChange={(v) => set("html" as any, v)}
              channel={channel}
              rows={6}
              placeholder="HTML or plain text… type / for merge fields"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y font-mono"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Font Size"><NumberInput value={block.fontSize} onChange={(v) => set("fontSize" as any, v)} min={10} max={48} suffix="px" /></Field>
            <Field label="Font Family">
              <SelectInput value={block.fontFamily} onChange={(v) => set("fontFamily" as any, v)} options={[
                { label: "Sans-serif", value: "sans" },
                { label: "Serif", value: "serif" },
                { label: "Monospace", value: "mono" },
              ]} />
            </Field>
          </div>
          <Field label="Alignment">
            <SelectInput value={block.textAlign} onChange={(v) => set("textAlign" as any, v)} options={[
              { label: "Left", value: "left" },
              { label: "Center", value: "center" },
              { label: "Right", value: "right" },
            ]} />
          </Field>
          <Field label="Text Color"><ColorInput value={block.textColor} onChange={(v) => set("textColor" as any, v)} /></Field>
          <Field label="Background"><ColorInput value={block.bgColor} onChange={(v) => set("bgColor" as any, v)} /></Field>
          <Field label="Padding"><NumberInput value={block.padding} onChange={(v) => set("padding" as any, v)} min={0} max={80} suffix="px" /></Field>
        </>
      )}

      {block.type === "image" && (
        <>
          <Field label="Image"><ImageField value={block.src} onChange={(v) => set("src" as any, v)} prefix="images" /></Field>
          <Field label="Alt Text"><TextInput value={block.alt} onChange={(v) => set("alt" as any, v)} /></Field>
          <Field label="Width">
            <SelectInput
              value={typeof block.width === "number" ? "custom" : block.width}
              onChange={(v) => set("width" as any, v === "custom" ? 50 : v)}
              options={[
                { label: "Full Width", value: "full" },
                { label: "Half Width", value: "half" },
                { label: "Third Width", value: "third" },
                { label: "Custom %", value: "custom" },
              ]}
            />
          </Field>
          {typeof block.width === "number" && (
            <Field label="Custom Width">
              <NumberInput value={block.width} onChange={(v) => set("width" as any, Math.min(100, Math.max(5, v)))} min={5} max={100} suffix="%" />
            </Field>
          )}
          <Field label="Alignment">
            <SelectInput value={block.align} onChange={(v) => set("align" as any, v)} options={[
              { label: "Left", value: "left" },
              { label: "Center", value: "center" },
              { label: "Right", value: "right" },
            ]} />
          </Field>
          <Field label="Link URL"><TextInput value={block.linkUrl} onChange={(v) => set("linkUrl" as any, v)} placeholder="Optional click URL" /></Field>
          <Field label="Border Radius"><NumberInput value={block.borderRadius} onChange={(v) => set("borderRadius" as any, v)} min={0} max={32} suffix="px" /></Field>
          <Field label="Padding"><NumberInput value={block.padding} onChange={(v) => set("padding" as any, v)} min={0} max={80} suffix="px" /></Field>
        </>
      )}

      {block.type === "button" && (
        <>
          <Field label="Button Text"><TextInput value={block.text} onChange={(v) => set("text" as any, v)} /></Field>
          <Field label="URL"><TextInput value={block.url} onChange={(v) => set("url" as any, v)} placeholder="https://..." /></Field>
          <Field label="Button Color"><ColorInput value={block.bgColor} onChange={(v) => set("bgColor" as any, v)} /></Field>
          <Field label="Text Color"><ColorInput value={block.textColor} onChange={(v) => set("textColor" as any, v)} /></Field>
          <Field label="Alignment">
            <SelectInput value={block.align} onChange={(v) => set("align" as any, v)} options={[
              { label: "Left", value: "left" },
              { label: "Center", value: "center" },
              { label: "Right", value: "right" },
            ]} />
          </Field>
          <Field label="Border Radius"><NumberInput value={block.borderRadius} onChange={(v) => set("borderRadius" as any, v)} min={0} max={32} suffix="px" /></Field>
          <Field label="Font Size"><NumberInput value={block.fontSize} onChange={(v) => set("fontSize" as any, v)} min={12} max={24} suffix="px" /></Field>
          <Field label="Padding"><NumberInput value={block.padding} onChange={(v) => set("padding" as any, v)} min={0} max={80} suffix="px" /></Field>
        </>
      )}

      {block.type === "divider" && (
        <>
          <Field label="Color"><ColorInput value={block.color} onChange={(v) => set("color" as any, v)} /></Field>
          <Field label="Thickness"><NumberInput value={block.thickness} onChange={(v) => set("thickness" as any, v)} min={1} max={8} suffix="px" /></Field>
          <Field label="Style">
            <SelectInput value={block.style} onChange={(v) => set("style" as any, v)} options={[
              { label: "Solid", value: "solid" },
              { label: "Dashed", value: "dashed" },
              { label: "Dotted", value: "dotted" },
            ]} />
          </Field>
          <Field label="Padding"><NumberInput value={block.padding} onChange={(v) => set("padding" as any, v)} min={0} max={80} suffix="px" /></Field>
        </>
      )}

      {block.type === "spacer" && (
        <Field label="Height"><NumberInput value={block.height} onChange={(v) => set("height" as any, v)} min={4} max={120} suffix="px" /></Field>
      )}

      {block.type === "columns" && (
        <>
          <Field label="Columns">
            <SelectInput value={String(block.columns)} onChange={(v) => {
              const num = Number(v) as 2 | 3;
              const items = [...block.items];
              while (items.length < num) items.push({ heading: `Column ${items.length + 1}`, text: "Description", imageUrl: "" });
              onUpdate({ ...block, columns: num, items: items.slice(0, num) });
            }} options={[
              { label: "2 Columns", value: "2" },
              { label: "3 Columns", value: "3" },
            ]} />
          </Field>
          <Field label="Gap"><NumberInput value={block.gap} onChange={(v) => set("gap" as any, v)} min={0} max={40} suffix="px" /></Field>
          {block.items.map((col, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-2.5 space-y-2">
              <div className="text-[10px] font-bold text-gray-400 uppercase">Column {i + 1}</div>
              <Field label="Heading"><TextInput value={col.heading} onChange={(v) => {
                const items = [...block.items]; items[i] = { ...items[i], heading: v };
                onUpdate({ ...block, items });
              }} /></Field>
              <Field label="Text"><TextInput value={col.text} onChange={(v) => {
                const items = [...block.items]; items[i] = { ...items[i], text: v };
                onUpdate({ ...block, items });
              }} /></Field>
              <Field label="Image URL"><TextInput value={col.imageUrl} onChange={(v) => {
                const items = [...block.items]; items[i] = { ...items[i], imageUrl: v };
                onUpdate({ ...block, items });
              }} placeholder="Optional" /></Field>
            </div>
          ))}
          <Field label="Padding"><NumberInput value={block.padding} onChange={(v) => set("padding" as any, v)} min={0} max={80} suffix="px" /></Field>
        </>
      )}

      {block.type === "product" && (
        <>
          <Field label="Image URL"><TextInput value={block.imageUrl} onChange={(v) => set("imageUrl" as any, v)} placeholder="https://..." /></Field>
          <Field label="Product Name"><TextInput value={block.name} onChange={(v) => set("name" as any, v)} /></Field>
          <Field label="Name Size"><NumberInput value={block.fontSize ?? 16} onChange={(v) => set("fontSize" as any, v)} min={12} max={36} suffix="px" /></Field>
          <Field label="Description"><TextArea value={block.description} onChange={(v) => set("description" as any, v)} rows={2} /></Field>
          <Field label="Price"><TextInput value={block.price} onChange={(v) => set("price" as any, v)} /></Field>
          <Field label="Button Text"><TextInput value={block.buttonText} onChange={(v) => set("buttonText" as any, v)} /></Field>
          <Field label="Button URL"><TextInput value={block.buttonUrl} onChange={(v) => set("buttonUrl" as any, v)} /></Field>
          <Field label="Background"><ColorInput value={block.bgColor} onChange={(v) => set("bgColor" as any, v)} /></Field>
          <Field label="Padding"><NumberInput value={block.padding} onChange={(v) => set("padding" as any, v)} min={0} max={80} suffix="px" /></Field>
        </>
      )}

      {block.type === "social" && (
        <>
          <Field label="Instagram"><TextInput value={block.instagram} onChange={(v) => set("instagram" as any, v)} placeholder="https://instagram.com/..." /></Field>
          <Field label="Facebook"><TextInput value={block.facebook} onChange={(v) => set("facebook" as any, v)} placeholder="https://facebook.com/..." /></Field>
          <Field label="TikTok"><TextInput value={block.tiktok} onChange={(v) => set("tiktok" as any, v)} placeholder="https://tiktok.com/..." /></Field>
          <Field label="Website"><TextInput value={block.website} onChange={(v) => set("website" as any, v)} placeholder="https://..." /></Field>
          <Field label="Alignment">
            <SelectInput value={block.align} onChange={(v) => set("align" as any, v)} options={[
              { label: "Left", value: "left" },
              { label: "Center", value: "center" },
              { label: "Right", value: "right" },
            ]} />
          </Field>
          <Field label="Padding"><NumberInput value={block.padding} onChange={(v) => set("padding" as any, v)} min={0} max={80} suffix="px" /></Field>
        </>
      )}

      {block.type === "hero" && (
        <>
          <Field label="Background Image"><TextInput value={block.imageUrl} onChange={(v) => set("imageUrl" as any, v)} placeholder="https://..." /></Field>
          <Field label="Heading"><TextInput value={block.heading} onChange={(v) => set("heading" as any, v)} /></Field>
          <Field label="Heading Size"><NumberInput value={block.fontSize ?? 24} onChange={(v) => set("fontSize" as any, v)} min={14} max={56} suffix="px" /></Field>
          <Field label="Subheading"><TextInput value={block.subheading} onChange={(v) => set("subheading" as any, v)} /></Field>
          <Field label="Button Text"><TextInput value={block.buttonText} onChange={(v) => set("buttonText" as any, v)} /></Field>
          <Field label="Button URL"><TextInput value={block.buttonUrl} onChange={(v) => set("buttonUrl" as any, v)} /></Field>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={block.overlay} onChange={(e) => set("overlay" as any, e.target.checked)} className="rounded" />
            <span className="text-xs text-gray-600">Dark overlay</span>
          </div>
          <Field label="Text Color"><ColorInput value={block.textColor} onChange={(v) => set("textColor" as any, v)} /></Field>
        </>
      )}

      {block.type === "promotion" && (
        <>
          {/* Linked promotion info */}
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <Tag size={12} className="text-violet-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
                Linked Promotion
              </span>
            </div>
            {block.promoCode && (
              <div className="mt-1 text-xs text-violet-800 font-semibold">
                {block.headline}
                <span className="ml-1.5 font-mono text-[10px] bg-violet-200 text-violet-700 px-1.5 py-0.5 rounded">
                  {block.promoCode}
                </span>
              </div>
            )}
          </div>

          {/* Editable display fields */}
          <Field label="Headline"><TextInput value={block.headline} onChange={(v) => set("headline" as any, v)} /></Field>
          <Field label="Description"><TextArea value={block.description} onChange={(v) => set("description" as any, v)} rows={2} /></Field>
          <Field label="Promo Code"><TextInput value={block.promoCode} onChange={(v) => set("promoCode" as any, v)} placeholder="e.g. SPRING25" /></Field>
          <Field label="Discount Label"><TextInput value={block.discountLabel} onChange={(v) => set("discountLabel" as any, v)} placeholder="e.g. 20% OFF" /></Field>
          <Field label="Expires"><TextInput value={block.expiresLabel} onChange={(v) => set("expiresLabel" as any, v)} placeholder="e.g. Expires April 30, 2026" /></Field>
          <Field label="Button Text"><TextInput value={block.buttonText} onChange={(v) => set("buttonText" as any, v)} /></Field>
          <Field label="Button URL"><TextInput value={block.buttonUrl} onChange={(v) => set("buttonUrl" as any, v)} placeholder="https://..." /></Field>
          <Field label="Background"><ColorInput value={block.bgColor} onChange={(v) => set("bgColor" as any, v)} /></Field>
          <Field label="Accent Color"><ColorInput value={block.accentColor} onChange={(v) => set("accentColor" as any, v)} /></Field>
          <Field label="Text Color"><ColorInput value={block.textColor} onChange={(v) => set("textColor" as any, v)} /></Field>
          <Field label="Padding"><NumberInput value={block.padding} onChange={(v) => set("padding" as any, v)} min={0} max={80} suffix="px" /></Field>
        </>
      )}

      {block.type === "section" && (
        <>
          <Field label="Background Color">
            <div className="flex items-center gap-2">
              <ColorInput value={block.bgColor || "#ffffff"} onChange={(v) => set("bgColor" as any, v)} />
              {block.bgColor && (
                <button type="button" onClick={() => set("bgColor" as any, "")} className="text-[11px] text-gray-400 hover:text-rose-500">none</button>
              )}
            </div>
          </Field>
          <Field label="Background Image"><ImageField value={block.bgImage} onChange={(v) => set("bgImage" as any, v)} prefix="section-bg" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Padding"><NumberInput value={block.padding} onChange={(v) => set("padding" as any, v)} min={0} max={80} suffix="px" /></Field>
            <Field label="Column Gap"><NumberInput value={block.gap} onChange={(v) => set("gap" as any, v)} min={0} max={48} suffix="px" /></Field>
          </div>
          <Field label="Vertical Align">
            <SelectInput value={block.verticalAlign} onChange={(v) => {
              const va = v as VAlign;
              onUpdate({ ...block, verticalAlign: va, columns: block.columns.map((c) => ({ ...c, verticalAlign: va })) });
            }} options={[
              { label: "Top", value: "top" },
              { label: "Middle", value: "middle" },
              { label: "Bottom", value: "bottom" },
            ]} />
          </Field>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={block.stackOnMobile} onChange={(e) => set("stackOnMobile" as any, e.target.checked)} className="rounded" />
            <span className="text-xs text-gray-600">Stack columns on mobile</span>
          </label>

          <div className="pt-1 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Columns ({block.columns.length})</span>
              {block.columns.length < 3 && (
                <button
                  type="button"
                  onClick={() => onUpdate({ ...block, columns: [...block.columns, { id: newBlockId(), blocks: [], weight: 1, bgColor: "", verticalAlign: block.verticalAlign, padding: 12 } as SectionColumn] })}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
                >
                  + Add column
                </button>
              )}
            </div>
            <div className="space-y-2">
              {block.columns.map((c, i) => (
                <div key={c.id} className="rounded-lg border border-gray-200 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-gray-400">Column {i + 1}</span>
                    {block.columns.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onUpdate({ ...block, columns: block.columns.filter((_, j) => j !== i) })}
                        className="text-[11px] text-gray-400 hover:text-rose-500"
                      >
                        remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Width weight">
                      <NumberInput value={c.weight} onChange={(v) => {
                        const columns = [...block.columns]; columns[i] = { ...columns[i], weight: Math.max(1, v) };
                        onUpdate({ ...block, columns });
                      }} min={1} max={6} />
                    </Field>
                    <Field label="Padding">
                      <NumberInput value={c.padding} onChange={(v) => {
                        const columns = [...block.columns]; columns[i] = { ...columns[i], padding: v };
                        onUpdate({ ...block, columns });
                      }} min={0} max={40} suffix="px" />
                    </Field>
                  </div>
                  <Field label="Column Background">
                    <div className="flex items-center gap-2">
                      <ColorInput value={c.bgColor || "#ffffff"} onChange={(v) => {
                        const columns = [...block.columns]; columns[i] = { ...columns[i], bgColor: v };
                        onUpdate({ ...block, columns });
                      }} />
                      {c.bgColor && (
                        <button type="button" onClick={() => {
                          const columns = [...block.columns]; columns[i] = { ...columns[i], bgColor: "" };
                          onUpdate({ ...block, columns });
                        }} className="text-[11px] text-gray-400 hover:text-rose-500">none</button>
                      )}
                    </div>
                  </Field>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
    </SwatchContext.Provider>
  );
}
