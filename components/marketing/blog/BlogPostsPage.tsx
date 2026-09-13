"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Newspaper, Plus } from "lucide-react";
import clsx from "clsx";
import PageHeader from "@/components/ui/PageHeader";
import TabNav, { type Tab } from "@/components/ui/TabNav";
import { useBrand } from "@/components/BrandContext";
import { DRAFT_STATUSES, type BlogBrand, type BlogPostSummary } from "@/lib/blogPosts";
import { createPost, listPosts } from "./api";
import { BrandPill, StatusPill, formatDateTime, relativeTime } from "./bits";

/**
 * Blog Posts — the calendar.
 *
 * Posts are written here, given a date, and go live on their brand's site by
 * themselves when the date passes. This page is the queue: what's coming up,
 * what's still being written, what's already out. Opening a post goes to the
 * editor; the global brand switch in the top bar scopes the list.
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

export default function BlogPostsPage() {
  const router = useRouter();
  const { brand } = useBrand();
  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket>("upcoming");
  const [creating, setCreating] = useState(false);

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

  async function handleNew() {
    setCreating(true);
    try {
      const target: BlogBrand = brand === "NI" ? "NI" : "Sassy";
      const post = await createPost(target);
      router.push(`/marketing/blog/${post.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the post.");
      setCreating(false);
    }
  }

  const tabs = TABS.map((t) => ({ ...t, label: `${t.label} · ${counts[t.value]}` }));

  return (
    <div className="w-full space-y-6 p-6 md:px-8">
      <PageHeader subtitle="Write posts here, give each a date, and it goes live on the storefront by itself. The site picks up a post within about five minutes of its scheduled time.">
        <button
          onClick={handleNew}
          disabled={creating}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-60"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          New post{brand === "NI" ? " (NI)" : brand === "Sassy" ? " (Sassy)" : ""}
        </button>
      </PageHeader>

      {hint && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {hint}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <TabNav tabs={tabs} active={bucket} onChange={setBucket} />

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
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
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
              {rows.map((p) => {
                const when =
                  bucket === "published" ? (p.published_at ?? p.created_at) : p.publish_at;
                return (
                  <tr key={p.id} className="hover:bg-gray-50/70">
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
    </div>
  );
}
