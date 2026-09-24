"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, LayoutTemplate, Loader2, Sparkles, Upload, X } from "lucide-react";
import clsx from "clsx";
import type { BlogBrand, BlogPostRow } from "@/lib/blogPosts";
import { BLOG_FORMATS, brandTemplate } from "@/lib/blog/blocks";
import { importBlogHtml } from "@/lib/blog/importHtml";
import { BLOG_AUDIENCES, BLOG_PURPOSES, starterTags, type BlogAudience, type BlogPurpose } from "@/lib/blog/meta";
import { createPost, generatePost } from "./api";

/**
 * New blog post — the same walk-through as a new email template: brand,
 * audience, purpose, title, short description, then how to start (AI, the
 * brand template, or an HTML upload), and for AI a description of the post.
 * Whatever the start, the result is a draft in the brand's builder format;
 * the wizard creates it and hands it back for the editor to open.
 */

type Start = "ai" | "template" | "upload";

const BRANDS: { value: BlogBrand; label: string; sub: string }[] = [
  { value: "Sassy", label: "Sassy", sub: "sassyandco.com — bold, playful" },
  { value: "NI", label: "Natural Inspirations", sub: "naturalinspirations.com Journal — calm, spa-inspired" },
];

const STARTS: { value: Start; label: string; sub: string; icon: typeof Sparkles }[] = [
  { value: "ai", label: "Generate with AI", sub: "Describe it — Claude writes the whole post in the brand format", icon: Sparkles },
  { value: "template", label: "Brand template", sub: "Start from the format's outline and fill it in", icon: LayoutTemplate },
  { value: "upload", label: "Upload HTML", sub: "Import a page or doc — words and pictures kept, styling replaced", icon: Upload },
];

type Props = {
  open: boolean;
  defaultBrand: BlogBrand;
  onClose: () => void;
  onCreated: (post: BlogPostRow) => void;
};

export default function NewBlogWizard({ open, defaultBrand, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [brand, setBrand] = useState<BlogBrand>(defaultBrand);
  const [audience, setAudience] = useState<BlogAudience>("d2c");
  const [purpose, setPurpose] = useState<BlogPurpose | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState<Start | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<null | "generating" | "importing" | "creating">(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The AI description is its own step, only when AI is the start.
  const labels = ["Brand", "Audience", "Purpose", "Title", "Description", "Start", ...(start === "ai" ? ["Describe"] : [])];
  const last = labels.length - 1;

  function reset() {
    setStep(0);
    setBrand(defaultBrand);
    setAudience("d2c");
    setPurpose(null);
    setTitle("");
    setDescription("");
    setStart(null);
    setPrompt("");
    setBusy(null);
    setError(null);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  const canContinue = useMemo(() => {
    if (busy) return false;
    switch (step) {
      case 0: return !!brand;
      case 1: return !!audience;
      case 2: return !!purpose;
      case 3: return title.trim().length > 0;
      case 4: return true;
      case 5: return !!start;
      case 6: return prompt.trim().length > 0;
      default: return false;
    }
  }, [step, brand, audience, purpose, title, start, prompt, busy]);

  async function create(input: Parameters<typeof createPost>[0]) {
    setBusy("creating");
    const post = await createPost(input);
    reset();
    onCreated(post);
  }

  const shared = () => ({
    brand,
    title: title.trim(),
    audience,
    purpose: purpose!,
    description: description.trim(),
    // The short description doubles as the search description to start with.
    seo_meta: description.trim() || undefined,
    tags: starterTags(brand, purpose!),
  });

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(null);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== "text/html") {
      setError("Please choose an .html file.");
      return;
    }
    await run(async () => {
      setBusy("importing");
      const html = await file.text();
      const { blocks } = importBlogHtml(html, brand);
      if (blocks.length <= 1) throw new Error("Couldn't find any text or images in that file.");
      await create({ ...shared(), blocks });
    });
  }

  function onContinue() {
    if (step < last) {
      setStep((s) => s + 1);
      return;
    }
    if (start === "template") {
      void run(() => create({ ...shared(), blocks: brandTemplate(brand) }));
    } else if (start === "upload") {
      fileRef.current?.click();
    } else if (start === "ai") {
      void run(async () => {
        setBusy("generating");
        const gen = await generatePost({
          brand,
          audience,
          purpose: purpose!,
          title: title.trim(),
          description: description.trim(),
          prompt: prompt.trim(),
        });
        await create({
          ...shared(),
          blocks: gen.blocks,
          seo_meta: gen.seo_meta || description.trim() || undefined,
          tags: gen.tags.length ? gen.tags : shared().tags,
          hero_image_url: gen.hero_image_url || undefined,
        });
      });
    }
  }

  if (!open) return null;

  const cta =
    step < last
      ? "Continue"
      : start === "upload"
        ? busy ? "Importing…" : "Choose file"
        : start === "ai"
          ? busy ? "Writing…" : "Generate"
          : busy ? "Creating…" : "Create";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex-shrink-0 border-b border-gray-100 px-5 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">New blog post</h2>
            <button onClick={close} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {labels.map((label, i) => (
              <div key={label} className="flex flex-1 flex-col gap-1">
                <div className={clsx("h-1 rounded-full", i <= step ? "bg-gray-900" : "bg-gray-200")} />
                <span className={clsx("text-[9px] font-medium uppercase tracking-wide", i === step ? "text-gray-700" : "text-gray-300")}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 0 && (
            <Step title="Which brand is this for?" subtitle="The brand sets the post's format — every post on a brand looks the same.">
              {BRANDS.map((b) => (
                <Choice key={b.value} label={b.label} sub={b.sub} selected={brand === b.value} onClick={() => setBrand(b.value)} />
              ))}
            </Step>
          )}

          {step === 1 && (
            <Step title="Who is this for?">
              {BLOG_AUDIENCES.map((a) => (
                <Choice key={a.value} label={a.label} sub={a.sub} selected={audience === a.value} onClick={() => setAudience(a.value)} />
              ))}
            </Step>
          )}

          {step === 2 && (
            <Step
              title="What's the purpose?"
              subtitle={brand === "NI" ? "This also files the post under a Journal category." : undefined}
            >
              {BLOG_PURPOSES.map((p) => (
                <Choice
                  key={p.value}
                  label={p.label}
                  sub={brand === "NI" ? `${p.hint} · Journal: ${p.niCategory}` : p.hint}
                  selected={purpose === p.value}
                  onClick={() => setPurpose(p.value)}
                />
              ))}
            </Step>
          )}

          {step === 3 && (
            <Step title="Give it a title" subtitle="The headline on the site. You can change it later.">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canContinue && onContinue()}
                placeholder={brand === "NI" ? "e.g. A slower Sunday: the lavender bath ritual" : "e.g. 5 scents that are basically a personality"}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </Step>
          )}

          {step === 4 && (
            <Step title="Add a short description" subtitle="Optional — one or two sentences. It starts out as the search description and blog index card text.">
              <textarea
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="What is this post about, and why would someone read it?"
                className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
              <p className={clsx("text-[11px]", description.length > 160 ? "text-amber-600" : "text-gray-400")}>
                {description.length} characters · 120–155 reads best in Google
              </p>
            </Step>
          )}

          {step === 5 && (
            <Step title="How do you want to start?">
              {STARTS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.value}
                    onClick={() => {
                      setStart(s.value);
                      setError(null);
                    }}
                    disabled={!!busy}
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
              <p className="pt-1 text-[11px] text-gray-400">{BLOG_FORMATS[brand].rules}</p>
            </Step>
          )}

          {step === 6 && start === "ai" && (
            <Step title="Describe the post" subtitle="What should it cover? Name products, ingredients, angles, links, and anything to avoid.">
              <textarea
                autoFocus
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                disabled={!!busy}
                placeholder={
                  brand === "NI"
                    ? "e.g. A wind-down evening ritual built around Lavender Ylang — bath soak, body oil, lotion. Explain why lavender and ylang ylang calm. Three steps, a tip box, link to /collections/lavender-ylang."
                    : "e.g. Fall scent guide — which Sassy scent matches your fall vibe (cozy, spooky, pumpkin-everything). Punchy, list-heavy, a product card for each, link to /shop."
                }
                className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-60"
              />
              <p className="text-[11px] text-gray-400">
                Claude writes it in the {brand === "NI" ? "Natural Inspirations" : "Sassy"} voice using photos from the Image Library where they fit. It opens in the builder as a draft — nothing goes live.
              </p>
            </Step>
          )}

          {busy && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
              <Loader2 size={14} className="animate-spin" />
              {busy === "generating"
                ? "Writing your post — this takes up to a minute…"
                : busy === "importing"
                  ? "Turning your HTML into blocks…"
                  : "Creating the draft…"}
            </div>
          )}
          {error && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
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
