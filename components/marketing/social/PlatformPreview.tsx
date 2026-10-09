"use client";

import { useEffect, useState } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Earth,
  Facebook,
  Heart,
  Instagram,
  MessageCircle,
  MoreHorizontal,
  Play,
  Send,
  Share2,
  ThumbsUp,
  X,
} from "lucide-react";
import clsx from "clsx";
import type { DesignSlide } from "@/lib/social/design";
import type { SocialBrand, SocialMedia, SocialPlatform, SocialPostType } from "@/lib/social/types";
import SlidePreview from "./SlidePreview";

/**
 * "How will it look?" — the post drawn inside an Instagram feed post and a
 * Facebook Page post, side by side. Designed slides use the same SlideView
 * the server renders; photos are shown the way we send them (Instagram pads
 * odd shapes with white, never crops). It's a close mock-up, not a
 * screenshot — Meta's apps vary a little by phone and version.
 */

type Visual = { key: string; slide?: DesignSlide; media?: SocialMedia };

type Props = {
  open: boolean;
  onClose: () => void;
  brand: SocialBrand;
  platforms: SocialPlatform[];
  postType: SocialPostType;
  slides: DesignSlide[] | null;
  media: SocialMedia[];
  caption: string;
  igHandle: string | null;
  fbName: string | null;
};

const BRAND_NAME: Record<SocialBrand, string> = { NI: "Natural Inspirations", Sassy: "Sassy" };
const BRAND_HANDLE: Record<SocialBrand, string> = { NI: "_naturalinspirations", Sassy: "sassy" };
const AVATAR: Record<SocialBrand, string> = { NI: "bg-[#1F3D35] text-[#F4F1EA] font-serif", Sassy: "bg-[#B3295C] text-white" };

export default function PlatformPreview(p: Props) {
  const [only, setOnly] = useState<SocialPlatform | null>(null);

  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p]);

  if (!p.open) return null;

  const visuals: Visual[] = p.slides
    ? p.slides.map((s) => ({ key: s.id, slide: s }))
    : p.media.map((m, i) => ({ key: `${m.url}-${i}`, media: m }));
  const shown = (p.platforms.length ? p.platforms : (["instagram", "facebook"] as SocialPlatform[])).filter((x) => !only || x === only);
  const handle = p.igHandle ?? BRAND_HANDLE[p.brand];
  const page = p.fbName ?? BRAND_NAME[p.brand];

  return (
    <div className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-gray-900/60 p-4 backdrop-blur-sm md:p-8" onClick={p.onClose}>
      <div className="w-full max-w-5xl rounded-3xl bg-gray-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">How it will look</h2>
            <p className="text-sm text-gray-500">A close preview of the post in each feed.</p>
          </div>
          {p.platforms.length > 1 && (
            <div className="ml-auto inline-flex rounded-full bg-white p-1 text-sm shadow-sm">
              {([null, "instagram", "facebook"] as const).map((v) => (
                <button
                  key={v ?? "both"}
                  onClick={() => setOnly(v)}
                  className={clsx(
                    "rounded-full px-4 py-1.5 font-medium transition",
                    only === v ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900",
                  )}
                >
                  {v === null ? "Both" : v === "instagram" ? "Instagram" : "Facebook"}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={p.onClose}
            className={clsx("rounded-full p-2 text-gray-500 hover:bg-white hover:text-gray-900", p.platforms.length <= 1 && "ml-auto")}
            aria-label="Close preview"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-wrap items-start justify-center gap-10 px-4 py-8">
          {visuals.length === 0 ? (
            <p className="py-16 text-sm text-gray-500">Add an image or a slide to see the preview.</p>
          ) : (
            shown.map((pl) => (
              <div key={pl} className="flex flex-col items-center gap-3">
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
                  {pl === "instagram" ? <Instagram size={16} /> : <Facebook size={16} />}
                  {pl === "instagram" ? "Instagram feed" : "Facebook Page"}
                </div>
                {pl === "instagram" ? (
                  <InstagramPost brand={p.brand} handle={handle} visuals={visuals} caption={p.caption} reel={p.postType === "reel"} />
                ) : (
                  <FacebookPost brand={p.brand} page={page} visuals={visuals} caption={p.caption} />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Shared bits ─────────────────────────────────────────────────── */

function Avatar({ brand, size }: { brand: SocialBrand; size: number }) {
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", AVATAR[brand])}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {brand === "NI" ? "NI" : "S"}
    </span>
  );
}

/** One slide or photo filling a box of `width` × width*ratio. */
function VisualBox({ v, brand, index, total, width, ratio, cover = false }: {
  v: Visual; brand: SocialBrand; index: number; total: number; width: number; ratio: number; cover?: boolean;
}) {
  const height = Math.round(width * ratio);
  if (v.slide) {
    // Slides are exactly 4:5. Fit them whole, or (cover) fill the box and crop
    // the overflow the way Facebook's photo grid does.
    const w = cover ? Math.max(width, height * 0.8) : Math.min(width, height * 0.8);
    return (
      <div className="flex items-center justify-center overflow-hidden bg-white" style={{ width, height }}>
        <SlidePreview slide={v.slide} brand={brand} index={index} total={total} width={w} />
      </div>
    );
  }
  const m = v.media!;
  return (
    <div className="relative flex items-center justify-center overflow-hidden bg-white" style={{ width, height }}>
      {m.kind === "video" ? (
        <>
          <video src={m.url} className="h-full w-full object-cover" muted playsInline />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/40 p-3 text-white">
              <Play size={22} fill="currentColor" />
            </span>
          </span>
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.url} alt="" className={clsx("h-full w-full", cover ? "object-cover" : "object-contain")} />
      )}
    </div>
  );
}

/** Caption text with #hashtags and @mentions tinted like the apps do. */
function RichCaption({ text, tag }: { text: string; tag: string }) {
  const parts = text.split(/((?:^|\s)[#@][\p{L}\p{N}_.]+)/u);
  return (
    <>
      {parts.map((part, i) =>
        /^\s?[#@]/.test(part) ? (
          <span key={i} className={tag}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** First `limit` characters (or `lines` lines), with a "more" toggle. */
function Truncated({ text, limit, lines, more, tag }: { text: string; limit: number; lines: number; more: string; tag: string }) {
  const [open, setOpen] = useState(false);
  const byLines = text.split("\n").slice(0, lines).join("\n");
  const cut = Math.min(byLines.length, limit);
  const long = text.length > cut;
  if (open || !long) return <RichCaption text={text} tag={tag} />;
  return (
    <>
      <RichCaption text={text.slice(0, cut).trimEnd()} tag={tag} />
      …{" "}
      <button type="button" onClick={() => setOpen(true)} className="text-gray-500 hover:underline">
        {more}
      </button>
    </>
  );
}

/* ─── Instagram ───────────────────────────────────────────────────── */

const IG_W = 360;

function InstagramPost({ brand, handle, visuals, caption, reel }: { brand: SocialBrand; handle: string; visuals: Visual[]; caption: string; reel: boolean }) {
  const [i, setI] = useState(0);
  const n = visuals.length;
  const ratio = reel ? 16 / 9 : 5 / 4;

  return (
    <div className="overflow-hidden rounded-[28px] border-[6px] border-gray-900 bg-white shadow-xl" style={{ width: IG_W + 12 }}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
          <span className="block rounded-full bg-white p-[2px]">
            <Avatar brand={brand} size={28} />
          </span>
        </span>
        <span className="flex-1 text-[13px] font-semibold text-gray-900">{handle}</span>
        <MoreHorizontal size={18} className="text-gray-800" />
      </div>

      <div className="relative">
        <VisualBox v={visuals[i]} brand={brand} index={i + 1} total={n} width={IG_W} ratio={ratio} cover={reel} />
        {n > 1 && (
          <>
            <span className="absolute right-3 top-3 rounded-full bg-gray-900/70 px-2 py-0.5 text-[11px] font-medium text-white">
              {i + 1}/{n}
            </span>
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 shadow" aria-label="Previous">
                <ChevronLeft size={16} />
              </button>
            )}
            {i < n - 1 && (
              <button onClick={() => setI(i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 shadow" aria-label="Next">
                <ChevronRight size={16} />
              </button>
            )}
          </>
        )}
      </div>

      <div className="px-3 pb-4 pt-2.5">
        <div className="relative flex items-center gap-4 text-gray-900">
          <Heart size={22} />
          <MessageCircle size={22} />
          <Send size={22} />
          {n > 1 && (
            <span className="absolute left-1/2 flex -translate-x-1/2 gap-1">
              {visuals.map((v, j) => (
                <span key={v.key} className={clsx("h-1.5 w-1.5 rounded-full", j === i ? "bg-sky-500" : "bg-gray-300")} />
              ))}
            </span>
          )}
          <Bookmark size={22} className="ml-auto" />
        </div>
        {caption.trim() && (
          <p className="mt-2.5 whitespace-pre-wrap break-words text-[13px] leading-[18px] text-gray-900">
            <span className="mr-1 font-semibold">{handle}</span>
            <Truncated text={caption.trim()} limit={125} lines={2} more="more" tag="text-[#00376b]" />
          </p>
        )}
        <p className="mt-2 text-[10px] uppercase tracking-wide text-gray-400">Just now</p>
      </div>
    </div>
  );
}

/* ─── Facebook ────────────────────────────────────────────────────── */

const FB_W = 440;

function FacebookPost({ brand, page, visuals, caption }: { brand: SocialBrand; page: string; visuals: Visual[]; caption: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-xl" style={{ width: FB_W }}>
      <div className="flex items-center gap-2.5 px-4 pt-3">
        <Avatar brand={brand} size={40} />
        <div className="flex-1">
          <div className="text-[15px] font-semibold text-gray-900">{page}</div>
          <div className="flex items-center gap-1 text-[13px] text-gray-500">
            Just now · <Earth size={12} />
          </div>
        </div>
        <MoreHorizontal size={20} className="text-gray-500" />
      </div>
      {caption.trim() && (
        <p className="whitespace-pre-wrap break-words px-4 pb-3 pt-2.5 text-[15px] leading-5 text-gray-900">
          <Truncated text={caption.trim()} limit={480} lines={5} more="See more" tag="font-semibold text-[#385898]" />
        </p>
      )}
      <FacebookGrid brand={brand} visuals={visuals} />
      <div className="mx-4 mt-2 flex justify-around border-t border-gray-200 py-1.5 text-[15px] font-semibold text-gray-500">
        <span className="inline-flex items-center gap-2 rounded-md px-3 py-1.5"><ThumbsUp size={18} /> Like</span>
        <span className="inline-flex items-center gap-2 rounded-md px-3 py-1.5"><MessageCircle size={18} /> Comment</span>
        <span className="inline-flex items-center gap-2 rounded-md px-3 py-1.5"><Share2 size={18} /> Share</span>
      </div>
    </div>
  );
}

/** Facebook lays out multi-photo posts as a grid, with "+N" on the last tile. */
function FacebookGrid({ brand, visuals }: { brand: SocialBrand; visuals: Visual[] }) {
  const n = visuals.length;
  const gap = 2;
  const box = (v: Visual, i: number, w: number, ratio: number, more = 0) => (
    <div key={v.key} className="relative">
      <VisualBox v={v} brand={brand} index={i + 1} total={n} width={w} ratio={ratio} cover />
      {more > 0 && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-3xl font-semibold text-white">+{more}</span>
      )}
    </div>
  );

  if (n === 1) return box(visuals[0], 0, FB_W, visuals[0].slide ? 5 / 4 : 1);
  if (n === 2) {
    const w = (FB_W - gap) / 2;
    return <div className="flex" style={{ gap }}>{visuals.map((v, i) => box(v, i, w, 5 / 4))}</div>;
  }
  if (n === 3) {
    const big = Math.round(FB_W * 0.6);
    const small = FB_W - big - gap;
    const h = big * 1.25;
    return (
      <div className="flex" style={{ gap }}>
        {box(visuals[0], 0, big, 1.25)}
        <div className="flex flex-col" style={{ gap }}>
          {box(visuals[1], 1, small, (h - gap) / 2 / small)}
          {box(visuals[2], 2, small, (h - gap) / 2 / small)}
        </div>
      </div>
    );
  }
  if (n === 4) {
    const w = (FB_W - gap) / 2;
    return (
      <div className="flex flex-wrap" style={{ gap }}>
        {visuals.map((v, i) => box(v, i, w, 1))}
      </div>
    );
  }
  const topW = (FB_W - gap) / 2;
  const botW = (FB_W - gap * 2) / 3;
  return (
    <div className="flex flex-col" style={{ gap }}>
      <div className="flex" style={{ gap }}>
        {visuals.slice(0, 2).map((v, i) => box(v, i, topW, 1))}
      </div>
      <div className="flex" style={{ gap }}>
        {visuals.slice(2, 5).map((v, i) => box(v, i + 2, botW, 1, i === 2 ? n - 5 : 0))}
      </div>
    </div>
  );
}
