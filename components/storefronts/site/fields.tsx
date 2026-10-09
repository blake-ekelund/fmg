"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, X } from "lucide-react";
import MediaLibraryModal from "@/components/templates/MediaLibraryModal";
import { uploadBlogImageResult } from "@/components/marketing/blog/api";
import { resolveHeroUrl } from "@/lib/blogPosts";

/* Small form controls for the Website editor's inspector. */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-1 block text-[11px] text-gray-400">{hint}</span> : null}
    </label>
  );
}

const INPUT =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

export function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <input
      className={INPUT}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  rows = 3,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <textarea
      className={`${INPUT} resize-y`}
      value={value}
      rows={rows}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select className={INPUT} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2.5 py-1.5 transition ${
            value === o.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-11 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
      />
      <input
        className={`${INPUT} font-mono`}
        value={value}
        maxLength={7}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Image chooser: thumbnail + Image Library / Unsplash picker. */
export function ImageInput({
  value,
  onChange,
  optional,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Shows "Clear" and an empty-state hint instead of requiring a photo. */
  optional?: string;
}) {
  const [open, setOpen] = useState(false);
  const preview = resolveHeroUrl("Sassy", value);
  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 hover:border-indigo-400"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus size={18} className="text-gray-400 group-hover:text-indigo-500" />
          )}
        </button>
        <div className="flex flex-col items-start gap-1 text-xs">
          <button type="button" onClick={() => setOpen(true)} className="font-medium text-indigo-600 hover:text-indigo-800">
            {value ? "Change photo" : "Choose photo"}
          </button>
          {value && optional ? (
            <button type="button" onClick={() => onChange("")} className="text-gray-500 hover:text-red-600">
              Clear
            </button>
          ) : null}
          {!value && optional ? <span className="text-gray-400">{optional}</span> : null}
        </div>
      </div>
      <MediaLibraryModal
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(url) => {
          onChange(url);
          setOpen(false);
        }}
        uploader={uploadBlogImageResult}
        inbox="website-uploads"
      />
    </div>
  );
}

/** Editable list of strings (value strip). */
export function StringList({
  items,
  onChange,
  max,
  placeholder,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  max: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <TextInput
            value={it}
            placeholder={placeholder}
            maxLength={60}
            onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))}
          />
          <IconButton label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
      {items.length < max ? (
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          <Plus size={13} /> Add line
        </button>
      ) : null}
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  disabled,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`rounded-md p-1.5 text-gray-400 transition disabled:opacity-30 ${
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-gray-100 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

/** A collapsible card for one item in a repeating list (slides, tiles). */
export function ItemCard({
  title,
  subtitle,
  thumb,
  open,
  onToggle,
  onUp,
  onDown,
  onRemove,
  children,
}: {
  title: string;
  subtitle?: string;
  thumb?: string;
  open: boolean;
  onToggle: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  const src = thumb ? resolveHeroUrl("Sassy", thumb) : null;
  return (
    <div className={`rounded-xl border bg-white ${open ? "border-indigo-200 shadow-sm" : "border-gray-200"}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle()}
        className="flex cursor-pointer items-center gap-2.5 px-3 py-2"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-8 w-11 shrink-0 rounded object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900">{title || "Untitled"}</div>
          {subtitle ? <div className="truncate text-[11px] text-gray-500">{subtitle}</div> : null}
        </div>
        <IconButton label="Move up" onClick={() => onUp?.()} disabled={!onUp}>
          <ArrowUp size={13} />
        </IconButton>
        <IconButton label="Move down" onClick={() => onDown?.()} disabled={!onDown}>
          <ArrowDown size={13} />
        </IconButton>
        {onRemove ? (
          <IconButton label="Remove" onClick={onRemove} danger>
            <Trash2 size={13} />
          </IconButton>
        ) : null}
      </div>
      {open ? <div className="space-y-3 border-t border-gray-100 p-3">{children}</div> : null}
    </div>
  );
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}
