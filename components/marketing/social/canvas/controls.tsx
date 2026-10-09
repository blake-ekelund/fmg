"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban } from "lucide-react";
import clsx from "clsx";
import type { Palette } from "@/lib/social/canvas";

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
 * Color swatch that opens a floating picker: the brand's colors, more
 * colors, then "pick any color" (system picker) and a hex box. The popover is
 * rendered at the page level and kept inside the window, so it never runs
 * off the side of the panel. `allowNone` adds a "no color" choice.
 */
export function ColorField({
  value,
  onChange,
  palette,
  allowNone = false,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  palette: Palette;
  allowNone?: boolean;
}) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [hex, setHex] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  const W = 228;
  const H = 240;
  function toggle() {
    if (open) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.right - W), window.innerWidth - W - 8);
    const below = r.bottom + 8;
    const top = below + H > window.innerHeight - 8 ? Math.max(8, r.top - H - 8) : below;
    setPos({ left, top });
  }

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setPos(null);
    };
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    // Scrolling the panel would leave the popover behind — close it.
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);
  const pick = (c: string | null) => {
    onChange(c);
    setPos(null);
  };
  const swatch = (c: string) => (
    <button
      key={c}
      type="button"
      title={c}
      onClick={() => pick(c)}
      className={clsx(
        "h-6 w-6 rounded-md border transition hover:scale-110",
        value?.toUpperCase() === c.toUpperCase() ? "border-violet-600 ring-2 ring-violet-200" : "border-black/10",
      )}
      style={{ background: c }}
    />
  );

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1 text-[13px] text-gray-700 hover:border-gray-300"
      >
        <span
          className="h-5 w-5 rounded-md border border-black/10"
          style={value ? { background: value } : { background: "repeating-conic-gradient(#e5e7eb 0 25%, #fff 0 50%) 0 0/8px 8px" }}
        />
        <span className="font-mono text-xs">{value ? value.toUpperCase().slice(0, 9) : "None"}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            className="fixed z-[80] rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
            style={{ left: pos.left, top: pos.top, width: W }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Brand</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {allowNone && (
                <button
                  type="button"
                  title="No color"
                  onClick={() => pick(null)}
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center rounded-md border text-gray-400",
                    value === null ? "border-violet-600 ring-2 ring-violet-200" : "border-gray-200",
                  )}
                >
                  <Ban size={13} />
                </button>
              )}
              {palette.brand.map(swatch)}
            </div>

            <div className="mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">More</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{palette.more.map(swatch)}</div>

            <div className="mt-2.5 flex items-center gap-1.5 border-t border-gray-100 pt-2.5">
              <label
                title="Pick any color"
                className="relative h-7 w-7 shrink-0 cursor-pointer rounded-md border border-black/10"
                style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
              >
                <input
                  type="color"
                  value={value && isHex(value) ? value : "#000000"}
                  onChange={(e) => onChange(e.target.value.toUpperCase())}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Pick any color"
                />
              </label>
              <input
                value={hex ?? value ?? ""}
                onFocus={() => setHex(value ?? "")}
                onChange={(e) => setHex(e.target.value)}
                onBlur={() => {
                  if (hex && isHex(hex)) onChange(hex.toUpperCase());
                  setHex(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && hex && isHex(hex) && pick(hex.toUpperCase())}
                placeholder="#1F3D35"
                aria-label="Hex color"
                className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 font-mono text-xs focus:border-violet-400 focus:outline-none"
              />
            </div>
          </div>,
          document.body,
        )}
    </>
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
