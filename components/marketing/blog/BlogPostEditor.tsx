"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  Code,
  ExternalLink,
  Eye,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import clsx from "clsx";
import {
  BLOG_BRANDS,
  STORE_ORIGIN,
  resolveHeroUrl,
  slugify,
  type BlogBrand,
  type BlogPostRow,
} from "@/lib/blogPosts";
import { deletePost, getPost, updatePost, uploadHeroImage, type PostPatch } from "./api";
import RichTextEditor from "./RichTextEditor";
import StorefrontPreview from "./StorefrontPreview";
import { BrandPill, StatusPill, formatDateTime, isoToLocalInput, localInputToIso, relativeTime } from "./bits";

/**
 * The post editor. One page per post: the writing surface on the left, the
 * publishing controls on the right.
 *
 * Saving and publishing are separate on purpose. Save writes the fields and
 * changes nothing about whether the post is on the site. The status buttons
 * (Schedule, Publish now, Back to draft, Archive) save the fields AND move
 * the post — so what you see is always what goes live.
 */

type Mode = "edit" | "html" | "preview";

export default function BlogPostEditor({ id }: { id: string }) {
  const router = useRouter();
  const [post, setPost] = useState<BlogPostRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("edit");

  // Fields
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [body, setBody] = useState("");
  const [seoMeta, setSeoMeta] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [hero, setHero] = useState("");
  const [brand, setBrand] = useState<BlogBrand>("Sassy");
  const [publishAtLocal, setPublishAtLocal] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const seed = useCallback((p: BlogPostRow) => {
    setPost(p);
    setTitle(p.title ?? "");
    setSlug(p.slug ?? "");
    setSlugTouched(Boolean(p.slug));
    setBody(p.body ?? "");
    setSeoMeta(p.seo_meta ?? "");
    setTags(p.tags ?? []);
    setHero(p.hero_image_url ?? "");
    setBrand(p.brand);
    setPublishAtLocal(isoToLocalInput(p.publish_at));
    setDirty(false);
  }, []);

  useEffect(() => {
    let alive = true;
    getPost(id)
      .then((p) => {
        if (alive) seed(p);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't load the post."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, seed]);

  // The slug follows the title until someone edits it by hand.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title));
  }, [title, slugTouched]);

  function mark<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
      setNotice(null);
    };
  }

  function currentPatch(): PostPatch {
    return {
      title: title.trim() || "Untitled post",
      slug: slugify(slug) || slugify(title),
      body,
      seo_meta: seoMeta.trim() || null,
      tags,
      hero_image_url: hero.trim(),
      brand,
      publish_at: localInputToIso(publishAtLocal),
    };
  }

  async function commit(label: string, extra: PostPatch = {}, done?: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const updated = await updatePost(id, { ...currentPatch(), ...extra });
      seed(updated);
      setNotice(done ?? "Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!busy) void commit("save");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, slug, body, seoMeta, tags, hero, brand, publishAtLocal, busy]);

  async function handleUpload(file: File) {
    setBusy("upload");
    setError(null);
    try {
      const url = await uploadHeroImage(file);
      setHero(url);
      setDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete() {
    setBusy("delete");
    try {
      await deletePost(id);
      router.push("/marketing/blog");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete.");
      setBusy(null);
    }
  }

  function addTagFromInput() {
    const t = tagInput.trim().replace(/,+$/, "");
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTags([...tags, t]);
      setDirty(true);
    }
    setTagInput("");
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-24 text-sm text-gray-400">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }
  if (!post) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-sm text-gray-500">{error ?? "Post not found."}</p>
        <Link href="/marketing/blog" className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-800">
          ← Blog Posts
        </Link>
      </div>
    );
  }

  const status = post.status;
  const isLive = status === "published";
  const isScheduled = status === "scheduled";
  const publishAtIso = localInputToIso(publishAtLocal);
  const liveUrl = `${STORE_ORIGIN[brand]}/blog/${slugify(slug) || slugify(title)}`;
  const heroPreview = resolveHeroUrl(brand, hero);

  return (
    <div className="min-h-screen bg-white">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 bg-white/90 px-4 py-2.5 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/marketing/blog"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition hover:text-gray-800"
          >
            <ArrowLeft size={14} />
            Blog Posts
          </Link>
          <span className="h-4 w-px bg-gray-200" />
          <BrandPill brand={brand} />
          <StatusPill status={status} />
          {dirty ? (
            <span className="text-[11px] text-amber-600">Unsaved changes</span>
          ) : notice ? (
            <span className="text-[11px] text-emerald-600">{notice}</span>
          ) : (
            <span className="text-[11px] text-gray-400">Saved {relativeTime(post.updated_at)}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-gray-100 p-0.5">
            {(
              [
                ["edit", <Pencil key="e" size={12} />, "Edit"],
                ["html", <Code key="h" size={12} />, "HTML"],
                ["preview", <Eye key="p" size={12} />, "Preview"],
              ] as const
            ).map(([m, icon, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                  mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => commit("save")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800 disabled:opacity-60"
          >
            {busy === "save" ? <Loader2 size={13} className="animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:mx-8">
          {error}
        </div>
      )}

      {mode === "preview" ? (
        <div className="border-b border-gray-100 bg-gray-50/60">
          <p className="px-4 pt-3 text-center text-[11px] text-gray-400 md:px-8">
            How it renders on {STORE_ORIGIN[brand].replace("https://", "")}
          </p>
          <StorefrontPreview
            brand={brand}
            title={title}
            body={body}
            tags={tags}
            heroImageUrl={hero}
            date={publishAtIso ?? post.published_at}
          />
        </div>
      ) : (
        <div className="grid gap-8 px-4 py-6 md:grid-cols-[minmax(0,1fr)_320px] md:px-8">
          {/* Writing surface */}
          <div className="min-w-0 space-y-4">
            <input
              value={title}
              onChange={(e) => mark(setTitle)(e.target.value)}
              placeholder="Post title"
              className="w-full border-0 bg-transparent px-0 text-3xl font-semibold tracking-tight text-gray-900 outline-none placeholder:text-gray-300"
            />
            {mode === "html" ? (
              <textarea
                value={body}
                onChange={(e) => mark(setBody)(e.target.value)}
                spellCheck={false}
                className="min-h-[60vh] w-full rounded-lg border border-gray-200 p-4 font-mono text-[13px] leading-relaxed text-gray-800 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
              />
            ) : (
              <RichTextEditor value={body} onChange={mark(setBody)} placeholder="Start writing…" />
            )}
            <p className="text-[11px] text-gray-400">
              Headings, lists, links, bold, italic, and quotes carry through to the site. Anything else
              (scripts, embeds, inline styles) is stripped when the storefront renders the post.
            </p>
          </div>

          {/* Publishing rail */}
          <aside className="space-y-5 md:sticky md:top-16 md:self-start">
            {/* Status + schedule */}
            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Publishing</h3>
              <p className="mt-2 text-sm text-gray-700">
                {isLive
                  ? `Live since ${formatDateTime(post.published_at ?? post.created_at)}.`
                  : isScheduled && post.publish_at
                    ? `Goes live ${formatDateTime(post.publish_at)} (${relativeTime(post.publish_at)}).`
                    : "Not on the site. Set a date and schedule it, or publish now."}
              </p>

              <label className="mt-4 block text-[11px] font-medium text-gray-500">
                Publish date &amp; time
                <input
                  type="datetime-local"
                  value={publishAtLocal}
                  onChange={(e) => mark(setPublishAtLocal)(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
                />
                <span className="mt-1 block text-[11px] font-normal text-gray-400">
                  Your local time. The site shows the post within about five minutes of this.
                </span>
              </label>

              <div className="mt-4 grid gap-2">
                {!isLive && (
                  <button
                    onClick={() =>
                      commit("schedule", { status: "scheduled" }, "Scheduled.")
                    }
                    disabled={busy !== null || !publishAtIso}
                    title={!publishAtIso ? "Pick a publish date first" : undefined}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy === "schedule" ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
                    {isScheduled ? "Update schedule" : "Schedule"}
                  </button>
                )}
                {!isLive && (
                  <button
                    onClick={() => commit("publish", { status: "published" }, "Published.")}
                    disabled={busy !== null}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    Publish now
                  </button>
                )}
                {(isLive || isScheduled) && (
                  <button
                    onClick={() =>
                      commit(
                        "unpublish",
                        { status: "draft" },
                        isLive ? "Taken off the site." : "Unscheduled.",
                      )
                    }
                    disabled={busy !== null}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    {isLive ? "Take off the site" : "Unschedule"}
                  </button>
                )}
                {status !== "archived" && (
                  <button
                    onClick={() => commit("archive", { status: "archived" }, "Archived.")}
                    disabled={busy !== null}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 disabled:opacity-50"
                  >
                    Archive
                  </button>
                )}
              </div>

              {isLive && (
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  View on site <ExternalLink size={12} />
                </a>
              )}
            </section>

            {/* Brand + slug */}
            <section className="space-y-3 rounded-xl border border-gray-200 p-4">
              <label className="block text-[11px] font-medium text-gray-500">
                Brand
                <select
                  value={brand}
                  onChange={(e) => mark(setBrand)(e.target.value as BlogBrand)}
                  disabled={isLive}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:border-gray-300 disabled:bg-gray-50"
                >
                  {BLOG_BRANDS.map((b) => (
                    <option key={b} value={b}>
                      {b === "NI" ? "Natural Inspirations" : "Sassy"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] font-medium text-gray-500">
                URL
                <div className="mt-1 flex items-center rounded-lg border border-gray-200 focus-within:border-gray-300 focus-within:ring-2 focus-within:ring-gray-900/10">
                  <span className="pl-2.5 text-xs text-gray-400">/blog/</span>
                  <input
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      mark(setSlug)(e.target.value);
                    }}
                    onBlur={() => setSlug(slugify(slug))}
                    className="w-full bg-transparent px-1 py-1.5 text-sm text-gray-800 outline-none"
                  />
                </div>
                {isLive ? (
                  <span className="mt-1 block text-[11px] font-normal text-amber-600">
                    Changing this on a live post changes its link.
                  </span>
                ) : null}
              </label>
            </section>

            {/* Tags */}
            <section className="rounded-xl border border-gray-200 p-4">
              <label className="block text-[11px] font-medium text-gray-500">
                Tags
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                    >
                      {t}
                      <button
                        onClick={() => mark(setTags)(tags.filter((x) => x !== t))}
                        className="text-gray-400 hover:text-gray-700"
                        aria-label={`Remove ${t}`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTagFromInput();
                    }
                  }}
                  onBlur={addTagFromInput}
                  placeholder="Add a tag, press Enter"
                  className="mt-2 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
                />
                {brand === "NI" ? (
                  <span className="mt-1 block text-[11px] font-normal text-gray-400">
                    On NI the first tag is the journal category: Ingredient stories, Rituals, New arrivals, or The philosophy.
                  </span>
                ) : null}
              </label>
            </section>

            {/* SEO */}
            <section className="rounded-xl border border-gray-200 p-4">
              <label className="block text-[11px] font-medium text-gray-500">
                Search description
                <textarea
                  value={seoMeta}
                  onChange={(e) => mark(setSeoMeta)(e.target.value)}
                  rows={3}
                  placeholder="One or two sentences for Google and the blog index card."
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
                />
                <span
                  className={clsx(
                    "mt-1 block text-[11px] font-normal",
                    seoMeta.length > 160 ? "text-amber-600" : "text-gray-400",
                  )}
                >
                  {seoMeta.length} characters · 120–155 is the sweet spot
                </span>
              </label>
            </section>

            {/* Hero */}
            <section className="rounded-xl border border-gray-200 p-4">
              <label className="block text-[11px] font-medium text-gray-500">
                Hero image
                <input
                  value={hero}
                  onChange={(e) => mark(setHero)(e.target.value)}
                  placeholder="https://… or a site path like /queen/Queen_Header.jpg"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
                />
              </label>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === "upload" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  Upload
                </button>
                {hero ? (
                  <button
                    onClick={() => mark(setHero)("")}
                    className="text-xs text-gray-400 hover:text-gray-700"
                  >
                    Remove
                  </button>
                ) : null}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                  }}
                />
              </div>
              {heroPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroPreview}
                  alt=""
                  className="mt-3 aspect-[16/9] w-full rounded-lg border border-gray-100 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
            </section>

            {/* Delete */}
            <section className="px-1">
              {confirmDelete ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600">Delete this post?</span>
                  <button
                    onClick={handleDelete}
                    disabled={busy !== null}
                    className="rounded-md bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy === "delete" ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="text-gray-500 hover:text-gray-800">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-600"
                >
                  <Trash2 size={12} /> Delete post
                </button>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
