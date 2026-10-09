"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Clapperboard, Grid3x3, Images, Loader2, SquareUser, X } from "lucide-react";
import clsx from "clsx";
import type { InstagramFeed, SocialBrand, SocialPost } from "@/lib/social/types";
import { getInstagramFeed } from "./api";
import SlidePreview from "./SlidePreview";

/**
 * "What will our Instagram look like on <date>?" — the brand's real profile
 * grid (pulled live from Meta) with every scheduled post that will have gone
 * out by the end of that day stacked on top, newest first, in Instagram's 3:4
 * profile tiles. Designed slides use the same SlideView the server renders.
 *
 * If Meta can't be reached the posts we published from here stand in for the
 * live grid, so the preview still works (just without older/outside posts).
 */

const TILE_W = 124;
const TILE_H = Math.round((TILE_W * 4) / 3);
const GAP = 2;
const PHONE_W = TILE_W * 3 + GAP * 2;

const BRAND_NAME: Record<SocialBrand, string> = { NI: "Natural Inspirations", Sassy: "Sassy" };
const BRAND_HANDLE: Record<SocialBrand, string> = { NI: "_naturalinspirations", Sassy: "sassy" };
const AVATAR: Record<SocialBrand, string> = { NI: "bg-[#1F3D35] text-[#F4F1EA] font-serif", Sassy: "bg-[#B3295C] text-white" };

type Tile =
  | { kind: "live"; key: string; at: string; imageUrl: string | null; type: "image" | "carousel" | "reel"; href: string | null }
  | { kind: "ours"; key: string; at: string; post: SocialPost; upcoming: boolean; draft: boolean };

/** yyyy-mm-dd in local time. */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const endOfDay = (day: string) => new Date(`${day}T23:59:59.999`);
const addDays = (n: number) => ymd(new Date(Date.now() + n * 86_400_000));
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const longDate = (day: string) =>
  endOfDay(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

function compact(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : n.toLocaleString();
}

/** Will this post (still) go to Instagram, and when? Null = not on the IG grid's future. */
function upcomingIgTime(p: SocialPost, includeDrafts: boolean): string | null {
  if (!p.platforms.includes("instagram") || !p.scheduled_at) return null;
  if (p.results.instagram?.status === "published") return null; // already in the live grid
  if (p.status === "scheduled" || p.status === "publishing") return p.scheduled_at;
  if (p.status === "draft" && includeDrafts) return p.scheduled_at;
  return null;
}

export default function FeedPreview({
  open,
  onClose,
  posts,
  initialBrand,
}: {
  open: boolean;
  onClose: () => void;
  posts: SocialPost[];
  initialBrand: SocialBrand;
}) {
  const [brand, setBrand] = useState<SocialBrand>(initialBrand);
  const [feeds, setFeeds] = useState<Partial<Record<SocialBrand, InstagramFeed>>>({});
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [markUpcoming, setMarkUpcoming] = useState(true);

  const lastScheduled = useMemo(() => {
    const times = posts
      .filter((p) => p.brand === brand)
      .map((p) => upcomingIgTime(p, includeDrafts))
      .filter((t): t is string => !!t)
      .sort();
    return times.length ? ymd(new Date(times[times.length - 1])) : null;
  }, [posts, brand, includeDrafts]);

  const today = ymd(new Date());
  const [pickedDay, setDay] = useState<string | null>(null);
  // Until someone picks a date, show the feed once everything queued is out.
  const day = pickedDay ?? (lastScheduled && lastScheduled > today ? lastScheduled : today);

  useEffect(() => {
    if (!open || feeds[brand]) return;
    getInstagramFeed(brand)
      .then((f) => setFeeds((prev) => ({ ...prev, [brand]: f })))
      .catch((e) =>
        setFeeds((prev) => ({
          ...prev,
          [brand]: { profile: null, items: [], error: e instanceof Error ? e.message : "Couldn't load Instagram." },
        })),
      );
  }, [open, brand, feeds]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const feed = feeds[brand];
  const cutoff = endOfDay(day).getTime();

  const tiles = useMemo<Tile[]>(() => {
    if (!feed) return [];
    const out: Tile[] = [];
    const mine = posts.filter((p) => p.brand === brand);

    if (!feed.error) {
      for (const m of feed.items) {
        out.push({
          kind: "live",
          key: m.id,
          at: m.timestamp,
          imageUrl: m.imageUrl,
          type: m.mediaType === "CAROUSEL_ALBUM" ? "carousel" : m.mediaType === "VIDEO" ? "reel" : "image",
          href: m.permalink,
        });
      }
    } else {
      // No live grid — our own Instagram posts stand in for it.
      for (const p of mine) {
        const r = p.results.instagram;
        if (r?.status !== "published") continue;
        out.push({ kind: "ours", key: p.id, at: r.at ?? p.published_at ?? p.updated_at, post: p, upcoming: false, draft: false });
      }
    }

    for (const p of mine) {
      const at = upcomingIgTime(p, includeDrafts);
      if (at) out.push({ kind: "ours", key: p.id, at, post: p, upcoming: true, draft: p.status === "draft" });
    }

    return out.filter((t) => new Date(t.at).getTime() <= cutoff).sort((a, b) => b.at.localeCompare(a.at));
  }, [feed, posts, brand, includeDrafts, cutoff]);

  if (!open) return null;

  const upcomingCount = tiles.filter((t) => t.kind === "ours" && t.upcoming).length;
  const liveShown = tiles.length - upcomingCount;
  const profile = feed?.profile ?? null;
  // Live media_count covers posts past the 60 we fetched; add what will have gone out.
  const postCount =
    profile?.mediaCount != null
      ? profile.mediaCount - (feed?.items.filter((m) => new Date(m.timestamp).getTime() > cutoff).length ?? 0) + upcomingCount
      : tiles.length;
  return (
    <div
      className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-gray-900/60 p-4 backdrop-blur-sm md:p-8"
      onClick={onClose}
    >
      <div className="w-full max-w-5xl rounded-3xl bg-gray-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Instagram grid on a future date</h2>
            <p className="text-sm text-gray-500">Your real Instagram, plus every scheduled post that will be up by then.</p>
          </div>
          <div className="ml-auto inline-flex rounded-full bg-white p-1 text-sm shadow-sm">
            {(["NI", "Sassy"] as SocialBrand[]).map((b) => (
              <button
                key={b}
                onClick={() => setBrand(b)}
                className={clsx(
                  "rounded-full px-4 py-1.5 font-medium transition",
                  brand === b ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900",
                )}
              >
                {BRAND_NAME[b]}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-white hover:text-gray-900" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-8 px-4 py-8 md:flex-row md:items-start md:justify-center">
          {/* Controls */}
          <div className="w-full max-w-xs space-y-5 text-sm md:order-2">
            <div>
              <label htmlFor="feed-day" className="mb-1.5 block font-semibold text-gray-800">
                Show the grid on
              </label>
              <input
                id="feed-day"
                type="date"
                value={day}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setDay(e.target.value);
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
              />
              <p className="mt-1.5 text-xs text-gray-500">{longDate(day)}, end of day</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {[
                  { label: "Today", value: today },
                  { label: "In a week", value: addDays(7) },
                  { label: "In a month", value: addDays(30) },
                  ...(lastScheduled && lastScheduled > today ? [{ label: "Last scheduled post", value: lastScheduled }] : []),
                ].map((q) => (
                  <button
                    key={q.label}
                    onClick={() => {
                      setDay(q.value);
                    }}
                    className={clsx(
                      "rounded-full border px-3 py-1 text-xs font-medium transition",
                      day === q.value
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 bg-white text-gray-700 hover:border-gray-400",
                    )}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="flex items-start gap-2.5 text-gray-700">
                <input type="checkbox" checked={markUpcoming} onChange={(e) => setMarkUpcoming(e.target.checked)} className="mt-0.5" />
                <span>Mark the scheduled posts</span>
              </label>
              <label className="flex items-start gap-2.5 text-gray-700">
                <input type="checkbox" checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} className="mt-0.5" />
                <span>
                  Include drafts that have a date
                  <span className="block text-xs text-gray-500">Handy for planning — drafts don&apos;t post by themselves.</span>
                </span>
              </label>
            </div>

            {feed && (
              <div className="rounded-xl bg-white p-4 text-gray-700 shadow-sm">
                <p>
                  <span className="font-semibold text-gray-900">{upcomingCount}</span> scheduled{" "}
                  {upcomingCount === 1 ? "post" : "posts"} will be up by then, on top of{" "}
                  <span className="font-semibold text-gray-900">{liveShown}</span> already posted.
                </p>
                <p className="mt-2 text-xs text-gray-500">Click a scheduled square to edit it; click a posted one to open it on Instagram.</p>
              </div>
            )}

            {feed?.error && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  Couldn&apos;t load the live Instagram grid ({feed.error}). Showing only posts sent from here.
                </span>
              </div>
            )}

            <p className="text-xs text-gray-400">
              A close mock-up: pinned posts and anything posted outside this app after today won&apos;t show.
            </p>
          </div>

          {/* Phone */}
          <div className="shrink-0 overflow-hidden rounded-[2rem] border-[6px] border-gray-900 bg-white shadow-xl md:order-1" style={{ width: PHONE_W + 12 }}>
            <div className="px-4 pb-3 pt-4">
              <p className="text-center text-sm font-semibold text-gray-900">{profile?.username ?? BRAND_HANDLE[brand]}</p>
              <div className="mt-3 flex items-center gap-5">
                {profile?.profilePictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.profilePictureUrl} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className={clsx("inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl", AVATAR[brand])}>
                    {brand === "NI" ? "NI" : "S"}
                  </span>
                )}
                <div className="flex flex-1 justify-around text-center text-gray-900">
                  <Stat n={feed ? postCount : null} label="posts" />
                  <Stat n={profile?.followers ?? null} label="followers" />
                  <Stat n={profile?.following ?? null} label="following" />
                </div>
              </div>
              <p className="mt-3 text-[13px] font-semibold text-gray-900">{profile?.name ?? BRAND_NAME[brand]}</p>
              {profile?.biography && <p className="whitespace-pre-line text-[13px] leading-snug text-gray-800">{profile.biography}</p>}
            </div>
            <div className="flex border-t border-gray-200 text-gray-400">
              <span className="flex flex-1 justify-center border-b-2 border-gray-900 py-2.5 text-gray-900">
                <Grid3x3 size={20} />
              </span>
              <span className="flex flex-1 justify-center py-2.5">
                <Clapperboard size={20} />
              </span>
              <span className="flex flex-1 justify-center py-2.5">
                <SquareUser size={20} />
              </span>
            </div>

            {!feed ? (
              <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-400">
                <Loader2 size={16} className="animate-spin" /> Loading Instagram…
              </div>
            ) : tiles.length === 0 ? (
              <p className="px-6 py-24 text-center text-sm text-gray-400">Nothing on the grid by this date.</p>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: `repeat(3, ${TILE_W}px)`, gap: GAP }}>
                {tiles.map((t) => (
                  <GridTile key={t.key} tile={t} brand={brand} mark={markUpcoming} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number | null; label: string }) {
  return (
    <div>
      <div className="text-base font-semibold">{n == null ? "—" : compact(n)}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}

function TypeIcon({ type }: { type: "image" | "carousel" | "reel" }) {
  if (type === "image") return null;
  return (
    <span className="absolute right-1.5 top-1.5 text-white drop-shadow">
      {type === "carousel" ? <Images size={16} /> : <Clapperboard size={16} />}
    </span>
  );
}

function GridTile({ tile, brand, mark }: { tile: Tile; brand: SocialBrand; mark: boolean }) {
  const box = "relative block overflow-hidden bg-gray-100";
  const size = { width: TILE_W, height: TILE_H };

  if (tile.kind === "live") {
    const inner = (
      <>
        {tile.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tile.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
        <TypeIcon type={tile.type} />
      </>
    );
    return tile.href ? (
      <a href={tile.href} target="_blank" rel="noopener noreferrer" className={box} style={size} title={`Posted ${shortDate(tile.at)}`}>
        {inner}
      </a>
    ) : (
      <div className={box} style={size}>
        {inner}
      </div>
    );
  }

  const p = tile.post;
  const slide = p.design?.slides[0];
  const first = p.media[0];
  const type = p.post_type;
  return (
    <Link
      href={`/marketing/social/${p.id}`}
      className={clsx(box, mark && tile.upcoming && "ring-2 ring-inset ring-blue-500")}
      style={size}
      title={`${tile.upcoming ? (tile.draft ? "Draft for" : "Scheduled for") : "Posted"} ${new Date(tile.at).toLocaleString()}`}
    >
      {slide && !first ? (
        // Slides are 4:5; the grid crops them to 3:4 from the centre, like Instagram.
        <div className="absolute top-0" style={{ left: (TILE_W - TILE_H * 0.8) / 2 }}>
          <SlidePreview slide={slide} brand={brand} index={1} total={p.design!.slides.length} width={TILE_H * 0.8} />
        </div>
      ) : first?.kind === "video" ? (
        <video src={first.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
      ) : first ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={first.url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : null}
      <TypeIcon type={type} />
      {mark && tile.upcoming && (
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
          <CalendarClock size={10} />
          {tile.draft ? "Draft " : ""}
          {shortDate(tile.at)}
        </span>
      )}
    </Link>
  );
}
