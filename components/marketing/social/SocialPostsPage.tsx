"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Film,
  Grid3x3,
  Images,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Share2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { toast, updateToast } from "@/lib/toast";
import PageMeta from "@/components/PageMeta";
import { useBrand } from "@/components/BrandContext";
import { BrandPill, formatDateTime, relativeTime } from "@/components/marketing/blog/bits";
import {
  PLATFORM_LABEL,
  type MetaConnectionStatus,
  type SocialBrand,
  type SocialPlatform,
  type SocialPost,
} from "@/lib/social/types";
import { deleteSocialPost, getSocialStatus, listSocialPosts, publishSocialPostNow, updateSocialPost } from "./api";
import FeedPreview from "./FeedPreview";
import GridPlanner from "./GridPlanner";
import { onOpenRequest, onPostsChanged } from "./gridJobs";
import NewSocialWizard from "./NewSocialWizard";
import SocialCalendar from "./SocialCalendar";
import SlidePreview, { SlideFonts } from "./SlidePreview";
import { ConfirmDialog, SocialStatusPill } from "./bits";
import ConnectedAccounts, { PlatformLogo } from "./ConnectedAccounts";
import BulkScheduleDialog from "@/components/ui/BulkScheduleDialog";

/**
 * Social Media Posts — compose once, publish to the brand's Facebook Page and
 * Instagram account via the Meta Graph API, now or at a scheduled time. The
 * social-publish cron (every 5 min) sends scheduled posts. The global brand
 * switch scopes the list.
 *
 * Layout: connected accounts → toolbar (status filter + create actions) →
 * banded table, 25 a page, where every per-post action lives on its row.
 */

type Bucket = "all" | "scheduled" | "drafts" | "published" | "attention";

const PAGE_SIZE = 25;

const FILTERS: { value: Bucket; label: string; dot: string }[] = [
  { value: "all", label: "All", dot: "bg-gray-400" },
  { value: "scheduled", label: "Scheduled", dot: "bg-emerald-500" },
  { value: "drafts", label: "Drafts", dot: "bg-amber-400" },
  { value: "published", label: "Published", dot: "bg-green-600" },
  { value: "attention", label: "Needs attention", dot: "bg-red-500" },
];

function bucketOf(p: SocialPost): Exclude<Bucket, "all"> {
  if (p.status === "scheduled" || p.status === "publishing") return "scheduled";
  if (p.status === "published") return "published";
  if (p.status === "draft") return "drafts";
  return "attention"; // failed, partial
}

const EMPTY_COPY: Record<Bucket, string> = {
  all: "No posts yet. Start one with New post.",
  scheduled: "Nothing queued. Write a post, pick a date and time, and click Schedule — it posts by itself.",
  drafts: "No drafts. Start one with New post.",
  published: "Nothing has been posted from here yet.",
  attention: "All good — no failed posts.",
};

/** Where a post lands, by name: "@sassyskin" / "Natural Inspirations" rather than just "Instagram". */
type AccountNames = Partial<Record<SocialBrand, Partial<Record<SocialPlatform, string>>>>;

function accountNames(conn: MetaConnectionStatus | null): AccountNames {
  const out: AccountNames = {};
  for (const b of conn?.brands ?? []) {
    out[b.brand] = {
      instagram: b.instagram?.username ? `@${b.instagram.username}` : undefined,
      facebook: b.facebook?.name,
    };
  }
  return out;
}

/** Link to the live post. Older rows saved a Facebook id without a permalink. */
function liveUrl(p: SocialPost, pl: SocialPlatform): string | null {
  const r = p.results[pl];
  if (r?.status !== "published") return null;
  if (r.permalink) return r.permalink;
  if (pl === "facebook" && r.id) return `https://www.facebook.com/${r.id}`;
  return null;
}

export default function SocialPostsPage() {
  const { brand } = useBrand();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket>("all");
  const [page, setPage] = useState(0);
  const [conn, setConn] = useState<MetaConnectionStatus | null>(null);
  const [connLoading, setConnLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  // A calendar day's "+": the new post is planned for that day.
  const [newAt, setNewAt] = useState<Date | null>(null);
  // List or calendar — remembered per browser.
  const [layout, setLayout] = useState<"list" | "calendar">(() => {
    try {
      return localStorage.getItem("social-layout") === "calendar" ? "calendar" : "list";
    } catch {
      return "list";
    }
  });
  const switchLayout = (v: "list" | "calendar") => {
    setLayout(v);
    setSelected(new Set());
    try {
      localStorage.setItem("social-layout", v);
    } catch {
      /* per-viewer convenience only */
    }
  };
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
  // Multi-select: ids picked in the current filter; the bulk bar acts on them.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Dialog targets — one post from its row's actions, or the bulk selection.
  const [toDelete, setToDelete] = useState<SocialPost[] | null>(null);
  const [toSchedule, setToSchedule] = useState<SocialPost[] | null>(null);
  const [toPublish, setToPublish] = useState<SocialPost | null>(null);
  const lastClicked = useRef<number | null>(null);
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
    getSocialStatus()
      .then(setConn)
      .catch(() => setConn(null))
      .finally(() => setConnLoading(false));
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
    const c: Record<Bucket, number> = { all: scoped.length, scheduled: 0, drafts: 0, published: 0, attention: 0 };
    for (const p of scoped) c[bucketOf(p)] += 1;
    return c;
  }, [scoped]);

  const rows = useMemo(() => {
    const list = bucket === "all" ? [...scoped] : scoped.filter((p) => bucketOf(p) === bucket);
    if (bucket === "scheduled") return list.sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
    if (bucket === "published") {
      return list.sort((a, b) => (b.published_at ?? b.updated_at).localeCompare(a.published_at ?? a.updated_at));
    }
    return list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [scoped, bucket]);

  // Back to page 1 whenever the filter or brand changes; clamp if rows shrink under us.
  useEffect(() => setPage(0), [bucket, brand]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const defaultBrand: SocialBrand = brand === "Sassy" ? "Sassy" : "NI";
  // Unknown (status still loading / failed) stays undefined — don't warn on a guess.
  const connected: Partial<Record<SocialBrand, boolean>> = {};
  for (const b of conn?.brands ?? []) connected[b.brand] = b.configured && b.ok;
  const names = useMemo(() => accountNames(conn), [conn]);

  const picked = rows.filter((p) => selected.has(p.id));
  const canSchedule = picked.filter((p) => (p.status === "draft" || p.status === "failed") && p.scheduled_at);
  const canUnschedule = picked.filter((p) => p.status === "scheduled");
  // Anything not yet out can be given new times in one go.
  const canReschedule = picked.filter((p) => p.status === "draft" || p.status === "failed" || p.status === "scheduled");
  const canDelete = picked.filter((p) => p.status !== "publishing");
  const pagePicked = pageRows.filter((p) => selected.has(p.id)).length;
  const allPagePicked = pageRows.length > 0 && pagePicked === pageRows.length;

  /** Tick / untick a row; with Shift, everything between it and the last one clicked on this page. */
  function toggle(i: number, shift: boolean) {
    const id = pageRows[i].id;
    setSelected((cur) => {
      const next = new Set(cur);
      const on = !cur.has(id);
      if (shift && lastClicked.current !== null) {
        const [a, b] = [Math.min(lastClicked.current, i), Math.max(lastClicked.current, i)];
        for (let k = a; k <= b; k++) {
          if (on) next.add(pageRows[k].id);
          else next.delete(pageRows[k].id);
        }
      } else if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    lastClicked.current = i;
  }

  function togglePage() {
    setSelected((cur) => {
      const next = new Set(cur);
      for (const p of pageRows) {
        if (allPagePicked) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  }

  /** Run one action over one or many posts in the background, with a progress toast. */
  function runBulk(list: SocialPost[], verb: { doing: string; done: string }, fn: (p: SocialPost) => Promise<unknown>) {
    if (!list.length) return;
    setSelected(new Set());
    const noun = (n: number) => `${n} ${n === 1 ? "post" : "posts"}`;
    const t = toast({ tone: "working", title: `${verb.doing} ${noun(list.length)}…` });
    void (async () => {
      const failed: string[] = [];
      for (let i = 0; i < list.length; i++) {
        if (list.length > 1) updateToast(t, { title: `${verb.doing} ${i + 1} of ${list.length}…` });
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
          : { tone: "success", sticky: false, title: `${noun(list.length)} ${verb.done}` },
      );
    })();
  }

  /** Calendar drag: a new day for a post that hasn't gone out. Shown at once;
   *  a scheduled post is re-queued for the new time (the server re-checks it),
   *  a draft just gets its planned day. A failure puts it back. */
  function movePost(p: SocialPost, at: Date) {
    const iso = at.toISOString();
    setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, scheduled_at: iso } : x)));
    const day = at.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const name = p.title?.trim() || "Post";
    updateSocialPost(p.id, p.status === "scheduled" ? { scheduled_at: iso, action: "schedule" } : { scheduled_at: iso })
      .then((saved) => {
        setPosts((list) => list.map((x) => (x.id === saved.id ? saved : x)));
        toast({
          tone: "success",
          title: `${name} moved to ${day}`,
          body: p.status === "scheduled" ? "Still scheduled — it posts at the new time." : "Still a draft — schedule it when it's ready.",
        });
      })
      .catch((e) => {
        toast({ tone: "error", sticky: true, title: `Couldn't move ${name}`, body: e instanceof Error ? e.message : undefined });
        void load();
      });
  }

  const rowActions: RowHandlers = {
    publish: (p) => setToPublish(p),
    schedule: (p) => setToSchedule([p]),
    unschedule: (p) => runBulk([p], { doing: "Moving", done: "moved to drafts" }, (x) => updateSocialPost(x.id, { action: "draft" })),
    retry: (p) => runBulk([p], { doing: "Retrying", done: "re-queued" }, (x) => updateSocialPost(x.id, { action: "retry" })),
    remove: (p) => setToDelete([p]),
  };

  return (
    <div className="w-full space-y-4 p-6 md:px-8">
      <SlideFonts />
      <PageMeta
        title="Social Media"
        description="Write a post once and send it to the brand's Instagram and Facebook, now or scheduled."
      />

      <ConnectedAccounts conn={conn} loading={connLoading} brand={brand} />

      {hint && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{hint}</div>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Toolbar: what you're looking at (left), what you can make (right). */}
      {/* One row on a normal desktop; if it ever wraps, the make-buttons stay right-aligned. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* List / Calendar — icons with tooltips, to keep the row short */}
        <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {(
            [
              ["list", "List", List],
              ["calendar", "Calendar", CalendarDays],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => switchLayout(v)}
              title={`${label} view`}
              aria-label={`${label} view`}
              aria-pressed={layout === v}
              className={clsx(
                "inline-flex h-8 w-9 items-center justify-center rounded-lg transition",
                layout === v ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
              )}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-0.5 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {FILTERS.map((f) => {
            const active = bucket === f.value;
            const n = counts[f.value];
            const alarm = f.value === "attention" && n > 0;
            return (
              <button
                key={f.value}
                onClick={() => {
                  setBucket(f.value);
                  setSelected(new Set());
                }}
                className={clsx(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition",
                  active ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                )}
              >
                {f.value !== "all" && <span className={clsx("h-2 w-2 rounded-full", f.dot)} />}
                {f.label}
                <span
                  className={clsx(
                    "min-w-[1.5rem] rounded-full px-1.5 py-px text-center text-[11px] font-semibold tabular-nums",
                    alarm
                      ? "bg-red-500 text-white"
                      : active
                        ? "bg-white/20 text-white"
                        : "bg-gray-100 text-gray-500",
                  )}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFeed({ brand: defaultBrand, drafts: false })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <Grid3x3 size={14} />
            Preview grid
          </button>
          <button
            onClick={() => setPlanner({ jobId: null })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <LayoutGrid size={14} />
            Plan a grid
          </button>
          <button
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
          >
            <Plus size={14} />
            New post
          </button>
        </div>
      </div>

      {layout === "calendar" && !loading ? (
        <SocialCalendar
          posts={rows}
          blogBrands={brand === "all" ? ["Sassy", "NI"] : [brand]}
          onMove={movePost}
          onNew={(at) => {
            setNewAt(at);
            setWizardOpen(true);
          }}
          onNewFromBlog={(id, b) => {
            setFromBlog({ id, brand: b });
            setWizardOpen(true);
          }}
        />
      ) : loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Loading posts…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
          {bucket === "scheduled" ? (
            <CalendarClock size={24} className="mx-auto text-gray-300" />
          ) : (
            <Share2 size={24} className="mx-auto text-gray-300" />
          )}
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-400">{EMPTY_COPY[bucket]}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={allPagePicked}
                      ref={(el) => {
                        if (el) el.indeterminate = pagePicked > 0 && !allPagePicked;
                      }}
                      onChange={togglePage}
                      className="h-4 w-4 rounded border-gray-300"
                      aria-label="Select all on this page"
                    />
                  </th>
                  <th className="px-3 py-2.5">Post</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Accounts</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p, i) => (
                  <PostRow
                    key={p.id}
                    post={p}
                    names={names}
                    selected={selected.has(p.id)}
                    onToggle={(shift) => toggle(i, shift)}
                    actions={rowActions}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={safePage}
            pageCount={pageCount}
            total={rows.length}
            onPage={(n) => {
              setPage(n);
              lastClicked.current = null;
            }}
          />
        </div>
      )}

      {picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-gray-900 px-4 py-2.5 text-sm text-white shadow-2xl">
            <span className="mr-2 font-medium">{picked.length} selected</span>
            {canReschedule.length > 0 && (
              <BulkButton icon={<CalendarClock size={14} />} onClick={() => setToSchedule(canReschedule)}>
                {canReschedule.some((p) => p.status === "scheduled") ? "Reschedule…" : "Schedule…"}
              </BulkButton>
            )}
            {canSchedule.length > 0 && (
              <BulkButton
                icon={<CalendarClock size={14} />}
                onClick={() =>
                  runBulk(canSchedule, { doing: "Scheduling", done: "scheduled" }, (p) => updateSocialPost(p.id, { action: "schedule" }))
                }
              >
                Schedule {canSchedule.length < picked.length ? `${canSchedule.length} ` : ""}at their set times
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
              <BulkButton icon={<Trash2 size={14} />} danger onClick={() => setToDelete(canDelete)}>
                Delete {canDelete.length < picked.length ? canDelete.length : ""}
              </BulkButton>
            )}
            <button onClick={() => setSelected(new Set())} className="ml-1 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Clear selection">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {toSchedule && (
        <BulkScheduleDialog
          posts={toSchedule.map((p) => ({ id: p.id, title: p.title?.trim() || "Untitled post", scheduled: p.status === "scheduled" }))}
          busy={false}
          onCancel={() => setToSchedule(null)}
          onConfirm={(times) => {
            const list = toSchedule;
            const at = new Map(list.map((p, i) => [p.id, times[i]]));
            setToSchedule(null);
            runBulk(list, { doing: "Scheduling", done: "scheduled" }, (p) =>
              updateSocialPost(p.id, { scheduled_at: at.get(p.id)!, action: "schedule" }),
            );
          }}
        />
      )}

      <ConfirmDialog
        open={!!toPublish}
        title="Post this now?"
        confirmLabel="Post now"
        onCancel={() => setToPublish(null)}
        onConfirm={() => {
          const p = toPublish!;
          setToPublish(null);
          runBulk([p], { doing: "Posting", done: "posted" }, (x) => publishSocialPostNow(x.id, {}));
        }}
      >
        {toPublish && (
          <>
            It goes live right away on{" "}
            {toPublish.platforms
              .map((pl) => names[toPublish.brand]?.[pl] ?? `${toPublish.brand} ${PLATFORM_LABEL[pl]}`)
              .join(" and ")}
            .
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.length ?? 0} ${toDelete?.length === 1 ? "post" : "posts"}?`}
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const list = toDelete ?? [];
          setToDelete(null);
          runBulk(list, { doing: "Deleting", done: "deleted" }, (p) => deleteSocialPost(p.id));
        }}
      >
        They&apos;re removed from this list for good. Anything already on Instagram or Facebook stays there.
        {toDelete && toDelete.length < picked.length && " Posts that are publishing right now are skipped."}
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
          initialScheduledAt={newAt?.toISOString() ?? null}
          onClose={() => {
            setWizardOpen(false);
            setFromBlog(null);
            setNewAt(null);
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

function Pagination({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (n: number) => void;
}) {
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  // First, last, and a window around the current page; gaps become "…".
  const shown = [...new Set([0, pageCount - 1, page - 1, page, page + 1])]
    .filter((n) => n >= 0 && n < pageCount)
    .sort((a, b) => a - b);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
      <span>
        Showing <span className="font-semibold text-gray-700">{from}–{to}</span> of{" "}
        <span className="font-semibold text-gray-700">{total}</span> {total === 1 ? "post" : "posts"}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <PageButton disabled={page === 0} onClick={() => onPage(page - 1)} label="Previous page">
            <ChevronLeft size={14} />
          </PageButton>
          {shown.map((n, i) => (
            <span key={n} className="flex items-center gap-1">
              {i > 0 && n - shown[i - 1] > 1 && <span className="px-1 text-gray-400">…</span>}
              <PageButton active={n === page} onClick={() => onPage(n)} label={`Page ${n + 1}`}>
                {n + 1}
              </PageButton>
            </span>
          ))}
          <PageButton disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)} label="Next page">
            <ChevronRight size={14} />
          </PageButton>
        </div>
      )}
    </div>
  );
}

function PageButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-1.5 text-xs font-medium tabular-nums transition",
        active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-white hover:shadow-sm",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {children}
    </button>
  );
}

type RowHandlers = {
  publish: (p: SocialPost) => void;
  schedule: (p: SocialPost) => void;
  unschedule: (p: SocialPost) => void;
  retry: (p: SocialPost) => void;
  remove: (p: SocialPost) => void;
};

function PostRow({
  post: p,
  names,
  selected,
  onToggle,
  actions,
}: {
  post: SocialPost;
  names: AccountNames;
  selected: boolean;
  onToggle: (shift: boolean) => void;
  actions: RowHandlers;
}) {
  const thumb = p.media[0];
  const href = `/marketing/social/${p.id}`;
  const title = p.title?.trim() || p.caption.trim().split("\n")[0] || "";
  // The caption is the post's description — skip it when it's already standing in as the title.
  const description = p.title?.trim() ? p.caption.trim().replace(/\s+/g, " ") : "";
  const out = p.status === "published" || p.status === "partial";
  const when = out ? p.published_at : p.scheduled_at;
  const whenLabel = out ? "Posted" : p.status === "draft" ? "Planned" : p.status === "failed" ? "Was due" : "Posts";

  return (
    <tr
      className={clsx(
        "border-b border-gray-100 align-middle transition-colors last:border-0",
        selected ? "bg-blue-50/70" : "even:bg-gray-50/80 hover:bg-gray-100/60",
      )}
    >
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => onToggle(e.shiftKey)}
          onChange={() => {}}
          className="h-4 w-4 rounded border-gray-300"
          aria-label={`Select ${title || "post"}`}
        />
      </td>

      {/* Post: thumbnail, title, description */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <Link href={href} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200">
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
          </Link>
          <div className="min-w-0 max-w-md">
            <Link href={href} className="block truncate font-semibold text-gray-900 hover:text-blue-700 hover:underline">
              {title || <span className="font-normal text-gray-400">Untitled post</span>}
            </Link>
            {description && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{description}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              <BrandPill brand={p.brand} />
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium capitalize text-gray-600">{p.post_type}</span>
              {p.design?.grid && (
                <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700" title="Part of a grid set">
                  <LayoutGrid size={10} />
                  {p.design.grid.story} · {p.design.grid.slot}/{p.design.grid.size}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      <td className="px-3 py-3">
        <SocialStatusPill status={p.status} />
        {p.last_error && (p.status === "failed" || p.status === "partial") && (
          <p className="mt-1 max-w-[180px] line-clamp-2 text-[11px] text-red-600" title={p.last_error}>
            {p.last_error}
          </p>
        )}
      </td>

      {/* Accounts: exactly where it went (or is going), with a link to each live post. */}
      <td className="px-3 py-3">
        <ul className="space-y-1.5">
          {p.platforms.map((pl) => {
            const r = p.results[pl];
            const url = liveUrl(p, pl);
            const name = names[p.brand]?.[pl] ?? `${p.brand} ${PLATFORM_LABEL[pl]}`;
            return (
              <li key={pl} className="flex items-center gap-1.5 text-xs">
                <PlatformLogo platform={pl} size={14} muted={r?.status !== "published"} />
                <span className={clsx("truncate", r?.status === "published" ? "font-medium text-gray-900" : "text-gray-500")}>
                  {name}
                </span>
                {r?.status === "published" ? (
                  url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-0.5 font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      View post <ExternalLink size={10} />
                    </a>
                  ) : (
                    <span className="shrink-0 font-medium text-green-700">Posted</span>
                  )
                ) : r?.status === "failed" ? (
                  <span className="shrink-0 font-medium text-red-600" title={r.error}>
                    Failed
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </td>

      <td className="whitespace-nowrap px-3 py-3 text-xs">
        {when ? (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{whenLabel}</div>
            <div className="text-gray-800">{formatDateTime(when)}</div>
            <div className="text-[11px] text-gray-400">{relativeTime(when)}</div>
          </>
        ) : (
          <span className="text-gray-400">No date</span>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <RowActions post={p} href={href} actions={actions} />
        </div>
      </td>
    </tr>
  );
}

/** Every action that applies to this post's state: the main one labelled, the rest as icons. */
function RowActions({ post: p, href, actions }: { post: SocialPost; href: string; actions: RowHandlers }) {
  if (p.status === "publishing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-sky-700">
        <Loader2 size={13} className="animate-spin" /> Publishing…
      </span>
    );
  }
  const notOut = p.status === "draft" || p.status === "scheduled" || p.status === "failed";
  const firstLive = p.platforms.map((pl) => liveUrl(p, pl)).find(Boolean);

  return (
    <>
      {p.status === "failed" || p.status === "partial" ? (
        <PrimaryAction icon={<RotateCcw size={13} />} onClick={() => actions.retry(p)}>
          Retry
        </PrimaryAction>
      ) : notOut ? (
        <PrimaryAction icon={<Send size={13} />} onClick={() => actions.publish(p)}>
          Post now
        </PrimaryAction>
      ) : firstLive ? (
        <a
          href={firstLive}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <ExternalLink size={13} /> View post
        </a>
      ) : null}

      <IconAction label="Edit" href={href}>
        <Pencil size={14} />
      </IconAction>
      {notOut && (
        <IconAction label={p.status === "scheduled" ? "Reschedule" : "Schedule"} onClick={() => actions.schedule(p)}>
          <CalendarClock size={14} />
        </IconAction>
      )}
      {p.status === "scheduled" && (
        <IconAction label="Move to drafts" onClick={() => actions.unschedule(p)}>
          <Undo2 size={14} />
        </IconAction>
      )}
      {p.status === "failed" && (
        <IconAction label="Post now" onClick={() => actions.publish(p)}>
          <Send size={14} />
        </IconAction>
      )}
      <IconAction label="Delete" danger onClick={() => actions.remove(p)}>
        <Trash2 size={14} />
      </IconAction>
    </>
  );
}

function PrimaryAction({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-gray-800"
    >
      {icon}
      {children}
    </button>
  );
}

function IconAction({
  label,
  href,
  onClick,
  danger,
  children,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const cls = clsx(
    "flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition",
    danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-gray-200/70 hover:text-gray-900",
  );
  return href ? (
    <Link href={href} className={cls} title={label} aria-label={label}>
      {children}
    </Link>
  ) : (
    <button onClick={onClick} className={cls} title={label} aria-label={label}>
      {children}
    </button>
  );
}
