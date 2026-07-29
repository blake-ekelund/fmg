"use client";

import { useMemo, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Upload, Type, LayoutGrid, Loader2, Check } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import {
  createDefaultBlock,
  TEMPLATE_PURPOSES,
  type Brand,
  type Channel,
  type EmailBlock,
  type TemplatePurpose,
} from "./types";

export type NewTemplateResult = {
  name: string;
  description: string;
  brand: Brand;
  channel: Channel;
  purpose: TemplatePurpose[];
  /** Starting blocks for the new template (always source='blocks'). */
  blocks: EmailBlock[];
  subject: string;
  previewText: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete: (result: NewTemplateResult) => void;
};

type StartMethod = "text" | "blank" | "upload";

const BRANDS: { value: Brand; label: string; sub: string }[] = [
  { value: "ni", label: "Natural Inspirations", sub: "Spa-inspired, clean beauty" },
  { value: "sassy", label: "Sassy", sub: "Bold, playful, fun" },
  { value: "both", label: "Both brands", sub: "Brand-neutral" },
];

const AUDIENCES: { value: Channel; label: string; sub: string }[] = [
  { value: "wholesale", label: "Wholesale", sub: "Retail buyers & accounts" },
  { value: "d2c", label: "Direct to consumer", sub: "Shoppers on the storefront" },
  { value: "both", label: "Both audiences", sub: "Anyone" },
];

const STARTS: { value: StartMethod; label: string; sub: string; icon: typeof Type }[] = [
  { value: "text", label: "Plain-text email", sub: "Start with a simple text block", icon: Type },
  { value: "blank", label: "Blank template", sub: "Start from an empty builder", icon: LayoutGrid },
  { value: "upload", label: "Upload HTML", sub: "Import a file — we'll turn it into editable blocks", icon: Upload },
];

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const STEP_LABELS = ["Brand", "Audience", "Purpose", "Title", "Description", "Start"];

export default function NewTemplateWizard({ open, onClose, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [brand, setBrand] = useState<Brand>("ni");
  const [channel, setChannel] = useState<Channel>("both");
  const [purpose, setPurpose] = useState<TemplatePurpose[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState<StartMethod | null>(null);

  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep(0);
    setBrand("ni");
    setChannel("both");
    setPurpose([]);
    setName("");
    setDescription("");
    setStart(null);
    setImporting(false);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  const canContinue = useMemo(() => {
    switch (step) {
      case 0: return !!brand;
      case 1: return !!channel;
      case 2: return purpose.length > 0;
      case 3: return name.trim().length > 0;
      case 4: return true; // description optional
      case 5: return !!start && !importing;
      default: return false;
    }
  }, [step, brand, channel, purpose, name, start, importing]);

  function togglePurpose(v: TemplatePurpose) {
    setPurpose((cur) => (cur.includes(v) ? cur.filter((p) => p !== v) : [...cur, v]));
  }

  function finish(blocks: EmailBlock[], subject = "", previewText = "") {
    if (purpose.length === 0 || !start) return;
    onComplete({
      name: name.trim(),
      description: description.trim(),
      brand,
      channel,
      purpose,
      blocks,
      subject,
      previewText,
    });
    reset();
  }

  async function handleFile(file: File | undefined | null) {
    setError(null);
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== "text/html") {
      setError("Please choose an .html file.");
      return;
    }
    const html = await file.text().catch(() => "");
    if (!html.trim()) {
      setError("That file is empty or unreadable.");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/email/templates/import-html", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ html }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Import failed. Try again.");
        setImporting(false);
        return;
      }
      finish((json.blocks as EmailBlock[]) ?? [], json.subject ?? "", json.preview_text ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setImporting(false);
    }
  }

  function onContinue() {
    if (step < 5) {
      setStep((s) => s + 1);
      return;
    }
    // Final step — act on the chosen start method.
    if (start === "text") finish([createDefaultBlock("text")]);
    else if (start === "blank") finish([]);
    else if (start === "upload") fileRef.current?.click();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header + progress */}
        <div className="flex-shrink-0 border-b border-gray-100 px-5 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">New template</h2>
            <button onClick={close} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex flex-1 flex-col gap-1">
                <div className={clsx("h-1 rounded-full", i <= step ? "bg-gray-900" : "bg-gray-200")} />
                <span className={clsx("text-[9px] font-medium uppercase tracking-wide", i === step ? "text-gray-700" : "text-gray-300")}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 0 && (
            <Step title="What brand is this for?">
              {BRANDS.map((b) => (
                <Choice key={b.value} label={b.label} sub={b.sub} selected={brand === b.value} onClick={() => setBrand(b.value)} />
              ))}
            </Step>
          )}

          {step === 1 && (
            <Step title="Who is this for?">
              {AUDIENCES.map((a) => (
                <Choice key={a.value} label={a.label} sub={a.sub} selected={channel === a.value} onClick={() => setChannel(a.value)} />
              ))}
            </Step>
          )}

          {step === 2 && (
            <Step title="What's the purpose?" subtitle="Pick one or more.">
              {TEMPLATE_PURPOSES.map((p) => {
                const on = purpose.includes(p.value);
                return (
                  <button
                    key={p.value}
                    onClick={() => togglePurpose(p.value)}
                    className={clsx(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition",
                      on ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:bg-gray-50",
                    )}
                  >
                    <span className={clsx("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300")}>
                      {on && <Check size={11} />}
                    </span>
                    <span className="text-sm font-medium text-gray-800">{p.label}</span>
                  </button>
                );
              })}
            </Step>
          )}

          {step === 3 && (
            <Step title="Give it a title">
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canContinue && onContinue()}
                placeholder="e.g. Summer win-back — 15% off"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </Step>
          )}

          {step === 4 && (
            <Step title="Add a short description" subtitle="Optional — a note for the team, shown in the library.">
              <textarea
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="What is this template for, and when should it be used?"
                className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </Step>
          )}

          {step === 5 && (
            <Step title="How do you want to start?">
              {STARTS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.value}
                    onClick={() => { setStart(s.value); setError(null); }}
                    disabled={importing}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition disabled:opacity-50",
                      start === s.value ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:bg-gray-50",
                    )}
                  >
                    <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", start === s.value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500")}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800">{s.label}</span>
                      <span className="block text-[11px] text-gray-500">{s.sub}</span>
                    </span>
                    {start === s.value && <Check size={16} className="ml-auto shrink-0 text-gray-900" />}
                  </button>
                );
              })}
              {importing && (
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
                  <Loader2 size={14} className="animate-spin" />
                  Converting your HTML into editable blocks…
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".html,.htm,text/html"
                className="hidden"
                onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
              />
            </Step>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-100 px-5 py-2.5">
          <button
            onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}
            disabled={importing}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronLeft size={14} />
            {step === 0 ? "Cancel" : "Back"}
          </button>
          <button
            onClick={onContinue}
            disabled={!canContinue}
            className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800 disabled:opacity-40"
          >
            {step < 5 ? "Continue" : start === "upload" ? "Choose file" : "Create"}
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-gray-800">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      <div className="mt-3 space-y-1.5">{children}</div>
    </div>
  );
}

function Choice({ label, sub, selected, onClick }: { label: string; sub: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex w-full items-center justify-between gap-3 rounded-xl border p-2.5 text-left transition",
        selected ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:bg-gray-50",
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-800">{label}</span>
        <span className="block text-[11px] text-gray-500">{sub}</span>
      </span>
      {selected && <Check size={16} className="shrink-0 text-gray-900" />}
    </button>
  );
}
