"use client";

import { type BlogBrand, resolveHeroUrl } from "@/lib/blogPosts";

/**
 * The post as the storefront will render it. Sassy's classes are ported 1:1
 * from sassy/src/app/blog/[slug]/page.tsx with theme tokens inlined as hex;
 * NI's approximate the journal page (serif display, spruce green) closely
 * enough to judge length, headings, and images.
 */

export const SASSY_BODY =
  "mt-10 text-[#4b5563] " +
  "[&_a]:font-semibold [&_a]:text-[#B3295C] [&_a]:underline-offset-2 hover:[&_a]:underline " +
  "[&_blockquote]:mt-6 [&_blockquote]:border-l-2 [&_blockquote]:border-[#B3295C] [&_blockquote]:pl-5 [&_blockquote]:italic " +
  "[&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-black [&_h2]:uppercase [&_h2]:tracking-tight [&_h2]:text-[#1a1a1a] " +
  "[&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-tight [&_h3]:text-[#1a1a1a] " +
  "[&_img]:my-6 [&_img]:block [&_img]:w-full [&_img]:rounded-2xl " +
  "[&_li]:mt-1.5 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_p]:mt-4 [&_p]:text-base [&_p]:leading-relaxed " +
  "[&_strong]:font-semibold [&_strong]:text-[#1a1a1a] " +
  "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6";

export const NI_BODY =
  "mt-10 text-[#3b3b3b] " +
  "[&_a]:text-[#3D6B5A] [&_a]:underline [&_a]:underline-offset-2 " +
  "[&_blockquote]:mt-6 [&_blockquote]:border-l-2 [&_blockquote]:border-[#A8895A] [&_blockquote]:pl-5 [&_blockquote]:font-serif [&_blockquote]:text-lg [&_blockquote]:italic [&_blockquote]:text-[#1F3D35] " +
  "[&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-medium [&_h2]:text-[#1F3D35] " +
  "[&_h3]:mt-8 [&_h3]:font-serif [&_h3]:text-xl [&_h3]:font-medium [&_h3]:text-[#1F3D35] " +
  "[&_img]:my-6 [&_img]:block [&_img]:w-full [&_img]:rounded-2xl " +
  "[&_li]:mt-1.5 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_p]:mt-4 [&_p]:text-base [&_p]:leading-relaxed " +
  "[&_strong]:font-medium [&_strong]:text-[#1F3D35] " +
  "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6";

/** The journal sets its first paragraph as a larger lead (journal-article.tsx). */
const NI_LEAD = "[&_p:first-child]:mt-0 [&_p:first-child]:text-lg";

export default function StorefrontPreview({
  brand,
  title,
  body,
  tags,
  heroImageUrl,
  date,
}: {
  brand: BlogBrand;
  title: string;
  body: string;
  tags: string[];
  heroImageUrl: string;
  date: string | null;
}) {
  const hero = resolveHeroUrl(brand, heroImageUrl);
  const dateLabel = date
    ? new Date(date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Publish date not set";

  if (brand === "NI") {
    return (
      <article className="mx-auto max-w-3xl px-6 py-12">
        {tags[0] ? (
          <span className="block text-xs font-medium uppercase tracking-[0.3em] text-[#A8895A]">
            {tags[0]}
          </span>
        ) : null}
        <h1 className="mt-3 text-balance font-serif text-4xl font-medium leading-[1.1] text-[#1F3D35] md:text-5xl">
          {title || "Untitled post"}
        </h1>
        <div className="mt-4 text-[11px] uppercase tracking-[0.25em] text-[#6b6b6b]">{dateLabel}</div>
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt={title} className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover" />
        ) : null}
        <div className={`${NI_BODY} ${NI_LEAD}`} dangerouslySetInnerHTML={{ __html: body || "<p>Nothing written yet.</p>" }} />
      </article>
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <time className="block text-[11px] uppercase tracking-[0.25em] text-[#1a1a1a]/45">{dateLabel}</time>
      <h1 className="mt-2 text-balance text-4xl font-black uppercase leading-[0.95] tracking-tight text-[#1a1a1a] md:text-5xl">
        {title || "Untitled post"}
      </h1>
      {tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[#F1E6E4]/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1a1a1a]/65"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {hero ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hero} alt={title} className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover" />
      ) : null}
      <div className={SASSY_BODY} dangerouslySetInnerHTML={{ __html: body || "<p>Nothing written yet.</p>" }} />
    </article>
  );
}
