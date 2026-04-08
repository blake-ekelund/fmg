"use client";

import { Tag } from "lucide-react";
import type { EmailBlock, BlockType } from "./types";
import clsx from "clsx";

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
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded border border-gray-200 cursor-pointer" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
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
}: {
  block: EmailBlock;
  onUpdate: (b: EmailBlock) => void;
}) {
  function set<K extends keyof typeof block>(key: K, value: (typeof block)[K]) {
    onUpdate({ ...block, [key]: value } as EmailBlock);
  }

  return (
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
        )} />
        {block.type} Block
      </div>

      {block.type === "header" && (
        <>
          <Field label="Company Name"><TextInput value={block.companyName} onChange={(v) => set("companyName" as any, v)} /></Field>
          <Field label="Logo URL"><TextInput value={block.logoUrl} onChange={(v) => set("logoUrl" as any, v)} placeholder="https://..." /></Field>
          <Field label="Background Color"><ColorInput value={block.bgColor} onChange={(v) => set("bgColor" as any, v)} /></Field>
          <Field label="Text Color"><ColorInput value={block.textColor} onChange={(v) => set("textColor" as any, v)} /></Field>
          <Field label="Padding"><NumberInput value={block.padding} onChange={(v) => set("padding" as any, v)} min={0} max={80} suffix="px" /></Field>
        </>
      )}

      {block.type === "text" && (
        <>
          <Field label="Content">
            <TextArea value={block.html} onChange={(v) => set("html" as any, v)} rows={6} placeholder="HTML or plain text..." />
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
          <Field label="Image URL"><TextInput value={block.src} onChange={(v) => set("src" as any, v)} placeholder="https://..." /></Field>
          <Field label="Alt Text"><TextInput value={block.alt} onChange={(v) => set("alt" as any, v)} /></Field>
          <Field label="Width">
            <SelectInput value={block.width} onChange={(v) => set("width" as any, v)} options={[
              { label: "Full Width", value: "full" },
              { label: "Half Width", value: "half" },
              { label: "Third Width", value: "third" },
            ]} />
          </Field>
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
    </div>
  );
}
