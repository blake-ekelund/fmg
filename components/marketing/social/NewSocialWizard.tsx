"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Images, LayoutTemplate, Loader2, Search, Sparkles, Square, X } from "lucide-react";
import clsx from "clsx";
import { SOCIAL_PURPOSES, starterDesign, type ProductOption, type SocialPurpose } from "@/lib/social/design";
import { PLATFORM_LABEL, SOCIAL_PLATFORMS, type SocialBrand, type SocialPlatform, type SocialPost } from "@/lib/social/types";
import { createSocialPost, generateSocialPost, listSocialProducts } from "./api";

/**
 * New social post — the same walk-through as a new blog post or email:
 * brand, where it goes, the format, then how to start (AI, a blank brand
 * layout, or your own photos/video). For AI: the purpose, optional products
 * to feature, and a description. The AI only uses our images — the products'
 * photos, the Image Library and the brand's Unsplash photography.
 */

type Format = "carousel" | "single" | "photos";
type Start = "ai" | "blank";

const BRANDS: { value: SocialBrand; label: string; sub: string }[] = [
  { value: "NI", label: "Natural Inspirations", sub: "@_naturalinspirations — calm, spa-inspired" },
  { value: "Sassy", label: "Sassy", sub: "Bold, playful (connect Sassy's accounts to post)" },
];

const FORMATS: { value: Format; label: string; sub: string; icon: typeof Images }[] = [
  { value: "carousel", label: "Designed carousel", sub: "2–10 branded slides people swipe through", icon: Images },
  { value: "single", label: "Designed single image", sub: "One branded graphic", icon: Square },
  { value: "photos", label: "Your own photos or video", sub: "Post photos / a reel as they are — no design", icon: LayoutTemplate },
];

const STARTS: { value: Start; label: string; sub: string; icon: typeof Sparkles }[] = [
  { value: "ai", label: "Generate with AI", sub: "Describe it — Claude writes the slides and caption using our photos", icon: Sparkles },
  { value: "blank", label: "Start blank", sub: "Open the slide builder with the brand layouts", icon: LayoutTemplate },
];

type Props = {
  defaultBrand: SocialBrand;
  onClose: () => void;
  onCreated: (post: SocialPost) => void;
};

export default function NewSocialWizard({ defaultBrand, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [brand, setBrand] = useState<SocialBrand>(defaultBrand);
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(["instagram", "facebook"]);
  const [format, setFormat] = useState<Format | null>(null);
  const [start, setStart] = useState<Start | null>(null);
  const [purpose, setPurpose] = useState<SocialPurpose | null>(null);
  const [parts, setParts] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [slideCount, setSlideCount] = useState(5);
  const [busy, setBusy] = useState<null | "generating" | "creating">(null);
  const [error, setError] = useState<string | null>(null);

  const designed = format === "carousel" || format === "single";
  const ai = designed && start === "ai";
  const labels = ["Brand", "Where", "Format", ...(designed ? ["Start"] : []), ...(ai ? ["Purpose", "Products", "Describe"] : [])];
  const last = labels.length - 1;
  const label = labels[step];

  const canContinue = useMemo(() => {
    if (busy) return false;
    switch (label) {
      case "Brand": return !!brand;
      case "Where": return platforms.length > 0;
      case "Format": return !!format;
      case "Start": return !!start;
      case "Purpose": return !!purpose;
      case "Products": return true;
      case "Describe": return prompt.trim().length > 0;
      default: return false;
    }
  }, [label, brand, platforms, format, start, purpose, prompt, busy]);

  function close() {
    if (!busy) onClose();
  }

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(null);
    }
  }

  function onContinue() {
    if (step < last) {
      setStep((s) => s + 1);
      return;
    }
    void run(async () => {
      if (format === "photos") {
        setBusy("creating");
        onCreated(await createSocialPost({ brand, platforms, post_type: "image", design: null }));
        return;
      }
      if (start === "blank") {
        setBusy("creating");
        onCreated(await createSocialPost({ brand, platforms, design: starterDesign(brand, format === "single") }));
        return;
      }
      setBusy("generating");
      const gen = await generateSocialPost({
        brand,
        purpose: purpose!,
        platforms,
        format: format === "single" ? "single" : "carousel",
        slideCount,
        prompt: prompt.trim(),
        parts,
      });
      setBusy("creating");
      onCreated(await createSocialPost({ brand, platforms, title: gen.title, design: gen.design }));
    });
  }

  const cta =
    step < last ? "Continue" : ai ? (busy ? "Writing…" : "Generate") : busy ? "Creating…" : "Create";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex-shrink-0 border-b border-gray-100 px-5 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">New social post</h2>
            <button onClick={close} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {labels.map((l, i) => (
              <div key={l} className="flex flex-1 flex-col gap-1">
                <div className={clsx("h-1 rounded-full", i <= step ? "bg-gray-900" : "bg-gray-200")} />
                <span className={clsx("text-[9px] font-medium uppercase tracking-wide", i === step ? "text-gray-700" : "text-gray-300")}>
                  {l}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {label === "Brand" && (
            <Step title="Which brand is this for?" subtitle="The brand sets the slide design and the writing voice.">
              {BRANDS.map((b) => (
                <Choice key={b.value} label={b.label} sub={b.sub} selected={brand === b.value} onClick={() => setBrand(b.value)} />
              ))}
            </Step>
          )}

          {label === "Where" && (
            <Step title="Where should it post?" subtitle="You can change this later in the editor.">
              {SOCIAL_PLATFORMS.map((p) => {
                const on = platforms.includes(p);
                return (
                  <Choice
                    key={p}
                    label={PLATFORM_LABEL[p]}
                    sub={p === "instagram" ? "Feed post (4:5)" : "Page post"}
                    selected={on}
                    onClick={() => setPlatforms((cur) => (on ? cur.filter((x) => x !== p) : [...cur, p]))}
                  />
                );
              })}
            </Step>
          )}

          {label === "Format" && (
            <Step title="What kind of post?">
              {FORMATS.map((f) => (
                <IconChoice key={f.value} icon={f.icon} label={f.label} sub={f.sub} selected={format === f.value} onClick={() => setFormat(f.value)} />
              ))}
            </Step>
          )}

          {label === "Start" && (
            <Step title="How do you want to start?">
              {STARTS.map((s) => (
                <IconChoice key={s.value} icon={s.icon} label={s.label} sub={s.sub} selected={start === s.value} onClick={() => setStart(s.value)} />
              ))}
            </Step>
          )}

          {label === "Purpose" && (
            <Step title="What's the purpose?">
              {SOCIAL_PURPOSES.map((p) => (
                <Choice key={p.value} label={p.label} sub={p.hint} selected={purpose === p.value} onClick={() => setPurpose(p.value)} />
              ))}
            </Step>
          )}

          {label === "Products" && <ProductStep brand={brand} parts={parts} setParts={setParts} />}

          {label === "Describe" && (
            <Step title="Describe the post" subtitle="The angle, the message, anything to include or avoid. Name an offer only if there is one.">
              <textarea
                autoFocus
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                disabled={!!busy}
                placeholder={
                  brand === "NI"
                    ? "e.g. A 3-step Sunday evening wind-down with Lavender Ylang — warm bath, body butter, pillow spray. Calm and sensory, end with 'find your ritual'."
                    : "e.g. Which Sassy scent matches your fall mood — cozy, spooky, or pumpkin-everything. Punchy and fun."
                }
                className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-60"
              />
              {format === "carousel" && (
                <label className="flex items-center gap-3 pt-1 text-xs text-gray-600">
                  Slides
                  <input
                    type="range"
                    min={3}
                    max={10}
                    value={slideCount}
                    onChange={(e) => setSlideCount(Number(e.target.value))}
                    disabled={!!busy}
                    className="flex-1"
                  />
                  <span className="w-5 text-right font-medium text-gray-800">{slideCount}</span>
                </label>
              )}
              <p className="text-[11px] text-gray-400">
                Claude writes it in the {brand === "NI" ? "Natural Inspirations" : "Sassy"} voice and only uses our photos — product shots,
                the Image Library and the brand&apos;s photography. It opens in the builder as a draft; nothing posts until you say so.
              </p>
            </Step>
          )}

          {busy && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
              <Loader2 size={14} className="animate-spin" />
              {busy === "generating" ? "Writing your post — this takes up to a minute…" : "Creating the draft…"}
            </div>
          )}
          {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
        </div>

        <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-100 px-5 py-2.5">
          <button
            onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}
            disabled={!!busy}
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
            {cta}
            {!busy && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductStep({
  brand,
  parts,
  setParts,
}: {
  brand: SocialBrand;
  parts: string[];
  setParts: (fn: (cur: string[]) => string[]) => void;
}) {
  const [products, setProducts] = useState<ProductOption[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listSocialProducts(brand)
      .then(setProducts)
      .catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load products."));
  }, [brand]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = products ?? [];
    return (term ? list.filter((p) => p.name.toLowerCase().includes(term) || p.part.toLowerCase().includes(term)) : list).slice(0, 60);
  }, [products, q]);

  return (
    <Step title="Feature any products?" subtitle="Optional — up to 4. Their photos, prices and descriptions go to the AI.">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products…"
          className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}
      {!products && !err ? (
        <div className="flex items-center gap-2 py-6 text-xs text-gray-400">
          <Loader2 size={14} className="animate-spin" /> Loading products…
        </div>
      ) : (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {shown.map((p) => {
            const on = parts.includes(p.part);
            return (
              <button
                key={p.part}
                onClick={() => setParts((cur) => (on ? cur.filter((x) => x !== p.part) : cur.length >= 4 ? cur : [...cur, p.part]))}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-lg border p-1.5 text-left transition",
                  on ? "border-gray-900 bg-gray-50" : "border-gray-100 hover:bg-gray-50",
                )}
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-gray-100">
                  {p.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.images[0].url} alt="" className="h-full w-full object-contain" loading="lazy" />
                  )}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-gray-800">{p.name}</span>
                  <span className="block text-[11px] text-gray-400">
                    {[p.size, p.price != null ? `$${p.price}` : null, p.part].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {on && <Check size={16} className="shrink-0 text-gray-900" />}
              </button>
            );
          })}
        </div>
      )}
      {parts.length > 0 && <p className="text-[11px] text-gray-500">{parts.length} selected</p>}
    </Step>
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

function IconChoice({
  icon: Icon,
  label,
  sub,
  selected,
  onClick,
}: {
  icon: typeof Sparkles;
  label: string;
  sub: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition",
        selected ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:bg-gray-50",
      )}
    >
      <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", selected ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500")}>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-800">{label}</span>
        <span className="block text-[11px] text-gray-500">{sub}</span>
      </span>
      {selected && <Check size={16} className="ml-auto shrink-0 text-gray-900" />}
    </button>
  );
}
