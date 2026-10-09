"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, Film, Grid3x3, Images, LayoutGrid, Loader2, Plus, Share2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import TabNav, { type Tab } from "@/components/ui/TabNav";
import { useBrand } from "@/components/BrandContext";
import { BrandPill, formatDateTime, relativeTime } from "@/components/marketing/blog/bits";
import {
  PLATFORM_LABEL,
  type MetaConnectionStatus,
  type SocialBrand,
  type SocialPost,
} from "@/lib/social/types";
import { getSocialStatus, listSocialPosts } from "./api";
import FeedPreview from "./FeedPreview";
import GridPlanner from "./GridPlanner";
import NewSocialWizard from "./NewSocialWizard";
import SlidePreview, { SlideFonts } from "./SlidePreview";
import { SocialStatusPill } from "./bits";

/**
 * Social Media Posts — compose once, publish to the brand's Facebook Page and
 * Instagram account via the Meta Graph API, now or at a scheduled time. The
 * social-publish cron (every 5 min) sends scheduled posts. The global brand
 * switch scopes the list.
 */

type Bucket = "scheduled" | "drafts" | "published" | "attention";

const TABS: Tab<Bucket>[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "drafts", label: "Drafts" },
  { value: "published", label: "Published" },
  { value: "attention", label: "Needs attention" },
];

function bucketOf(p: SocialPost): Bucket {
  if (p.status === "scheduled" || p.status === "publishing") return "scheduled";
  if (p.status === "published") return "published";
  if (p.status === "draft") return "drafts";
  return "attention"; // failed, partial
}

const EMPTY_COPY: Record<Bucket, string> = {
  scheduled: "Nothing queued. Write a post, pick a date and time, and click Schedule — it posts by itself.",
  drafts: "No drafts. Start one with New post.",
  published: "Nothing has been posted from here yet.",
  attention: "All good — no failed posts.",
};

export default function SocialPostsPage() {
  const { brand } = useBrand();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket>("scheduled");
  const [conn, setConn] = useState<MetaConnectionStatus | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  // /marketing/social?fromBlog=<id>&brand=NI — "Make a social post" from the blog editor.
  const [fromBlog, setFromBlog] = useState<{ id: string; brand: SocialBrand } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("fromBlog");
    if (!id) return;
    const b = q.get("brand") === "Sassy" ? "Sassy" : "NI";
    setFromBlog({ id, brand: b });
    setWizardOpen(true);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const [feed, setFeed] = useState<{ brand: SocialBrand; drafts: boolean } | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await listSocialPosts();
      setPosts(res.posts);
      setHint(res.notReady ? (res.hint ?? "Social posts aren't set up yet.") : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load posts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    getSocialStatus().then(setConn).catch(() => setConn(null));
  }, [load]);

  // While anything is publishing, refresh so reels flip to Posted on their own.
  const anyPublishing = posts.some((p) => p.status === "publishing");
  useEffect(() => {
    if (!anyPublishing) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [anyPublishing, load]);

  const scoped = useMemo(() => (brand === "all" ? posts : posts.filter((p) => p.brand === brand)), [posts, brand]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { scheduled: 0, drafts: 0, published: 0, attention: 0 };
    for (const p of scoped) c[bucketOf(p)] += 1;
    return c;
  }, [scoped]);

  const rows = useMemo(() => {
    const list = scoped.filter((p) => bucketOf(p) === bucket);
    if (bucket === "scheduled") return list.sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
    if (bucket === "published") {
      return list.sort((a, b) => (b.published_at ?? b.updated_at).localeCompare(a.published_at ?? a.updated_at));
    }
    return list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [scoped, bucket]);

  const defaultBrand: SocialBrand = brand === "Sassy" ? "Sassy" : "NI";
  // Unknown (status still loading / failed) stays undefined — don't warn on a guess.
  const connected: Partial<Record<SocialBrand, boolean>> = {};
  for (const b of conn?.brands ?? []) connected[b.brand] = b.configured && b.ok;

  const tabs = TABS.map((t) => ({ ...t, label: `${t.label} · ${counts[t.value]}` }));

  return (
    <div className="w-full space-y-6 p-6 md:px-8">
      <SlideFonts />
      <PageHeader subtitle="Write a post once and send it to the brand's Instagram and Facebook — right now, or at a time you pick. Scheduled posts go out within five minutes of their time.">
        <button
          onClick={() => setFeed({ brand: defaultBrand, drafts: false })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          <Grid3x3 size={14} />
          Preview grid
        </button>
        <button
          onClick={() => setPlannerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          <LayoutGrid size={14} />
          Plan a grid
        </button>
        <button
          onClick={() => setWizardOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          <Plus size={14} />
          New post
        </button>
      </PageHeader>

      <ConnectionStrip conn={conn} />

      {hint && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{hint}</div>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <TabNav tabs={tabs} active={bucket} onChange={setBucket} />

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Loading posts…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
          {bucket === "scheduled" ? (
            <CalendarClock size={24} className="mx-auto text-gray-300" />
          ) : (
            <Share2 size={24} className="mx-auto text-gray-300" />
          )}
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-400">{EMPTY_COPY[bucket]}</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {rows.map((p) => (
            <PostRow key={p.id} post={p} />
          ))}
        </div>
      )}

      {feed && (
        <FeedPreview
          open
          onClose={() => setFeed(null)}
          posts={posts}
          initialBrand={feed.brand}
          initialIncludeDrafts={feed.drafts}
        />
      )}

      {plannerOpen && (
        <GridPlanner
          posts={posts}
          defaultBrand={defaultBrand}
          connected={connected}
          onClose={() => setPlannerOpen(false)}
          onChanged={load}
          onOpenPreview={(b) => {
            setPlannerOpen(false);
            setFeed({ brand: b, drafts: true });
          }}
        />
      )}

      {wizardOpen && (
        <NewSocialWizard
          defaultBrand={fromBlog?.brand ?? defaultBrand}
          initialBlogId={fromBlog?.id ?? null}
          onClose={() => {
            setWizardOpen(false);
            setFromBlog(null);
          }}
          onCreated={(post) => router.push(`/marketing/social/${post.id}`)}
        />
      )}
    </div>
  );
}

function PostRow({ post: p }: { post: SocialPost }) {
  const thumb = p.media[0];
  const when = p.status === "published" || p.status === "partial" ? p.published_at : p.scheduled_at;
  return (
    <Link href={`/marketing/social/${p.id}`} className="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-gray-50/70">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {p.design?.slides[0] && !thumb ? (
          <SlidePreview slide={p.design.slides[0]} brand={p.brand} index={1} total={p.design.slides.length} width={56} />
        ) : thumb?.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb.url} alt="" className="h-full w-full object-cover" />
        ) : thumb?.kind === "video" ? (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <Film size={20} />
          </div>
        ) : null}
        {p.post_type === "carousel" && (
          <span className="absolute right-1 top-1 rounded bg-black/50 p-0.5 text-white">
            <Images size={10} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray-900">
          {p.title?.trim() || p.caption.trim() || <span className="text-gray-400">Untitled post</span>}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
          <BrandPill brand={p.brand} />
          <SocialStatusPill status={p.status} />
          {p.design?.grid && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700" title="Part of a grid set">
              <LayoutGrid size={10} />
              {p.design.grid.story} · {p.design.grid.slot}/{p.design.grid.size}
            </span>
          )}
          {p.platforms.map((pl) => {
            const r = p.results[pl];
            return (
              <span key={pl} className="inline-flex items-center gap-1">
                {r?.status === "published" ? (
                  <CheckCircle2 size={12} className="text-green-600" />
                ) : r?.status === "failed" ? (
                  <AlertTriangle size={12} className="text-red-500" />
                ) : null}
                {PLATFORM_LABEL[pl]}
                {r?.permalink && (
                  // A button, not a link — the whole row is already a link.
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.open(r.permalink, "_blank", "noopener,noreferrer");
                    }}
                    className="text-gray-400 hover:text-gray-700"
                    aria-label={`Open on ${PLATFORM_LABEL[pl]}`}
                  >
                    <ExternalLink size={11} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
        {p.last_error && (p.status === "failed" || p.status === "partial") && (
          <p className="mt-1 truncate text-[11px] text-red-600">{p.last_error}</p>
        )}
      </div>

      <div className="shrink-0 text-right text-xs text-gray-600">
        {when ? (
          <>
            <div>{formatDateTime(when)}</div>
            <div className="text-[11px] text-gray-400">{relativeTime(when)}</div>
          </>
        ) : (
          <span className="text-gray-400">No date</span>
        )}
      </div>
    </Link>
  );
}

/**
 * Silent when Meta is working. Only speaks up when something is actually
 * broken: no token at all, or a brand that IS set up failing to connect. A
 * brand with no Page id yet (Sassy for now) just isn't offered — no warning.
 */
function ConnectionStrip({ conn }: { conn: MetaConnectionStatus | null }) {
  if (!conn) return null;
  const broken = conn.configured ? conn.brands.filter((b) => b.configured && !b.ok) : [];
  const noneSetUp = conn.configured && conn.brands.every((b) => !b.configured);
  if (conn.configured && !noneSetUp && broken.length === 0) return null;
  if (noneSetUp) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Meta is connected but no brand has a Page yet. Set META_PAGE_ID_NI / META_PAGE_ID_SASSY in Vercel:
        <ul className="mt-1 font-mono text-xs">
          {(conn.visiblePages ?? []).map((p) => (
            <li key={p.id}>
              {p.id} — {p.name}
              {p.instagram ? ` (IG @${p.instagram})` : ""}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <div>
        {!conn.configured
          ? "Meta isn't connected, so nothing will post. Set META_ACCESS_TOKEN in Vercel (docs/integrations.md, Meta section)."
          : broken.map((b) => (
              <div key={b.brand}>
                {b.brand} can&apos;t post right now: {b.error}
              </div>
            ))}
      </div>
    </div>
  );
}
