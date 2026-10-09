"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Grid3x3,
  Images,
  Layers,
  Lightbulb,
  Loader2,
  Newspaper,
  RotateCcw,
  Sparkles,
  SquareDashed,
  Tag,
  X,
} from "lucide-react";
import clsx from "clsx";
import {
  GRID_ROWS,
  gridChapters,
  gridPosition,
  gridSchedule,
  gridSlots,
  type GridDraft,
  type GridPitch,
  type GridRows,
} from "@/lib/social/gridPlan";
import { blankCanvas } from "@/lib/social/canvas";
import { compileCaption, isCanvas, SLIDE_H, SLIDE_W } from "@/lib/social/design";
import type { SocialBrand, SocialPlatform, SocialPost } from "@/lib/social/types";
import {
  createSocialPost,
  generateGridSet,
  listBlogPostsForSocial,
  listSocialCollections,
  pitchGridThemes,
  updateSocialPost,
  uploadSocialImage,
  writeMosaicCaptions,
  type BlogOption,
  type CollectionOption,
} from "./api";
import MosaicCropper, { overviewJpeg, slicePicture, type Crop, type LoadedPicture } from "./MosaicCropper";
import SlidePreview from "./SlidePreview";

/**
 * Plan a grid set — 6, 9 or 12 Instagram posts (2, 3 or 4 whole rows) that
 * land as one finished block on the profile. Two kinds:
 *
 *   Story posts  — Claude writes every post at once, each with a job in the
 *                  story (lib/social/gridPlan.ts), about an idea, one of our
 *                  blog posts or a collection from the site.
 *   One picture  — a photo is split across the squares so the grid shows it
 *                  whole; Claude looks at it and writes the captions.
 *
 * The team sees the finished block as it will sit on the profile, saves the
 * posts as dated drafts and can schedule them all in one go.
 */

type Step = "setup" | "writing" | "review" | "saving" | "done";
type Kind = "story" | "picture";
type About = "idea" | "blog" | "collection";

const BRAND_NAME: Record<SocialBrand, string> = { NI: "Natural Inspirations", Sassy: "Sassy" };
const SIZE_COPY: Record<GridRows, { weeks: string; use: string }> = {
  2: { weeks: "About 1 week", use: "A quick moment — one product, a weekend" },
  3: { weeks: "About 2 weeks", use: "Your regular story" },
  4: { weeks: "About 2½ weeks", use: "Big moments — holiday gifting, a launch" },
};
/** One-picture sets posted "all at once" go out this far apart (in order). */
const BURST_MINUTES = 10;

const TILE = 150;
const TILE_H = Math.round((TILE * 4) / 3);

const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const shortDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const shortTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

type Props = {
  posts: SocialPost[];
  defaultBrand: SocialBrand;
  /** Brands whose Instagram is connected (posting actually works). */
  connected: Partial<Record<SocialBrand, boolean>>;
  onClose: () => void;
  /** Posts were created or scheduled — reload the list. */
  onChanged: () => void;
  onOpenPreview: (brand: SocialBrand) => void;
};

export default function GridPlanner({ posts, defaultBrand, connected, onClose, onChanged, onOpenPreview }: Props) {
  const [step, setStep] = useState<Step>("setup");
  const [kind, setKind] = useState<Kind>("story");
  const [brand, setBrand] = useState<SocialBrand>(defaultBrand);
  const [rows, setRows] = useState<GridRows>(3);
  const [about, setAbout] = useState<About>("idea");
  const [blogId, setBlogId] = useState<string | null>(null);
  const [collection, setCollection] = useState<string | null>(null);
  const [blogs, setBlogs] = useState<Partial<Record<SocialBrand, BlogOption[] | string>>>({});
  const [collections, setCollections] = useState<Partial<Record<SocialBrand, CollectionOption[] | string>>>({});
  const [theme, setTheme] = useState("");
  const [ideas, setIdeas] = useState<GridPitch["themes"] | null>(null);
  const [pitching, setPitching] = useState(false);
  const [picture, setPicture] = useState<LoadedPicture | null>(null);
  const [crop, setCrop] = useState<Crop>({ zoom: 1, cx: 0, cy: 0 });
  const [spread, setSpread] = useState(true);
  const [pieces, setPieces] = useState<Blob[]>([]);
  const [alsoFacebook, setAlsoFacebook] = useState(true);
  const [time, setTime] = useState("10:00");
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [draft, setDraft] = useState<GridDraft | null>(null);
  const [draftKind, setDraftKind] = useState<Kind>("story");
  const [selected, setSelected] = useState(0);
  const [created, setCreated] = useState<SocialPost[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const total = rows * 3;
  const busy = step === "writing" || step === "saving" || pitching || progress !== null;
  const source = {
    blogId: about === "blog" ? blogId : null,
    collection: about === "collection" ? collection : null,
  };
  const sourceMissing = (about === "blog" && !blogId) || (about === "collection" && !collection);

  // Blog posts / collections for the brand, loaded the first time they're needed.
  useEffect(() => {
    if (about === "blog" && blogs[brand] === undefined) {
      listBlogPostsForSocial(brand)
        .then((list) => setBlogs((b) => ({ ...b, [brand]: list })))
        .catch((e) => setBlogs((b) => ({ ...b, [brand]: e instanceof Error ? e.message : "Couldn't load blog posts." })));
    }
    if (about === "collection" && collections[brand] === undefined) {
      listSocialCollections(brand)
        .then((list) => setCollections((c) => ({ ...c, [brand]: list })))
        .catch((e) => setCollections((c) => ({ ...c, [brand]: e instanceof Error ? e.message : "Couldn't load collections." })));
    }
  }, [about, brand, blogs, collections]);

  // Upcoming Instagram posts for this brand (anything that will still go out).
  const upcoming = useMemo(
    () =>
      posts
        .filter(
          (p) =>
            p.brand === brand &&
            p.platforms.includes("instagram") &&
            p.scheduled_at &&
            (p.status === "scheduled" || p.status === "publishing") &&
            p.results.instagram?.status !== "published",
        )
        .map((p) => new Date(p.scheduled_at!))
        .sort((a, b) => a.getTime() - b.getTime()),
    [posts, brand],
  );

  // Start the day after the last scheduled post (or tomorrow), unless picked.
  const suggestedDay = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const last = upcoming[upcoming.length - 1];
    if (!last || last < tomorrow) return ymd(tomorrow);
    const after = new Date(last);
    after.setDate(after.getDate() + 1);
    return ymd(after);
  }, [upcoming]);
  const startDay = pickedDay ?? suggestedDay;
  const burst = kind === "picture" && !spread;
  const dates = useMemo(() => {
    if (!burst) return gridSchedule(total, startDay, time);
    const [first] = gridSchedule(1, startDay, time);
    return Array.from({ length: total }, (_, i) => new Date(first.getTime() + i * BURST_MINUTES * 60_000));
  }, [burst, total, startDay, time]);
  const clashes = upcoming.filter((d) => d >= dates[0] && d <= dates[dates.length - 1]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function suggest() {
    setError(null);
    setPitching(true);
    try {
      const res = await pitchGridThemes({ brand, rows, theme, startDay, ...source });
      setIdeas(res.themes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get ideas.");
    } finally {
      setPitching(false);
    }
  }

  async function write() {
    setError(null);
    setStep("writing");
    try {
      if (kind === "story") {
        const res = await generateGridSet({ brand, rows, theme: theme.trim(), startDay, ...source });
        setDraft(res);
        setDraftKind("story");
        setPieces([]);
        setSelected(res.posts.length - 1);
      } else {
        if (!picture) throw new Error("Choose a picture first.");
        const blobs = await slicePicture(picture, rows, crop);
        const res = await writeMosaicCaptions({
          brand,
          rows,
          theme: theme.trim(),
          startDay,
          ...source,
          image: overviewJpeg(picture, rows, crop),
          spread,
        });
        const setId = `grid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        // Previews use local copies of the pieces; they're uploaded on save.
        pieces.forEach((b) => URL.revokeObjectURL(blobUrl(b)));
        setPieces(blobs);
        setDraft({
          story: res.story,
          posts: res.captions.map((c, i) => {
            const slide = blankCanvas(brand);
            slide.bg = { ...slide.bg, image: blobUrl(blobs[i]), imageOpacity: 1 };
            return {
              title: c.title,
              role: `Piece ${i + 1}`,
              chapter: "",
              design: {
                slides: [slide],
                caption: c.caption,
                grid: { id: setId, story: res.story.title, slot: i + 1, size: blobs.length, role: "Piece" },
              },
            };
          }),
        });
        setDraftKind("picture");
        setSelected(blobs.length - 1);
      }
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't write the set.");
      setStep(draft ? "review" : "setup");
    }
  }

  async function createDrafts() {
    if (!draft) return;
    setError(null);
    setStep("saving");
    const platforms: SocialPlatform[] = alsoFacebook ? ["instagram", "facebook"] : ["instagram"];
    const out: SocialPost[] = [];
    try {
      for (let i = 0; i < draft.posts.length; i++) {
        const p = draft.posts[i];
        let design = p.design;
        if (draftKind === "picture") {
          setProgress(`Uploading piece ${i + 1} of ${draft.posts.length}…`);
          const file = new File([pieces[i]], `${p.design.grid?.id ?? "grid"}-${i + 1}.jpg`, { type: "image/jpeg" });
          const up = await uploadSocialImage(file, "social-grid");
          if ("error" in up) throw new Error(up.error);
          const s = design.slides[0];
          if (isCanvas(s)) design = { ...design, slides: [{ ...s, bg: { ...s.bg, image: up.url } }] };
        }
        setProgress(`Creating post ${i + 1} of ${draft.posts.length}…`);
        out.push(
          await createSocialPost({
            brand,
            platforms,
            title: p.title,
            design,
            scheduled_at: dates[i].toISOString(),
          }),
        );
      }
      setCreated(out);
      setStep("done");
    } catch (e) {
      setCreated(out);
      setError(`${e instanceof Error ? e.message : "Something went wrong."} ${out.length} of ${draft.posts.length} were created.`);
      setStep(out.length ? "done" : "review");
    } finally {
      setProgress(null);
      onChanged();
    }
  }

  async function scheduleAll() {
    setError(null);
    const errs: string[] = [];
    for (let i = 0; i < created.length; i++) {
      setProgress(`Getting post ${i + 1} of ${created.length} ready…`);
      try {
        await updateSocialPost(created[i].id, { action: "schedule" });
      } catch (e) {
        errs.push(`Post ${i + 1} (${created[i].title || "untitled"}): ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    setErrors(errs);
    setScheduled(true);
    setProgress(null);
    onChanged();
  }

  const blogList = blogs[brand];
  const collectionList = collections[brand];
  const canWrite = !sourceMissing && (kind === "story" || !!picture);

  return (
    <div
      className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-gray-900/60 p-4 backdrop-blur-sm md:p-8"
      onClick={() => !busy && onClose()}
    >
      <div className="w-full max-w-5xl rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-4">
          <span className="rounded-xl bg-gray-900 p-2 text-white">
            <Grid3x3 size={18} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Plan a grid</h2>
            <p className="text-sm text-gray-500">A set of Instagram posts that land as one finished block on the profile.</p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="ml-auto rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {step === "setup" && (
          <div className="space-y-7 px-6 py-6">
            <Section title="What kind of set?">
              <div className="grid gap-3 sm:grid-cols-2">
                <BigChoice
                  active={kind === "story"}
                  onClick={() => setKind("story")}
                  icon={<Layers size={18} />}
                  title="Story posts"
                  sub="Claude designs every post — each one has a job in the story."
                />
                <BigChoice
                  active={kind === "picture"}
                  onClick={() => setKind("picture")}
                  icon={<SquareDashed size={18} />}
                  title="One big picture"
                  sub="Upload a photo; it's split across the squares so the grid shows it whole."
                />
              </div>
            </Section>

            <Section title="Brand">
              <div className="flex flex-wrap gap-2">
                {(["NI", "Sassy"] as SocialBrand[]).map((b) => (
                  <Choice
                    key={b}
                    active={brand === b}
                    onClick={() => {
                      setBrand(b);
                      setIdeas(null);
                      setBlogId(null);
                      setCollection(null);
                    }}
                  >
                    {BRAND_NAME[b]}
                  </Choice>
                ))}
              </div>
              {connected[brand] === false && (
                <p className="mt-2 text-xs text-amber-700">
                  {BRAND_NAME[brand]}&apos;s Instagram isn&apos;t connected yet — you can plan and save the set, but it can&apos;t post until it is.
                </p>
              )}
            </Section>

            <Section title="Size">
              <div className="grid gap-3 sm:grid-cols-3">
                {GRID_ROWS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRows(r)}
                    className={clsx(
                      "flex items-center gap-4 rounded-xl border p-4 text-left transition",
                      rows === r ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200 hover:border-gray-300",
                    )}
                  >
                    <MiniGrid rows={r} plain={kind === "picture"} />
                    <span>
                      <span className="block font-semibold text-gray-900">
                        {r * 3} posts · {r} rows
                        {r === 3 && <span className="ml-1.5 text-xs font-medium text-gray-500">(usual)</span>}
                      </span>
                      <span className="block text-xs text-gray-500">{SIZE_COPY[r].weeks}</span>
                      <span className="block text-xs text-gray-500">{SIZE_COPY[r].use}</span>
                    </span>
                  </button>
                ))}
              </div>
              {kind === "story" && (
                <ol className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                  {gridChapters(rows).map((c, i) => (
                    <li key={c.name}>
                      <span className="font-semibold text-gray-700">Row {i + 1}:</span> {c.name} ({c.slots.map((s) => s.role).join(", ")})
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            {kind === "picture" && (
              <Section title="The picture">
                <MosaicCropper rows={rows} picture={picture} crop={crop} onPicture={setPicture} onCrop={setCrop} />
              </Section>
            )}

            <Section title={kind === "picture" ? "What's it about? (for the captions)" : "What's it about?"}>
              <div className="flex flex-wrap gap-2">
                <Choice active={about === "idea"} onClick={() => setAbout("idea")}>
                  <Lightbulb size={13} className="mr-1 inline" /> An idea
                </Choice>
                <Choice active={about === "blog"} onClick={() => setAbout("blog")}>
                  <Newspaper size={13} className="mr-1 inline" /> A blog post
                </Choice>
                <Choice active={about === "collection"} onClick={() => setAbout("collection")}>
                  <Tag size={13} className="mr-1 inline" /> A collection
                </Choice>
              </div>

              {about === "blog" && (
                <div className="mt-3">
                  {blogList === undefined ? (
                    <Loading text="Loading blog posts…" />
                  ) : typeof blogList === "string" ? (
                    <p className="text-xs text-red-600">{blogList}</p>
                  ) : blogList.length === 0 ? (
                    <p className="text-xs text-gray-500">No {BRAND_NAME[brand]} blog posts yet.</p>
                  ) : (
                    <select
                      value={blogId ?? ""}
                      onChange={(e) => {
                        setBlogId(e.target.value || null);
                        setIdeas(null);
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    >
                      <option value="">Pick a blog post…</option>
                      {blogList.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title || "Untitled"} — {b.status === "published" ? "published" : b.status === "scheduled" ? "scheduled" : "draft"}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {about === "collection" && (
                <div className="mt-3">
                  {collectionList === undefined ? (
                    <Loading text="Loading collections…" />
                  ) : typeof collectionList === "string" ? (
                    <p className="text-xs text-red-600">{collectionList}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {collectionList.map((c) => (
                        <button
                          key={c.slug}
                          onClick={() => {
                            setCollection(c.slug);
                            setIdeas(null);
                          }}
                          className={clsx(
                            "rounded-xl border px-3 py-2 text-left text-sm transition",
                            collection === c.slug ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200 hover:border-gray-300",
                          )}
                        >
                          <span className="block font-semibold text-gray-900">{c.name}</span>
                          <span className="block text-xs text-gray-500">
                            {c.tagline ? `${c.tagline} · ` : ""}
                            {c.products} {c.products === 1 ? "product" : "products"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <textarea
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                rows={3}
                placeholder={
                  about !== "idea"
                    ? "Anything else? An angle, an occasion, what to stress (optional)"
                    : brand === "NI"
                      ? "e.g. The ExSeed evening ritual — why the oils matter, how to use them, finding your scent"
                      : "e.g. Main-character season — a scent for every mood"
                }
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
              />
              {kind === "story" && (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      onClick={suggest}
                      disabled={pitching || sourceMissing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {pitching ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
                      {ideas ? "More ideas" : about === "idea" ? "Suggest 3 ideas" : "Suggest 3 angles"}
                    </button>
                    {about === "idea" && <span className="text-xs text-gray-500">Or leave it blank and Claude picks a story for the time of year.</span>}
                  </div>
                  {ideas && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {ideas.map((t) => {
                        const text = `${t.title} — ${t.pitch}`;
                        return (
                          <button
                            key={t.title}
                            onClick={() => setTheme(text)}
                            className={clsx(
                              "rounded-xl border p-3 text-left text-sm transition",
                              theme === text ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200 hover:border-gray-300",
                            )}
                          >
                            <span className="block font-semibold text-gray-900">{t.title}</span>
                            <span className="mt-1 block text-xs text-gray-600">{t.pitch}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </Section>

            <Section title="When">
              {kind === "picture" && (
                <div className="mb-3 flex flex-wrap gap-2">
                  <Choice active={spread} onClick={() => setSpread(true)}>
                    Spread out — the picture builds up
                  </Choice>
                  <Choice active={!spread} onClick={() => setSpread(false)}>
                    All at once — one day, {BURST_MINUTES} min apart
                  </Choice>
                </div>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-gray-500">
                  {burst ? "Day" : "First post"}
                  <input
                    type="date"
                    value={startDay}
                    onChange={(e) => e.target.value && setPickedDay(e.target.value)}
                    className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <label className="text-xs text-gray-500">
                  {burst ? "Starting at" : "Time"}
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => e.target.value && setTime(e.target.value)}
                    className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
                  <input type="checkbox" checked={alsoFacebook} onChange={(e) => setAlsoFacebook(e.target.checked)} />
                  Also post to Facebook
                </label>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {burst
                  ? `${shortDay(dates[0])}, ${shortTime(dates[0])} to ${shortTime(dates[dates.length - 1])}.`
                  : `About every day and a half: ${dates.map(shortDay).join(" · ")}`}
              </p>
              {kind === "picture" && alsoFacebook && (
                <p className="mt-1 text-xs text-gray-500">On Facebook the pieces show one by one, not as a grid — you may want Instagram only.</p>
              )}
              {clashes.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle size={13} />
                  {clashes.length} {clashes.length === 1 ? "post is" : "posts are"} already scheduled in these dates — they&apos;d land inside the set and shift the grid.
                  {pickedDay && pickedDay !== suggestedDay && (
                    <button onClick={() => setPickedDay(null)} className="font-semibold underline">
                      Start after them instead
                    </button>
                  )}
                </div>
              )}
            </Section>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
              <span className="text-xs text-gray-500">
                {kind === "story" ? `Writing ${total} posts takes a minute or two.` : "Cutting the picture and writing captions takes under a minute."}
              </span>
              <button
                onClick={write}
                disabled={!canWrite}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
              >
                <Sparkles size={15} />
                {kind === "story" ? `Write the ${total} posts` : `Split into ${total} posts`}
              </button>
            </div>
          </div>
        )}

        {step === "writing" && (
          <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
            <Loader2 size={28} className="animate-spin text-gray-400" />
            <p className="font-medium text-gray-900">
              {kind === "story" ? `Writing ${total} posts as one story…` : `Cutting the picture into ${total} posts…`}
            </p>
            <p className="max-w-sm text-sm text-gray-500">
              {kind === "story"
                ? "Claude is planning the arc, writing every slide and caption, and picking photos from our library. This takes a minute or two."
                : "Claude is looking at the picture and writing a caption for each piece."}
            </p>
          </div>
        )}

        {(step === "review" || step === "saving") && draft && (
          <Review
            draft={draft}
            kind={draftKind}
            brand={brand}
            rows={(draft.posts.length / 3) as GridRows}
            dates={dates}
            selected={selected}
            onSelect={setSelected}
            footer={
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
                {progress ? (
                  <span className="inline-flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 size={15} className="animate-spin" /> {progress}
                  </span>
                ) : (
                  <>
                    <button onClick={() => setStep("setup")} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                      Change the setup
                    </button>
                    <button
                      onClick={write}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <RotateCcw size={14} /> {draftKind === "picture" ? "New captions" : "Write it again"}
                    </button>
                    <button
                      onClick={createDrafts}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                    >
                      <Check size={15} /> Save as {draft.posts.length} drafts
                    </button>
                  </>
                )}
              </div>
            }
          />
        )}

        {step === "done" && (
          <div className="space-y-5 px-6 py-8">
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-green-100 p-2 text-green-700">
                <Check size={18} />
              </span>
              <div>
                <p className="font-semibold text-gray-900">
                  {scheduled
                    ? `${created.length - errors.length} of ${created.length} posts are scheduled.`
                    : `${created.length} drafts saved — ${draft?.story.title ?? "your set"}.`}
                </p>
                <p className="text-sm text-gray-600">
                  {scheduled
                    ? `They'll post by themselves, ${shortDay(dates[0])} to ${shortDay(dates[created.length - 1] ?? dates[0])}.`
                    : `Each is dated ${shortDay(dates[0])} to ${shortDay(dates[created.length - 1] ?? dates[0])}. Open any of them to tweak it, or schedule them all now.`}
                </p>
              </div>
            </div>

            {errors.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-medium">These need a look before they can be scheduled:</p>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {!scheduled &&
                (connected[brand] === false ? (
                  <span className="text-sm text-amber-700">Scheduling is off until {BRAND_NAME[brand]}&apos;s Instagram is connected.</span>
                ) : (
                  <button
                    onClick={scheduleAll}
                    disabled={progress !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                  >
                    {progress ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />}
                    {progress ?? `Schedule all ${created.length}`}
                  </button>
                ))}
              <button
                onClick={() => onOpenPreview(brand)}
                disabled={progress !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <Grid3x3 size={15} /> See it in Preview grid
              </button>
              <button
                onClick={onClose}
                disabled={progress !== null}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-60"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** One object URL per piece, reused across renders. */
const blobUrls = new WeakMap<Blob, string>();
function blobUrl(b: Blob): string {
  let u = blobUrls.get(b);
  if (!u) {
    u = URL.createObjectURL(b);
    blobUrls.set(b, u);
  }
  return u;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </section>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <p className="inline-flex items-center gap-2 text-xs text-gray-500">
      <Loader2 size={13} className="animate-spin" /> {text}
    </p>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-full border px-4 py-1.5 text-sm font-medium transition",
        active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700 hover:border-gray-400",
      )}
    >
      {children}
    </button>
  );
}

function BigChoice({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-start gap-3 rounded-xl border p-4 text-left transition",
        active ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200 hover:border-gray-300",
      )}
    >
      <span className={clsx("rounded-lg p-2", active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600")}>{icon}</span>
      <span>
        <span className="block font-semibold text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500">{sub}</span>
      </span>
    </button>
  );
}

function MiniGrid({ rows, plain }: { rows: GridRows; plain?: boolean }) {
  return (
    <span className="grid shrink-0 grid-cols-3 gap-0.5">
      {Array.from({ length: rows * 3 }, (_, i) => (
        <span
          key={i}
          className={clsx(
            "h-3 w-2.5 rounded-[2px]",
            plain ? "bg-gray-500" : (Math.floor(i / 3) + (i % 3)) % 2 === 0 ? "bg-gray-800" : "bg-gray-300",
          )}
        />
      ))}
    </span>
  );
}

/** The finished block as it will sit on the profile (last post top-left), plus the picked post's detail. */
function Review({
  draft,
  kind,
  brand,
  rows,
  dates,
  selected,
  onSelect,
  footer,
}: {
  draft: GridDraft;
  kind: Kind;
  brand: SocialBrand;
  rows: GridRows;
  dates: Date[];
  selected: number;
  onSelect: (i: number) => void;
  footer: React.ReactNode;
}) {
  const total = draft.posts.length;
  const chapters = gridChapters(rows);
  const jobs = kind === "story" ? gridSlots(rows).map((s) => s.job) : [];
  // Grid order: top-left = last post.
  const order = Array.from({ length: total }, (_, k) => total - 1 - k);
  const post = draft.posts[selected];
  const caption = compileCaption(post.design.caption);
  const gap = kind === "picture" ? 1 : 2;
  const when = (d: Date) => (kind === "picture" && dates[0].toDateString() === dates[total - 1]?.toDateString() ? shortTime(d) : shortDay(d));

  return (
    <>
      <div className="px-6 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {BRAND_NAME[brand]} · {total}-post {kind === "picture" ? "picture" : "story"}
        </p>
        <h3 className="text-xl font-semibold text-gray-900">{draft.story.title}</h3>
        {draft.story.arc && <p className="mt-1 max-w-3xl text-sm text-gray-600">{draft.story.arc}</p>}
      </div>

      <div className="flex flex-col gap-8 px-6 py-6 lg:flex-row lg:items-start">
        <div className="shrink-0">
          <div className="flex gap-3">
            {kind === "story" && (
              <div className="flex flex-col" style={{ gap }}>
                {Array.from({ length: rows }, (_, r) => (
                  <div key={r} className="flex w-20 items-center text-right text-[11px] font-medium leading-tight text-gray-500" style={{ height: TILE_H }}>
                    {chapters[rows - 1 - r].name}
                  </div>
                ))}
              </div>
            )}
            <div className="grid" style={{ gridTemplateColumns: `repeat(3, ${TILE}px)`, gap }}>
              {order.map((i) => {
                const p = draft.posts[i];
                const first = p.design.slides[0];
                const { row, col } = gridPosition(i + 1, total);
                return (
                  <button
                    key={i}
                    onClick={() => onSelect(i)}
                    className={clsx("group relative overflow-hidden bg-gray-100", selected === i && "ring-[3px] ring-inset ring-blue-500")}
                    style={{ width: TILE, height: TILE_H, gridRow: row + 1, gridColumn: col + 1 }}
                  >
                    {first && (
                      <span className="absolute top-0" style={{ left: (TILE - TILE_H * 0.8) / 2 }}>
                        <SlidePreview slide={first} brand={brand} index={1} total={p.design.slides.length} width={TILE_H * 0.8} />
                      </span>
                    )}
                    {p.design.slides.length > 1 && (
                      <span className="absolute right-1.5 top-1.5 text-white drop-shadow">
                        <Images size={15} />
                      </span>
                    )}
                    <span
                      className={clsx(
                        "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-left text-[10px] leading-tight text-white",
                        kind === "picture" && selected !== i && "opacity-0 transition group-hover:opacity-100",
                      )}
                    >
                      <span className="font-semibold">
                        #{i + 1} {p.role}
                      </span>
                      <span className="block opacity-80">{when(dates[i])}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className={clsx("mt-2 text-xs text-gray-500", kind === "story" && "pl-[92px]")}>
            Post #1 goes out first (bottom-right); #{total} lands top-left.
          </p>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Post #{selected + 1} · {post.role} · {when(dates[selected])}
            </p>
            <p className="font-semibold text-gray-900">{post.title}</p>
            {jobs[selected] && <p className="text-xs text-gray-500">{jobs[selected]}</p>}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {post.design.slides.map((s, k) => (
              <div key={s.id} className="shrink-0 overflow-hidden rounded-md border border-gray-200" style={{ width: 120, height: (120 * SLIDE_H) / SLIDE_W }}>
                <SlidePreview slide={s} brand={brand} index={k + 1} total={post.design.slides.length} width={120} />
              </div>
            ))}
          </div>
          <div className="max-h-64 overflow-y-auto whitespace-pre-line rounded-lg bg-gray-50 p-3 text-sm text-gray-800">{caption}</div>
          <p className="text-xs text-gray-500">
            {kind === "picture"
              ? "Each piece shows a little extra at the sides in the feed, so neighbours line up on the grid. You can add text to any piece after saving."
              : "You can change any of this after saving — each post opens in the normal editor."}
          </p>
        </div>
      </div>
      {footer}
    </>
  );
}
