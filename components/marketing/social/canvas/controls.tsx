"use client";

import { useEffect, useRef, useState } from "react";
import { Ban } from "lucide-react";
import clsx from "clsx";

/** Small, consistent form controls for the canvas inspector. */

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-gray-100 px-4 py-4 last:border-b-0">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-[13px] text-gray-600">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = "",
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
  format?: (v: number) => string;
}) {
  return (
    <>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-violet-600"
      />
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-gray-500">
        {format ? format(value) : `${Math.round(value * 100) / 100}${suffix}`}
      </span>
    </>
  );
}

export function NumberInput({ value, onChange, label, min, max }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number }) {
  // While focused, show what's being typed; otherwise always the live value.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = Number(draft);
    if (draft !== null && Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
    setDraft(null);
  };
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1 focus-within:border-violet-400">
      <span className="text-[11px] font-medium text-gray-400">{label}</span>
      <input
        value={draft ?? String(Math.round(value))}
        onFocus={() => setDraft(String(Math.round(value)))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        inputMode="numeric"
        className="w-full min-w-0 bg-transparent text-sm tabular-nums text-gray-900 focus:outline-none"
      />
    </label>
  );
}

export function Segment<T extends string>({ options, value, onChange }: { options: { value: T; label: React.ReactNode; title?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx(
            "inline-flex items-center justify-center rounded-md px-2.5 py-1 text-[13px] transition",
            value === o.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={clsx(
        "rounded-lg border px-2.5 py-1 text-[13px] font-medium transition",
        on ? "border-violet-600 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-600 hover:border-gray-300",
      )}
    >
      {label}
    </button>
  );
}

/**
 * Colour swatch that opens a palette: the brand's colours first, then a
 * custom picker and hex box. `allowNone` adds a "no colour" choice.
 */
export function ColorField({
  value,
  onChange,
  palette,
  allowNone = false,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  palette: string[];
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1 text-[13px] text-gray-700 hover:border-gray-300"
      >
        <span
          className="h-5 w-5 rounded-md border border-black/10"
          style={value ? { background: value } : { background: "repeating-conic-gradient(#e5e7eb 0 25%, #fff 0 50%) 0 0/8px 8px" }}
        />
        <span className="font-mono text-xs">{value ? value.toUpperCase().slice(0, 9) : "None"}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <div className="grid grid-cols-8 gap-1.5">
            {allowNone && (
              <button
                type="button"
                title="No colour"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 text-gray-400"
              >
                <Ban size={12} />
              </button>
            )}
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className={clsx("h-6 w-6 rounded-md border", value?.toUpperCase() === c.toUpperCase() ? "border-violet-600 ring-2 ring-violet-200" : "border-black/10")}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="color"
              value={value && isHex(value) ? value : "#000000"}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              className="h-8 w-10 cursor-pointer rounded border border-gray-200 bg-white p-0.5"
              aria-label="Custom colour"
            />
            <input
              value={hex ?? value ?? ""}
              onFocus={() => setHex(value ?? "")}
              onChange={(e) => setHex(e.target.value)}
              onBlur={() => {
                if (hex && isHex(hex)) onChange(hex.toUpperCase());
                setHex(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && hex && isHex(hex) && onChange(hex.toUpperCase())}
              placeholder="#1F3D35"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 font-mono text-xs focus:border-violet-400 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function IconButton({
  title,
  onClick,
  children,
  active,
  danger,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-30",
        active ? "bg-violet-100 text-violet-700" : danger ? "text-red-600 hover:bg-red-50" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
      )}
    >
      {children}
    </button>
  );
}
