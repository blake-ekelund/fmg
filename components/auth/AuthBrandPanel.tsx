"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/ui/Logo";

/* The left panel shared by the sign-in and forgot-password pages: a slow
   cross-fading slideshow of catalog lifestyle photography under a navy scrim,
   with the FMG lockup, headline and house brands on top. Hidden below lg —
   the auth form carries the brand on its own at phone width. */

// Interleaved so the slideshow alternates the two houses (NI, Sassy, NI, …).
const PHOTOS = [
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/150-00-06/lifestyle/lifestyle-1785718243401-160.jpg",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/125-00-11/lifestyle/lifestyle-1770490991078.png",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/121-00-06/lifestyle/lifestyle-1770084427669.jpg",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/123-00-04/lifestyle/lifestyle-1770084633596.png",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/140-00-05/lifestyle/lifestyle-1785718300968-233.jpg",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/125-00-14/lifestyle/lifestyle-1770491093663.png",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/130-00-01/lifestyle/lifestyle-1770141200354.jpg",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/410-00-01/lifestyle/lifestyle-1770493491862.png",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/271-00-08/lifestyle/lifestyle-1770600129008.jpg",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/125-00-15/lifestyle/lifestyle-1770491146686.jpg",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/150-00-01/lifestyle/lifestyle-1785718228747-143.jpg",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/124-00-06/lifestyle/lifestyle-1770085463274.png",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/121-00-04/lifestyle/lifestyle-1770084345687.jpg",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/410-00-07/lifestyle/lifestyle-1770491318197.jpg",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/160-00-01/lifestyle/lifestyle-1770604473367.jpg",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/410-00-05/lifestyle/lifestyle-1770493286183.jpg",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/121-00-02/lifestyle/lifestyle-1770141161932.jpg",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/125-00-10/lifestyle/lifestyle-1770490959699.jpg",
  "https://vxisjubwezhxfxocoawk.supabase.co/storage/v1/object/public/media-kit/inventory_products/150-00-09/lifestyle/lifestyle-1771342798063.jpg",
];

const INTERVAL_MS = 5500;

export function AuthBrandPanel() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    // Respect users who'd rather not see motion — hold on the first photo.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const t = setInterval(() => {
      setIdx((i) => (i + 1) % PHOTOS.length);
    }, INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-brand-950 p-12 xl:p-16">
      {/* Slideshow */}
      <div className="pointer-events-none absolute inset-0">
        {PHOTOS.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden="true"
            loading={i === 0 ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms] ease-in-out animate-[kenburns_22s_ease-in-out_infinite_alternate]"
            style={{ opacity: i === idx ? 1 : 0 }}
          />
        ))}
      </div>

      {/* Navy scrim — keeps the brand text legible over warm photography */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-950 via-brand-950/70 to-brand-950/35" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-950/70 via-transparent to-brand-900/40" />

      {/* Brand lockup */}
      <div className="relative z-10 flex items-center gap-3">
        <LogoMark size={44} className="rounded-[13px] ring-1 ring-white/15 shadow-raised" />
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/85">
          Fragrance Marketing Group
        </span>
      </div>

      {/* Headline */}
      <div className="relative z-10 max-w-md">
        <div className="mb-6 h-px w-14 bg-gradient-to-r from-accent-400 to-transparent" />
        <h2 className="text-4xl xl:text-[2.75rem] font-semibold leading-[1.1] tracking-tight text-white [text-shadow:0_2px_24px_rgba(10,27,39,0.55)]">
          Where scent
          <br />
          becomes a brand.
        </h2>
        <p className="mt-5 max-w-sm text-base leading-relaxed text-white/75 [text-shadow:0_1px_16px_rgba(10,27,39,0.5)]">
          The house that crafts fragrance and body care, and markets it end to
          end — from the bench to the shelf.
        </p>
      </div>

      {/* House brands */}
      <div className="relative z-10 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.16em] text-white/55">
        <span>Natural Inspirations</span>
        <span className="h-1 w-1 rounded-full bg-accent-400/80" />
        <span>Sassy</span>
        <span className="h-1 w-1 rounded-full bg-accent-400/80" />
        <span className="text-white/40">&amp; the brands to come</span>
      </div>

      <style>{`
        @keyframes kenburns {
          0%   { transform: scale(1.02); }
          100% { transform: scale(1.1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="animate-[kenburns"] { animation: none !important; }
        }
      `}</style>
    </aside>
  );
}
