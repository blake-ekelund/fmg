"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Film,
  Grid3x3,
  Images,
  LayoutGrid,
  Loader2,
  Plus,
  Share2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { toast, updateToast } from "@/lib/toast";
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
import { deleteSocialPost, getSocialStatus, listSocialPosts, updateSocialPost } from "./api";
import FeedPreview from "./FeedPreview";
import GridPlanner from "./GridPlanner";
import { onOpenRequest, onPostsChanged } from "./gridJobs";
import NewSocialWizard from "./NewSocialWizard";
import SlidePreview, { SlideFonts } from "./SlidePreview";
import { ConfirmDialog, SocialStatusPill } from "./bits";

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
  // Open = { jobId }; a toast's button reopens the planner on its background job.
  const [planner, setPlanner] = useState<{ jobId: string | null } | null>(null);
  // Multi-select: ids picked in the current tab; the bulk bar acts on them.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  // Background grid jobs: reload when they create / schedule posts; toasts open the planner or preview.
  useEffect(() => onPostsChanged(() => void load()), [load]);
  useEffect(
    () =>
      onOpenRequest((r) => {
        if (r.kind === "job") setPlanner({ jobId: r.id });
        else {
          setPlanner(null);
          setFeed({ brand: r.brand, drafts: false });
        }
      }),
    [],
  );

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

  const picked = rows.filter((p) => selected.has(p.id));
  const canSchedule = picked.filter((p) => (p.status === "draft" || p.status === "failed") && p.scheduled_at);
  const canUnschedule = picked.filter((p) => p.status === "scheduled");
  const canDelete = picked.filter((p) => p.status !== "publishing");
  const allPicked = rows.length > 0 && picked.length === rows.length;

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Run one action over many posts in the background, with a progress toast. */
  function runBulk(list: SocialPost[], verb: { doing: string; done: string }, fn: (p: SocialPost) => Promise<unknown>) {
    if (!list.length) return;
    setSelected(new Set());
    const t = toast({ tone: "working", title: `${verb.doing} ${list.length} ${list.length === 1 ? "post" : "posts"}…` });
    void (async () => {
      const failed: string[] = [];
      for (let i = 0; i < list.length; i++) {
        updateToast(t, { title: `${verb.doing} ${i + 1} of ${list.length}…` });
        try {
          await fn(list[i]);
        } catch (e) {
          failed.push(`${list[i].title?.trim() || "Untitled"}: ${e instanceof Error ? e.message : "failed"}`);
        }
      }
      await load();
      updateToast(
        t,
        failed.length
          ? {
              tone: "error",
              sticky: true,
              title: `${list.length - failed.length} of ${list.length} ${verb.done}`,
              body: failed.slice(0, 3).join(" · ") + (failed.length > 3 ? ` · and ${failed.length - 3} more` : ""),
            }
          : { tone: "success", sticky: false, title: `${list.length} ${list.length === 1 ? "post" : "posts"} ${verb.done}` },
      );
    })();
  }

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
          onClick={() => setPlanner({ jobId: null })}
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

      <TabNav
        tabs={tabs}
        active={bucket}
        onChange={(b) => {
          setBucket(b);
          setSelected(new Set());
        }}
      />

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
          <label className="flex cursor-pointer items-center gap-3 bg-gray-50/70 px-4 py-2 text-xs font-medium text-gray-500">
            <input
              type="checkbox"
              checked={allPicked}
              ref={(el) => {
                if (el) el.indeterminate = picked.length > 0 && !allPicked;
              }}
              onChange={() => setSelected(allPicked ? new Set() : new Set(rows.map((p) => p.id)))}
              className="h-4 w-4 rounded border-gray-300"
            />
            {picked.length ? `${picked.length} of ${rows.length} selected` : "Select all"}
          </label>
          {rows.map((p) => (
            <PostRow key={p.id} post={p} selected={selected.has(p.id)} onToggle={() => toggle(p.id)} />
          ))}
        </div>
      )}

      {picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-gray-900 px-4 py-2.5 text-sm text-white shadow-2xl">
            <span className="mr-2 font-medium">
              {picked.length} selected
            </span>
            {canSchedule.length > 0 && (
              <BulkButton
                icon={<CalendarClock size={14} />}
                onClick={() =>
                  runBulk(canSchedule, { doing: "Scheduling", done: "scheduled" }, (p) => updateSocialPost(p.id, { action: "schedule" }))
                }
              >
                Schedule {canSchedule.length < picked.length ? canSchedule.length : ""}
              </BulkButton>
            )}
            {canUnschedule.length > 0 && (
              <BulkButton
                icon={<Undo2 size={14} />}
                onClick={() =>
                  runBulk(canUnschedule, { doing: "Moving", done: "moved to drafts" }, (p) => updateSocialPost(p.id, { action: "draft" }))
                }
              >
                Move {canUnschedule.length < picked.length ? `${canUnschedule.length} ` : ""}to drafts
              </BulkButton>
            )}
            {canDelete.length > 0 && (
              <BulkButton icon={<Trash2 size={14} />} danger onClick={() => setConfirmDelete(true)}>
                Delete {canDelete.length < picked.length ? canDelete.length : ""}
              </BulkButton>
            )}
            <button onClick={() => setSelected(new Set())} className="ml-1 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Clear selection">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${canDelete.length} ${canDelete.length === 1 ? "post" : "posts"}?`}
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          runBulk(canDelete, { doing: "Deleting", done: "deleted" }, (p) => deleteSocialPost(p.id));
        }}
      >
        They&apos;re removed from this list for good. Anything already on Instagram or Facebook stays there.
        {canDelete.length < picked.length && " Posts that are publishing right now are skipped."}
      </ConfirmDialog>

      {feed && (
        <FeedPreview
          open
          onClose={() => setFeed(null)}
          posts={posts}
          initialBrand={feed.brand}
          initialIncludeDrafts={feed.drafts}
        />
      )}

      {planner && (
        <GridPlanner
          key={planner.jobId ?? "new"}
          posts={posts}
          defaultBrand={defaultBrand}
          connected={connected}
          resumeJobId={planner.jobId}
          onClose={() => setPlanner(null)}
          onOpenPreview={(b) => {
            setPlanner(null);
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

function BulkButton({
  icon,
  danger,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition",
        danger ? "bg-red-600 hover:bg-red-500" : "bg-white/10 hover:bg-white/20",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function PostRow({ post: p, selected, onToggle }: { post: SocialPost; selected: boolean; onToggle: () => void }) {
  const thumb = p.media[0];
  const when = p.status === "published" || p.status === "partial" ? p.published_at : p.scheduled_at;
  return (
    <Link
      href={`/marketing/social/${p.id}`}
      className={clsx("flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-gray-50/70", selected && "bg-blue-50/60")}
    >
      <input
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 rounded border-gray-300"
        aria-label={`Select ${p.title?.trim() || "post"}`}
      />
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {/* A designed post always shows its live design — the rendered images in
            media can lag behind edits until the next render (publish re-renders). */}
        {p.design?.slides[0] ? (
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
