"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Film, GripVertical, Images, Newspaper, Plus } from "lucide-react";
import type { SocialBrand, SocialPost } from "@/lib/social/types";
import { listBlogPostsForSocial, type BlogOption } from "./api";
import { PlatformLogo } from "./ConnectedAccounts";
import SlidePreview from "./SlidePreview";

/**
 * The posts on a calendar — month or week. Scheduled posts sit on the day
 * they go out, published ones on the day they went out, drafts with a date
 * on their planned day. Drag a post that hasn't gone out to another day to
 * move it (it keeps its time of day); drafts without a date wait in the
 * side list and can be dragged on too. A day's "+" starts a post for that
 * day. The brand's blog articles show faintly, so posts can be lined up
 * with them — clicking one starts a social post from it.
 */

type View = "month" | "week";


const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay());

/** The date a post sits on, or null (a draft with no date yet). */
export function calendarDate(p: SocialPost): Date | null {
  const out = p.status === "published" || p.status === "partial";
  const iso = out ? (p.published_at ?? p.scheduled_at) : p.scheduled_at;
  return iso ? new Date(iso) : null;
}

/** Only posts that haven't gone out can move. */
export const canMove = (p: SocialPost) => p.status === "draft" || p.status === "scheduled" || p.status === "failed";

/** Same time of day on the new day (10:00 for an undated draft); never in
 *  the past — today with a passed time becomes the next quarter hour. */
export function movedTime(p: SocialPost, day: Date): Date {
  const was = p.scheduled_at ? new Date(p.scheduled_at) : null;
  const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), was ? was.getHours() : 10, was ? was.getMinutes() : 0);
  const soon = Date.now() + 5 * 60_000;
  if (t.getTime() < soon) {
    const q = new Date(soon);
    q.setMinutes(Math.ceil(q.getMinutes() / 15) * 15, 0, 0);
    return q;
  }
  return t;
}

const STATUS_DOT: Record<SocialPost["status"], string> = {
  draft: "bg-amber-400",
  scheduled: "bg-emerald-500",
  publishing: "bg-emerald-500",
  published: "bg-green-700",
  partial: "bg-red-500",
  failed: "bg-red-500",
};
const STATUS_WORD: Record<SocialPost["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Posting now",
  published: "Posted",
  partial: "Partly posted",
  failed: "Failed",
};

function timeLabel(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();
}

/** "Oct 18 – 24, 2026", or "Oct 26 – Nov 1, 2026" across months. */
function weekTitle(a: Date, b: Date) {
  const short = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const end = a.getMonth() === b.getMonth() ? String(b.getDate()) : short(b);
  return `${short(a)} – ${end}, ${b.getFullYear()}`;
}

function postTitle(p: SocialPost) {
  return p.title?.trim() || p.caption.trim().split("\n")[0] || "Untitled post";
}

function blogDate(b: BlogOption): Date | null {
  const iso = b.status === "published" ? (b.published_at ?? b.publish_at) : b.publish_at;
  return iso ? new Date(iso) : null;
}

export default function SocialCalendar({
  posts,
  blogBrands,
  onMove,
  onNew,
  onNewFromBlog,
}: {
  posts: SocialPost[];
  /** Whose blog articles to show (the brand switch). */
  blogBrands: SocialBrand[];
  onMove: (post: SocialPost, at: Date) => void;
  /** Start a post planned for this moment. */
  onNew: (at: Date) => void;
  onNewFromBlog: (blogId: string, brand: SocialBrand) => void;
}) {
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem("social-calendar-view") === "week" ? "week" : "month";
    } catch {
      return "month";
    }
  });
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [blogs, setBlogs] = useState<(BlogOption & { at: Date })[]>([]);

  const setViewSaved = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("social-calendar-view", v);
    } catch {
      /* per-viewer convenience only */
    }
  };

  const brandKey = blogBrands.join(",");
  useEffect(() => {
    let alive = true;
    Promise.all(brandKey.split(",").filter(Boolean).map((b) => listBlogPostsForSocial(b as SocialBrand).catch(() => [])))
      .then((lists) => {
        if (!alive) return;
        setBlogs(
          lists.flat().flatMap((b) => {
            const at = blogDate(b);
            return at ? [{ ...b, at }] : [];
          }),
        );
      });
    return () => {
      alive = false;
    };
  }, [brandKey]);

  // The days on screen: whole weeks covering the month, or one week.
  const days = useMemo(() => {
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => addDays(startOfWeek(first), i));
  }, [view, anchor]);

  const byDay = useMemo(() => {
    const m = new Map<string, { post: SocialPost; at: Date }[]>();
    for (const p of posts) {
      const at = calendarDate(p);
      if (!at) continue;
      const k = dayKey(at);
      m.set(k, [...(m.get(k) ?? []), { post: p, at }]);
    }
    for (const list of m.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime());
    return m;
  }, [posts]);
  const blogsByDay = useMemo(() => {
    const m = new Map<string, (BlogOption & { at: Date })[]>();
    for (const b of blogs) m.set(dayKey(b.at), [...(m.get(dayKey(b.at)) ?? []), b]);
    return m;
  }, [blogs]);
  const undated = posts.filter((p) => !calendarDate(p) && canMove(p));

  const today = startOfDay(new Date());
  const step = (dir: -1 | 1) =>
    setAnchor((a) => (view === "week" ? addDays(a, dir * 7) : new Date(a.getFullYear(), a.getMonth() + dir, 1)));
  const title =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : weekTitle(days[0], days[6]);

  const dragged = dragId ? posts.find((p) => p.id === dragId) : null;
  const drop = (day: Date) => {
    setOverDay(null);
    setDragId(null);
    if (!dragged || day < today) return;
    const at = movedTime(dragged, day);
    if (dragged.scheduled_at && Math.abs(new Date(dragged.scheduled_at).getTime() - at.getTime()) < 60_000) return;
    onMove(dragged, at);
  };

  const max = view === "month" ? 3 : 50;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Header: where you are, and how to move */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3">
          <h2 className="mr-auto text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={() => setAnchor(startOfDay(new Date()))}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Today
          </button>
          <div className="flex">
            <button onClick={() => step(-1)} aria-label="Earlier" className="rounded-l-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => step(1)} aria-label="Later" className="-ml-px rounded-r-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewSaved(v)}
                className={clsx(
                  "rounded-md px-3 py-1 text-xs font-medium capitalize transition",
                  view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {WEEKDAYS.map((d, i) => (
                <div key={d} className="px-2 py-2">
                  {d}
                  {view === "week" ? (
                    <span
                      className={clsx(
                        "ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1",
                        days[i].getTime() === startOfDay(new Date()).getTime() ? "bg-gray-900 text-white" : "text-gray-900",
                      )}
                    >
                      {days[i].getDate()}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const k = dayKey(d);
                const items = byDay.get(k) ?? [];
                const dayBlogs = blogsByDay.get(k) ?? [];
                const past = d < today;
                const isToday = d.getTime() === today.getTime();
                const outside = view === "month" && d.getMonth() !== anchor.getMonth();
                const target = !!dragged && !past;
                return (
                  <div
                    key={k}
                    onDragOver={(e) => {
                      if (!target) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (overDay !== k) setOverDay(k);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverDay((o) => (o === k ? null : o));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      drop(d);
                    }}
                    className={clsx(
                      "group relative flex flex-col gap-1 border-b border-r border-gray-100 p-1.5 transition-colors [&:nth-child(7n)]:border-r-0",
                      view === "month" ? "min-h-[118px]" : "min-h-[420px]",
                      past ? "bg-gray-50/70" : "bg-white",
                      outside && "opacity-50",
                      overDay === k && "bg-indigo-50 ring-2 ring-inset ring-indigo-300",
                      dragged && past && "cursor-not-allowed",
                    )}
                  >
                    <div className={clsx("flex items-center", view === "month" ? "justify-between" : "justify-end")}>
                      {view === "month" ? (
                      <span
                        className={clsx(
                          "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium",
                          isToday ? "bg-gray-900 text-white" : past ? "text-gray-400" : "text-gray-700",
                        )}
                      >
                        {d.getDate()}
                      </span>
                      ) : null}
                      {!past ? (
                        <button
                          onClick={() => onNew(movedTime({ scheduled_at: null } as SocialPost, d))}
                          title={`New post for ${d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`}
                          className="rounded-md p-0.5 text-gray-400 opacity-0 transition hover:bg-gray-100 hover:text-gray-800 focus:opacity-100 group-hover:opacity-100"
                        >
                          <Plus size={14} />
                        </button>
                      ) : null}
                    </div>

                    {dayBlogs.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => onNewFromBlog(b.id, b.brand as SocialBrand)}
                        title={`Blog: ${b.title} — click to make a social post from it`}
                        className="flex items-center gap-1 truncate rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-left text-[10px] text-gray-500 hover:border-gray-400 hover:text-gray-800"
                      >
                        <Newspaper size={10} className="shrink-0" />
                        <span className="truncate">{b.title}</span>
                      </button>
                    ))}

                    {items.slice(0, max).map(({ post, at }) => (
                      <Chip
                        key={post.id}
                        post={post}
                        at={at}
                        big={view === "week"}
                        dragging={dragId === post.id}
                        onDragStart={() => setDragId(post.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverDay(null);
                        }}
                      />
                    ))}
                    {items.length > max ? (
                      <button
                        onClick={() => {
                          setAnchor(d);
                          setViewSaved("week");
                        }}
                        className="rounded px-1.5 text-left text-[11px] font-medium text-gray-500 hover:text-gray-900"
                      >
                        +{items.length - max} more
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500">
          {(["scheduled", "draft", "published", "failed"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={clsx("h-2 w-2 rounded-full", STATUS_DOT[s])} /> {STATUS_WORD[s]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <Newspaper size={11} /> Blog article
          </span>
          <span className="ml-auto">Drag a post to another day to move it — it keeps its time.</span>
        </div>
      </div>

      {/* Drafts with no date yet — drag one onto a day to plan it. */}
      <aside className="w-full shrink-0 rounded-xl border border-gray-200 bg-white p-3 shadow-sm lg:w-64">
        <h3 className="text-sm font-semibold text-gray-900">No date yet</h3>
        <p className="mt-0.5 text-[11px] text-gray-500">Drafts without a day. Drag one onto the calendar to plan it.</p>
        <div className="mt-3 space-y-1.5">
          {undated.length ? (
            undated.map((p) => (
              <Chip
                key={p.id}
                post={p}
                at={null}
                big
                dragging={dragId === p.id}
                onDragStart={() => setDragId(p.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverDay(null);
                }}
              />
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-[11px] text-gray-400">
              Every draft has a day.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Chip({
  post: p,
  at,
  big,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  post: SocialPost;
  at: Date | null;
  big: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const movable = canMove(p);
  const thumb = p.media[0];
  const size = big ? 40 : 26;
  return (
    <Link
      href={`/marketing/social/${p.id}`}
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", p.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      title={`${postTitle(p)} — ${STATUS_WORD[p.status]}${at ? ` · ${at.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}${movable ? "\nDrag to move it to another day." : ""}`}
      className={clsx(
        "group/chip flex items-center gap-1.5 rounded-md border bg-white p-1 text-left shadow-sm transition hover:border-gray-300 hover:shadow",
        p.brand === "NI" ? "border-l-[3px] border-l-blue-400 border-y-gray-200 border-r-gray-200" : "border-l-[3px] border-l-pink-400 border-y-gray-200 border-r-gray-200",
        movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging && "opacity-40",
      )}
    >
      <span className="relative shrink-0 overflow-hidden rounded bg-gray-100" style={{ width: size, height: size }}>
        {p.design?.slides[0] ? (
          <SlidePreview slide={p.design.slides[0]} brand={p.brand} index={1} total={p.design.slides.length} width={size} />
        ) : thumb?.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb.url} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : thumb?.kind === "video" ? (
          <span className="flex h-full w-full items-center justify-center text-gray-400">
            <Film size={12} />
          </span>
        ) : null}
        {p.post_type === "carousel" && big ? (
          <span className="absolute right-0.5 top-0.5 rounded bg-black/50 p-px text-white">
            <Images size={8} />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[p.status])} />
          {at ? <span className="text-[10px] font-semibold tabular-nums text-gray-700">{timeLabel(at)}</span> : null}
          <span className="ml-auto flex shrink-0 gap-0.5">
            {p.platforms.map((pl) => (
              <PlatformLogo key={pl} platform={pl} size={10} />
            ))}
          </span>
        </span>
        <span className={clsx("block truncate text-gray-700", big ? "text-[11px]" : "text-[10px]")}>{postTitle(p)}</span>
      </span>
      {movable && big ? <GripVertical size={12} className="shrink-0 text-gray-300 group-hover/chip:text-gray-400" /> : null}
    </Link>
  );
}
