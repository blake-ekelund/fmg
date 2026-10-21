"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  CalendarClock,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageIcon,
  Loader2,
  Newspaper,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import PageMeta from "@/components/PageMeta";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useBrand } from "@/components/BrandContext";
import { toast, updateToast } from "@/lib/toast";
import {
  DRAFT_STATUSES,
  STORE_ORIGIN,
  resolveHeroUrl,
  slugify,
  type BlogBrand,
  type BlogPostSummary,
  type BlogStatus,
} from "@/lib/blogPosts";
import { deletePost, listPosts, updatePost } from "./api";
import NewBlogWizard from "./NewBlogWizard";
import BulkScheduleDialog from "@/components/ui/BulkScheduleDialog";
import { BrandPill, StatusPill, formatDateTime, relativeTime } from "./bits";

/**
 * Blog Posts — the calendar.
 *
 * Posts are written here, given a date, and go live on their brand's site by
 * themselves when the date passes. This page is the queue: what's coming up,
 * what's still being written, what's already out. The global brand switch in
 * the top bar scopes the list.
 *
 * Layout matches Social: toolbar (status filter + New post) → banded table,
 * 25 a page, with every per-post action on its row. Rows can also be ticked
 * (shift-click for a range) to act on several at once.
 */

type Bucket = "all" | "upcoming" | "drafts" | "published" | "archived";

const PAGE_SIZE = 25;

const FILTERS: { value: Bucket; label: string; dot: string }[] = [
  { value: "all", label: "All", dot: "bg-gray-400" },
  { value: "upcoming", label: "Scheduled", dot: "bg-emerald-500" },
  { value: "drafts", label: "Drafts", dot: "bg-amber-400" },
  { value: "published", label: "Published", dot: "bg-green-600" },
  { value: "archived", label: "Archived", dot: "bg-gray-300" },
];

function bucketOf(p: BlogPostSummary): Exclude<Bucket, "all"> {
  if (p.status === "scheduled") return "upcoming";
  if (p.status === "published") return "published";
  if (DRAFT_STATUSES.includes(p.status)) return "drafts";
  // archived + the old AI generator's unreviewed drafts
  return "archived";
}

const EMPTY_COPY: Record<Bucket, string> = {
  all: "No posts yet. Start one with New post.",
  upcoming: "Nothing queued. Open a draft, set a publish date, and click Schedule — it goes live on its own.",
  drafts: "No drafts. Start one with New post.",
  published: "Nothing has gone live yet.",
  archived: "Nothing archived.",
};

type Action = "schedule" | "publish" | "unschedule" | "archive" | "restore" | "delete";

const isDraft = (p: BlogPostSummary) => DRAFT_STATUSES.includes(p.status);
const liveUrl = (p: BlogPostSummary) =>
  p.status === "published" ? `${STORE_ORIGIN[p.brand]}/blog/${p.slug || slugify(p.title ?? "")}` : null;

/** Run `fn` over items, a few at a time. Returns the ones that failed. */
async function runAll<T>(items: T[], fn: (t: T) => Promise<unknown>): Promise<{ item: T; error: string }[]> {
  const failed: { item: T; error: string }[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (e) {
        failed.push({ item, error: e instanceof Error ? e.message : String(e) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
  return failed;
}

export default function BlogPostsPage() {
  const router = useRouter();
  const { brand } = useBrand();
  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket>("all");
  const [page, setPage] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const lastClicked = useRef<number | null>(null);
  // A dialog's target: one post from its row, or the eligible part of the selection.
  const [pending, setPending] = useState<{ action: Action; list: BlogPostSummary[] } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await listPosts("all");
      setPosts(res.posts);
      setHint(res.notReady ? (res.hint ?? "Blog tables aren't ready yet.") : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load posts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scoped = useMemo(() => (brand === "all" ? posts : posts.filter((p) => p.brand === brand)), [posts, brand]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { all: scoped.length, upcoming: 0, drafts: 0, published: 0, archived: 0 };
    for (const p of scoped) c[bucketOf(p)] += 1;
    return c;
  }, [scoped]);

  const rows = useMemo(() => {
    const list = bucket === "all" ? [...scoped] : scoped.filter((p) => bucketOf(p) === bucket);
    if (bucket === "upcoming") return list.sort((a, b) => (a.publish_at ?? "").localeCompare(b.publish_at ?? ""));
    if (bucket === "published") {
      return list.sort((a, b) => (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at));
    }
    if (bucket === "drafts") {
      // Calendar order: dated drafts by their planned date, undated ones after.
      return list.sort((a, b) => {
        if (a.publish_at && b.publish_at) return a.publish_at.localeCompare(b.publish_at);
        if (a.publish_at) return -1;
        if (b.publish_at) return 1;
        return b.updated_at.localeCompare(a.updated_at);
      });
    }
    return list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [scoped, bucket]);

  useEffect(() => setPage(0), [bucket, brand]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // Only rows in the current filter count as selected (switching filter or brand drops the rest).
  const selected = useMemo(() => rows.filter((p) => picked.has(p.id)), [rows, picked]);
  const canSchedule = selected.filter((p) => isDraft(p) || p.status === "scheduled");
  const canUnschedule = selected.filter((p) => p.status === "scheduled");
  const canArchive = selected.filter((p) => p.status !== "archived" && p.status !== "generating");
  const canRestore = selected.filter((p) => bucketOf(p) === "archived");
  const pagePicked = pageRows.filter((p) => picked.has(p.id)).length;
  const allPagePicked = pageRows.length > 0 && pagePicked === pageRows.length;

  function toggle(i: number, shift: boolean) {
    const id = pageRows[i].id;
    setPicked((cur) => {
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
    setPicked((cur) => {
      const next = new Set(cur);
      for (const p of pageRows) {
        if (allPagePicked) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
    lastClicked.current = null;
  }

  /** Apply one change to a list of posts in the background, with a progress toast. */
  function run(list: BlogPostSummary[], verb: { doing: string; done: string }, fn: (p: BlogPostSummary, i: number) => Promise<unknown>) {
    setPending(null);
    if (!list.length) return;
    const noun = (n: number) => `${n} ${n === 1 ? "post" : "posts"}`;
    const t = toast({ tone: "working", title: `${verb.doing} ${noun(list.length)}…` });
    void (async () => {
      const failed = await runAll(
        list.map((p, i) => ({ p, i })),
        ({ p, i }) => fn(p, i),
      );
      // Failures stay ticked so they can be tried again.
      setPicked(new Set(failed.map((f) => f.item.p.id)));
      await load();
      updateToast(
        t,
        failed.length
          ? {
              tone: "error",
              sticky: true,
              title: `${list.length - failed.length} of ${list.length} ${verb.done}`,
              body: failed
                .slice(0, 3)
                .map((f) => `“${f.item.p.title || "Untitled"}” — ${f.error}`)
                .join(" · "),
            }
          : { tone: "success", sticky: false, title: `${noun(list.length)} ${verb.done}` },
      );
    })();
  }

  const setStatus = (status: BlogStatus) => (p: BlogPostSummary) => updatePost(p.id, { status });
  const ask = (action: Action, list: BlogPostSummary[]) => setPending({ action, list });
  const target = pending?.list ?? [];
  const plural = `${target.length} post${target.length === 1 ? "" : "s"}`;
  const anyLive = target.some((p) => p.status === "published");

  return (
    <div className="w-full space-y-4 p-6 md:px-8">
      <PageMeta
        title="Blog Posts"
        description="Write posts and give each a date; they go live on the storefront by themselves."
      />

      {wizardOpen && (
        <NewBlogWizard
          open
          defaultBrand={(brand === "NI" ? "NI" : "Sassy") as BlogBrand}
          onClose={() => setWizardOpen(false)}
          onCreated={(post) => router.push(`/marketing/blog/${post.id}`)}
          onBackgroundCreated={() => void load()}
        />
      )}

      {hint && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{hint}</div>}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Toolbar: what you're looking at (left), what you can make (right). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {FILTERS.map((f) => {
            const active = bucket === f.value;
            return (
              <button
                key={f.value}
                onClick={() => {
                  setBucket(f.value);
                  setPicked(new Set());
                }}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  active ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                )}
              >
                {f.value !== "all" && <span className={clsx("h-2 w-2 rounded-full", f.dot)} />}
                {f.label}
                <span
                  className={clsx(
                    "min-w-[1.5rem] rounded-full px-1.5 py-px text-center text-[11px] font-semibold tabular-nums",
                    active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500",
                  )}
                >
                  {counts[f.value]}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setWizardOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
        >
          <Plus size={14} />
          New post
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Loading posts…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
          {bucket === "upcoming" ? (
            <CalendarClock size={24} className="mx-auto text-gray-300" />
          ) : (
            <Newspaper size={24} className="mx-auto text-gray-300" />
          )}
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-400">{EMPTY_COPY[bucket]}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={allPagePicked}
                      ref={(el) => {
                        if (el) el.indeterminate = pagePicked > 0 && !allPagePicked;
                      }}
                      onChange={togglePage}
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-gray-900"
                    />
                  </th>
                  <th className="px-3 py-2.5">Post</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Updated</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p, i) => (
                  <PostRow
                    key={p.id}
                    post={p}
                    selected={picked.has(p.id)}
                    onToggle={(shift) => toggle(i, shift)}
                    onAction={(a) => ask(a, [p])}
                    onRestore={() => run([p], { doing: "Restoring", done: "restored to drafts" }, setStatus("draft"))}
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

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-gray-900 px-4 py-2.5 text-sm text-white shadow-2xl">
            <span className="mr-2 font-medium tabular-nums">{selected.length} selected</span>
            {canSchedule.length > 0 && (
              <BarButton icon={<CalendarClock size={14} />} onClick={() => ask("schedule", canSchedule)}>
                {canSchedule.some((p) => p.status === "scheduled") ? "Reschedule…" : "Schedule…"}
              </BarButton>
            )}
            {canUnschedule.length > 0 && (
              <BarButton icon={<CalendarX size={14} />} onClick={() => ask("unschedule", canUnschedule)}>
                Unschedule
              </BarButton>
            )}
            {canRestore.length > 0 && (
              <BarButton icon={<RotateCcw size={14} />} onClick={() => ask("restore", canRestore)}>
                Restore to drafts
              </BarButton>
            )}
            {canArchive.length > 0 && (
              <BarButton icon={<Archive size={14} />} onClick={() => ask("archive", canArchive)}>
                Archive
              </BarButton>
            )}
            <BarButton icon={<Trash2 size={14} />} danger onClick={() => ask("delete", selected)}>
              Delete
            </BarButton>
            <button
              onClick={() => setPicked(new Set())}
              className="ml-1 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Clear selection"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {pending?.action === "schedule" && (
        <BulkScheduleDialog
          posts={target.map((p) => ({ id: p.id, title: p.title, scheduled: p.status === "scheduled" }))}
          busy={false}
          onCancel={() => setPending(null)}
          onConfirm={(times) =>
            run(target, { doing: "Scheduling", done: "scheduled" }, (p, i) =>
              updatePost(p.id, { status: "scheduled", publish_at: times[i] }),
            )
          }
        />
      )}
      <ConfirmDialog
        open={pending?.action === "publish"}
        title="Publish this now?"
        confirmLabel="Publish now"
        onCancel={() => setPending(null)}
        onConfirm={() => run(target, { doing: "Publishing", done: "published" }, setStatus("published"))}
      >
        {target[0] && (
          <>
            It goes live on {STORE_ORIGIN[target[0].brand].replace("https://", "")} right away.
          </>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={pending?.action === "unschedule"}
        title={`Unschedule ${plural}?`}
        confirmLabel="Unschedule"
        onCancel={() => setPending(null)}
        onConfirm={() => run(target, { doing: "Unscheduling", done: "unscheduled" }, setStatus("draft"))}
      >
        They move back to Drafts and won&apos;t go live until they&apos;re scheduled again. Their planned dates are kept.
      </ConfirmDialog>
      <ConfirmDialog
        open={pending?.action === "archive"}
        title={`Archive ${plural}?`}
        confirmLabel="Archive"
        onCancel={() => setPending(null)}
        onConfirm={() => run(target, { doing: "Archiving", done: "archived" }, setStatus("archived"))}
      >
        {anyLive
          ? "Live posts come off the website. Everything moves to Archived; you can restore it later."
          : "They move to Archived and won't go live. You can restore them later."}
      </ConfirmDialog>
      <ConfirmDialog
        open={pending?.action === "restore"}
        title={`Restore ${plural} to drafts?`}
        confirmLabel="Restore"
        onCancel={() => setPending(null)}
        onConfirm={() => run(target, { doing: "Restoring", done: "restored to drafts" }, setStatus("draft"))}
      >
        They move back to Drafts. Nothing goes live until you schedule or publish them.
      </ConfirmDialog>
      <ConfirmDialog
        open={pending?.action === "delete"}
        title={`Delete ${plural}?`}
        confirmLabel={`Delete ${plural}`}
        tone="danger"
        onCancel={() => setPending(null)}
        onConfirm={() => run(target, { doing: "Deleting", done: "deleted" }, (p) => deletePost(p.id))}
      >
        {anyLive ? "Live posts come off the website and are deleted. " : ""}
        This can&apos;t be undone from here.
      </ConfirmDialog>
    </div>
  );
}

function PostRow({
  post: p,
  selected,
  onToggle,
  onAction,
  onRestore,
}: {
  post: BlogPostSummary;
  selected: boolean;
  onToggle: (shift: boolean) => void;
  onAction: (a: Action) => void;
  onRestore: () => void;
}) {
  const href = `/marketing/blog/${p.id}`;
  const hero = resolveHeroUrl(p.brand, p.hero_image_url);
  const live = liveUrl(p);
  const when = p.status === "published" ? (p.published_at ?? p.created_at) : p.publish_at;
  const whenLabel = p.status === "published" ? "Went live" : p.status === "scheduled" ? "Goes live" : "Planned for";

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
          aria-label={`Select ${p.title || "post"}`}
          checked={selected}
          onChange={() => {}}
          onClick={(e) => onToggle(e.shiftKey)}
          className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-gray-900"
        />
      </td>

      {/* Post: hero, title, description, brand + tags */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <Link href={href} className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200">
            {hero ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <ImageIcon size={18} className="text-gray-300" />
            )}
          </Link>
          <div className="min-w-0 max-w-lg">
            <Link href={href} className="block truncate font-semibold text-gray-900 hover:text-blue-700 hover:underline">
              {p.title || <span className="font-normal text-gray-400">Untitled post</span>}
            </Link>
            {p.seo_meta && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{p.seo_meta}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              <BrandPill brand={p.brand} />
              {(p.tags ?? []).slice(0, 3).map((t) => (
                <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                  {t}
                </span>
              ))}
              {(p.tags?.length ?? 0) > 3 && <span className="text-gray-400">+{p.tags!.length - 3}</span>}
            </div>
          </div>
        </div>
      </td>

      <td className="px-3 py-3">
        <StatusPill status={p.status} />
      </td>

      <td className="whitespace-nowrap px-3 py-3 text-xs">
        {when ? (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{whenLabel}</div>
            <div className="text-gray-800">{formatDateTime(when)}</div>
            <div className={clsx("text-[11px]", p.status === "scheduled" ? "text-emerald-600" : "text-gray-400")}>
              {relativeTime(when)}
            </div>
          </>
        ) : (
          <span className="text-gray-400">No date</span>
        )}
      </td>

      <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-500">{relativeTime(p.updated_at)}</td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {p.status === "generating" ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 size={13} className="animate-spin" /> Writing…
            </span>
          ) : (
            <>
              {live ? (
                <a
                  href={live}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
                >
                  <ExternalLink size={13} /> View on site
                </a>
              ) : bucketOf(p) === "archived" ? (
                <PrimaryAction icon={<RotateCcw size={13} />} onClick={onRestore}>
                  Restore
                </PrimaryAction>
              ) : (
                <PrimaryAction icon={<Send size={13} />} onClick={() => onAction("publish")}>
                  Publish now
                </PrimaryAction>
              )}
              <IconAction label="Edit" href={href}>
                <Pencil size={14} />
              </IconAction>
              {(isDraft(p) || p.status === "scheduled") && (
                <IconAction label={p.status === "scheduled" ? "Reschedule" : "Schedule"} onClick={() => onAction("schedule")}>
                  <CalendarClock size={14} />
                </IconAction>
              )}
              {p.status === "scheduled" && (
                <IconAction label="Unschedule" onClick={() => onAction("unschedule")}>
                  <CalendarX size={14} />
                </IconAction>
              )}
              {bucketOf(p) !== "archived" && (
                <IconAction label={p.status === "published" ? "Archive (takes it off the site)" : "Archive"} onClick={() => onAction("archive")}>
                  <Archive size={14} />
                </IconAction>
              )}
              <IconAction label="Delete" danger onClick={() => onAction("delete")}>
                <Trash2 size={14} />
              </IconAction>
            </>
          )}
        </div>
      </td>
    </tr>
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

function BarButton({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
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
