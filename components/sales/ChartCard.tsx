"use client";

/**
 * Card wrapper for the sales charts.
 *
 * Exists because the old charts each did their own sizing and got it wrong:
 * a fixed `h-80` on the card, `p-5` of padding and a heading inside it, then a
 * ResponsiveContainer asking for `height="100%"` — which resolves against the
 * card's content box and so overflowed the bottom edge by the height of the
 * heading. Here the card is a flex column: the header takes what it needs and
 * the body gets the rest via `flex-1 min-h-0`, so a fixed card height always
 * includes the x-axis band and never produces a nested scrollbar.
 */
export default function ChartCard({
  title,
  caption,
  bodyClassName = "",
  children,
}: {
  title: string;
  caption?: string;
  /** Height utility for the plot area, e.g. "h-72". Includes the axis band. */
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="flex h-full min-h-0 flex-col rounded-xl border border-gray-200 bg-white p-5">
      <figcaption className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold text-gray-900">{title}</h3>
        {caption && (
          <span className="shrink-0 text-[10px] text-gray-400">{caption}</span>
        )}
      </figcaption>

      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </figure>
  );
}
