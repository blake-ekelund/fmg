"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CalendarClock, CalendarX, Loader2, Newspaper, Plus, RotateCcw, Trash2, X } from "lucide-react";
import clsx from "clsx";
import PageHeader from "@/components/ui/PageHeader";
import TabNav, { type Tab } from "@/components/ui/TabNav";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useBrand } from "@/components/BrandContext";
import { DRAFT_STATUSES, type BlogBrand, type BlogPostSummary, type BlogStatus } from "@/lib/blogPosts";
import { deletePost, listPosts, updatePost } from "./api";
import NewBlogWizard from "./NewBlogWizard";
import BulkScheduleDialog from "@/components/ui/BulkScheduleDialog";
import { BrandPill, StatusPill, formatDateTime, relativeTime } from "./bits";

/**
 * Blog Posts — the calendar.
 *
 * Posts are written here, given a date, and go live on their brand's site by
 * themselves when the date passes. This page is the queue: what's coming up,
 * what's still being written, what's already out. Opening a post goes to the
 * editor; the global brand switch in the top bar scopes the list.
 *
 * Rows can be ticked (shift-click for a range) to schedule / reschedule,
 * unschedule, archive, restore or delete several posts at once.
 */

type Bucket = "upcoming" | "drafts" | "published" | "archived";

const TABS: Tab<Bucket>[] = [
  { value: "upcoming", label: "Scheduled" },
  { value: "drafts", label: "Drafts" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

function bucketOf(p: BlogPostSummary): Bucket {
  if (p.status === "scheduled") return "upcoming";
  if (p.status === "published") return "published";
  if (DRAFT_STATUSES.includes(p.status)) return "drafts";
  // archived + the old AI generator's unreviewed drafts
  return "archived";
}

const EMPTY_COPY: Record<Bucket, string> = {
  upcoming:
    "Nothing queued. Open a draft, set a publish date, and click Schedule — it goes live on its own.",
  drafts: "No drafts. Start one with New post.",
  published: "Nothing has gone live yet.",
  archived: "Nothing archived.",
};

type BulkAction = "schedule" | "unschedule" | "archive" | "restore" | "delete";

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
  const [notice, setNotice] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket>("upcoming");
  const [wizardOpen, setWizardOpen] = useState(false);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const lastClicked = useRef<number | null>(null);
  const [pending, setPending] = useState<BulkAction | null>(null);
  const [busy, setBusy] = useState(false);

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

  const scoped = useMemo(
    () => (brand === "all" ? posts : posts.filter((p) => p.brand === brand)),
    [posts, brand],
  );

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { upcoming: 0, drafts: 0, published: 0, archived: 0 };
    for (const p of scoped) c[bucketOf(p)] += 1;
    return c;
  }, [scoped]);

  const rows = useMemo(() => {
    const list = scoped.filter((p) => bucketOf(p) === bucket);
    if (bucket === "upcoming") {
      return list.sort((a, b) => (a.publish_at ?? "").localeCompare(b.publish_at ?? ""));
    }
    if (bucket === "published") {
      return list.sort((a, b) =>
        (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at),
      );
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

  // Only rows on screen count as selected (switching tab or brand drops the rest).
  const selected = useMemo(() => rows.filter((p) => picked.has(p.id)), [rows, picked]);
  const allOn = rows.length > 0 && selected.length === rows.length;
  const someOn = selected.length > 0 && !allOn;

  function toggle(i: number, shift: boolean) {
    const id = rows[i].id;
    setPicked((cur) => {
      const next = new Set(cur);
      const on = !cur.has(id);
      if (shift && lastClicked.current !== null) {
        const [a, b] = [Math.min(lastClicked.current, i), Math.max(lastClicked.current, i)];
        for (let k = a; k <= b; k++) {
          if (on) next.add(rows[k].id);
          else next.delete(rows[k].id);
        }
      } else if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    lastClicked.current = i;
  }

  function toggleAll() {
    setPicked(allOn ? new Set() : new Set(rows.map((p) => p.id)));
    lastClicked.current = null;
  }

  async function bulk(label: string, fn: (p: BlogPostSummary, i: number) => Promise<unknown>) {
    const list = selected;
    setBusy(true);
    setError(null);
    setNotice(null);
    const indexed = list.map((p, i) => ({ p, i }));
    const failed = await runAll(indexed, ({ p, i }) => fn(p, i));
    setBusy(false);
    setPending(null);
    setPicked(new Set(failed.map((f) => f.item.p.id)));
    const ok = list.length - failed.length;
    if (ok) setNotice(`${label} ${ok} post${ok === 1 ? "" : "s"}.`);
    if (failed.length) {
      setError(
        `${failed.length} couldn't be changed (still selected): ` +
          failed.map((f) => `“${f.item.p.title || "Untitled"}” — ${f.error}`).join("; "),
      );
    }
    await load();
  }

  const setStatus = (status: BlogStatus) => (p: BlogPostSummary) => updatePost(p.id, { status });

  const tabs = TABS.map((t) => ({ ...t, label: `${t.label} · ${counts[t.value]}` }));
  const n = selected.length;
  const plural = `${n} post${n === 1 ? "" : "s"}`;

  return (
    <div className="w-full space-y-6 p-6 md:px-8">
      <PageHeader subtitle="Write posts here, give each a date, and it goes live on the storefront by itself. The site picks up a post within about five minutes of its scheduled time.">
        <button
          onClick={() => setWizardOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          <Plus size={14} />
          New post
        </button>
      </PageHeader>

      {wizardOpen && (
        <NewBlogWizard
          open
          defaultBrand={(brand === "NI" ? "NI" : "Sassy") as BlogBrand}
          onClose={() => setWizardOpen(false)}
          onCreated={(post) => router.push(`/marketing/blog/${post.id}`)}
        />
      )}

      {hint && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {hint}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
      {notice && !error && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      <TabNav tabs={tabs} active={bucket} onChange={setBucket} />

      {n > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-white shadow-lg">
          <span className="px-1 text-sm font-medium tabular-nums">{n} selected</span>
          <span className="h-4 w-px bg-white/20" />
          {bucket !== "published" && bucket !== "archived" && (
            <BarButton icon={<CalendarClock size={14} />} onClick={() => setPending("schedule")} disabled={busy}>
              {bucket === "upcoming" ? "Reschedule…" : "Schedule…"}
            </BarButton>
          )}
          {bucket === "upcoming" && (
            <BarButton icon={<CalendarX size={14} />} onClick={() => setPending("unschedule")} disabled={busy}>
              Unschedule
            </BarButton>
          )}
          {bucket === "archived" ? (
            <BarButton icon={<RotateCcw size={14} />} onClick={() => setPending("restore")} disabled={busy}>
              Restore to drafts
            </BarButton>
          ) : (
            <BarButton icon={<Archive size={14} />} onClick={() => setPending("archive")} disabled={busy}>
              Archive
            </BarButton>
          )}
          <BarButton icon={<Trash2 size={14} />} onClick={() => setPending("delete")} disabled={busy} danger>
            Delete
          </BarButton>
          {busy && <Loader2 size={16} className="animate-spin text-white/70" />}
          <button
            onClick={() => setPicked(new Set())}
            className="ml-auto rounded-lg px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
          >
            Clear
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Loading posts…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
          {bucket === "upcoming" ? (
            <CalendarClock size={24} className="mx-auto text-gray-300" />
          ) : (
            <Newspaper size={24} className="mx-auto text-gray-300" />
          )}
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-400">{EMPTY_COPY[bucket]}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="w-10 py-2.5 pl-4">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allOn}
                    ref={(el) => {
                      if (el) el.indeterminate = someOn;
                    }}
                    onChange={toggleAll}
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-gray-900"
                  />
                </th>
                <th className="px-4 py-2.5 font-medium">Post</th>
                <th className="px-4 py-2.5 font-medium">Brand</th>
                <th className="px-4 py-2.5 font-medium">
                  {bucket === "upcoming"
                    ? "Goes live"
                    : bucket === "published"
                      ? "Went live"
                      : "Planned for"}
                </th>
                <th className="px-4 py-2.5 font-medium">Tags</th>
                <th className="px-4 py-2.5 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((p, i) => {
                const when =
                  bucket === "published" ? (p.published_at ?? p.created_at) : p.publish_at;
                const on = picked.has(p.id);
                return (
                  <tr key={p.id} className={clsx(on ? "bg-gray-50" : "hover:bg-gray-50/70")}>
                    <td className="w-10 py-3 pl-4">
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.title || "post"}`}
                        checked={on}
                        onChange={() => {}}
                        onClick={(e) => toggle(i, e.shiftKey)}
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-gray-900"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/marketing/blog/${p.id}`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {p.title || "Untitled post"}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                        <StatusPill status={p.status} />
                        {p.slug ? <span className="truncate">/blog/{p.slug}</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <BrandPill brand={p.brand} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {when ? (
                        <>
                          <div>{formatDateTime(when)}</div>
                          <div
                            className={clsx(
                              "text-[11px]",
                              bucket === "upcoming" ? "text-emerald-600" : "text-gray-400",
                            )}
                          >
                            {relativeTime(when)}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-400">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(p.tags ?? []).slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-gray-500">
                      {relativeTime(p.updated_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pending === "schedule" && (
        <BulkScheduleDialog
          posts={selected.map((p) => ({ id: p.id, title: p.title, scheduled: p.status === "scheduled" }))}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={(times) =>
            void bulk(bucket === "upcoming" ? "Rescheduled" : "Scheduled", (p, i) =>
              updatePost(p.id, { status: "scheduled", publish_at: times[i] }),
            )
          }
        />
      )}
      <ConfirmDialog
        open={pending === "unschedule"}
        title={`Unschedule ${plural}?`}
        confirmLabel="Unschedule"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void bulk("Unscheduled", setStatus("draft"))}
      >
        They move back to Drafts and won&apos;t go live until they&apos;re scheduled again. Their planned dates are kept.
      </ConfirmDialog>
      <ConfirmDialog
        open={pending === "archive"}
        title={`Archive ${plural}?`}
        confirmLabel="Archive"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void bulk("Archived", setStatus("archived"))}
      >
        {bucket === "published"
          ? "They come off the website and move to Archived. You can restore them later."
          : bucket === "upcoming"
            ? "They won't go live, and move to Archived. You can restore them later."
            : "They move to Archived. You can restore them later."}
      </ConfirmDialog>
      <ConfirmDialog
        open={pending === "restore"}
        title={`Restore ${plural} to drafts?`}
        confirmLabel="Restore"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void bulk("Restored", setStatus("draft"))}
      >
        They move back to Drafts. Nothing goes live until you schedule or publish them.
      </ConfirmDialog>
      <ConfirmDialog
        open={pending === "delete"}
        title={`Delete ${plural}?`}
        confirmLabel={`Delete ${plural}`}
        tone="danger"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void bulk("Deleted", (p) => deletePost(p.id))}
      >
        {bucket === "published" ? "They come off the website and are deleted. " : ""}
        This can&apos;t be undone from here.
      </ConfirmDialog>
    </div>
  );
}

function BarButton({
  icon,
  children,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition disabled:opacity-40",
        danger ? "text-red-300 hover:bg-red-500/20 hover:text-red-200" : "text-white hover:bg-white/10",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
