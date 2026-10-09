"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Film,
  ImagePlus,
  Loader2,
  Newspaper,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import clsx from "clsx";
import MediaLibraryModal from "@/components/templates/MediaLibraryModal";
import { formatDateTime } from "@/components/marketing/blog/bits";
import {
  SLIDES_MAX,
  compileCaption,
  isCanvas,
  emptyCaption,
  newSlide,
  slideProblems,
  starterDesign,
  type CaptionParts,
  type PostDesign,
  type DesignSlide,
  type ProductOption,
  type SlideLayout,
} from "@/lib/social/design";
import {
  CAROUSEL_MAX,
  IG_CAPTION_MAX,
  IG_HASHTAG_MAX,
  PLATFORM_LABEL,
  POST_TYPE_LABEL,
  SOCIAL_PLATFORMS,
  SOCIAL_POST_TYPES,
  countHashtags,
  validatePost,
  type MetaConnectionStatus,
  type SocialBrand,
  type SocialMedia,
  type SocialPlatform,
  type SocialPost,
  type SocialPostType,
} from "@/lib/social/types";
import {
  deleteSocialPost,
  getSocialPost,
  getSocialStatus,
  listSocialProducts,
  publishSocialPostNow,
  updateSocialPost,
  uploadSocialImage,
  uploadSocialVideo,
  type PostFields,
} from "./api";
import { ConfirmDialog } from "./bits";
import BuilderHeader from "./BuilderHeader";
import PlatformPreview from "./PlatformPreview";
import SlidePreview, { SlideFonts } from "./SlidePreview";
import CanvasEditor from "./canvas/CanvasEditor";
import { convertLayoutSlide } from "./canvas/convertLayout";
import { useHistory } from "./canvas/useHistory";
import { blankCanvas, type CanvasSlide } from "@/lib/social/canvas";

/**
 * The social post builder (/marketing/social/[id]).
 *
 * Designed posts: a strip of slides on the left, the selected slide on a free
 * canvas in the middle (text, photos, shapes, textures — drag, resize,
 * rotate; drawn by the same CanvasView the server renders to JPEG), and a
 * Design / Layers / Caption panel on the right. Template slides (what the
 * AI writes) are converted to canvas slides when the post is opened. Photo /
 * video posts swap the slides for a media picker and a plain caption.
 *
 * Everything autosaves 1.5 s after the last change. Schedule and Publish now
 * render the slides server-side first.
 */

type SaveState = "saved" | "dirty" | "saving" | "error";

/** ISO → value for <input type="datetime-local"> in the viewer's timezone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function SocialPostBuilder({ id }: { id: string }) {
  const router = useRouter();
  const [post, setPost] = useState<SocialPost | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conn, setConn] = useState<MetaConnectionStatus | null>(null);

  // Editable state.
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState<SocialBrand>("NI");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([]);
  const [when, setWhen] = useState("");
  // The design has undo/redo; everything else autosaves as plain state.
  const history = useHistory<PostDesign | null>(null);
  const design = history.value;
  const setDesign = history.set;
  const [converting, setConverting] = useState(false);
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState<SocialMedia[]>([]);
  const [postType, setPostType] = useState<SocialPostType>("image");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [busy, setBusy] = useState<null | "schedule" | "publish" | "draft" | "retry" | "delete" | "upload">(null);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | "media">(null);
  const [imageRequest, setImageRequest] = useState<{ source: "library" | "product"; onPicked: (url: string) => void } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "publish" | "delete" | "photos" } | { kind: "slide"; index: number }>(null);

  const hydrated = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hydrate = useCallback((p: SocialPost) => {
    hydrated.current = false;
    setPost(p);
    setTitle(p.title ?? "");
    setBrand(p.brand);
    setPlatforms(p.platforms);
    setWhen(toLocalInput(p.scheduled_at));
    history.reset(p.design ?? null);
    setCaption(p.caption);
    setMedia(p.media);
    setPostType(p.post_type);
    setSelectedId((cur) => cur ?? p.design?.slides[0]?.id ?? null);
    setSaveState("saved");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getSocialPost(id)
      .then(hydrate)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load the post."));
    getSocialStatus().then(setConn).catch(() => setConn(null));
  }, [id, hydrate]);

  // Template slides (from the AI wizard or older posts) become editable
  // canvas slides the first time the post is opened. Posted posts stay as they are.
  useEffect(() => {
    if (!design || !design.slides.some((s) => !isCanvas(s)) || converting) return;
    if (post && (post.status === "published" || post.status === "partial" || post.status === "publishing")) return;
    let alive = true;
    setConverting(true);
    const total = design.slides.length;
    Promise.all(design.slides.map((s, i) => (isCanvas(s) ? Promise.resolve(s) : convertLayoutSlide(s, brand, i + 1, total))))
      .then((slides) => {
        if (!alive) return;
        history.reset({ ...design, slides });
      })
      .catch((e) => alive && setError(`Couldn't open the slides for editing: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => alive && setConverting(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, post?.status]);

  const status = post?.status ?? "draft";
  const locked = status === "publishing" || status === "published" || status === "partial";

  /* ── What gets saved ────────────────────────────────────────── */

  const fields = useCallback((): PostFields => {
    const f: PostFields = { brand, platforms, scheduled_at: fromLocalInput(when) };
    // Only send columns the post already uses, so photo posts keep working
    // before the design migration is applied.
    if (title !== (post?.title ?? "")) f.title = title;
    if (design) f.design = design;
    else {
      if (post?.design) f.design = null;
      Object.assign(f, { caption, media, post_type: postType });
    }
    return f;
  }, [brand, platforms, when, title, design, caption, media, postType, post]);

  // Mark dirty on any edit after hydration.
  useEffect(() => {
    if (!post) return;
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    if (!locked) setSaveState("dirty");
  }, [title, brand, platforms, when, design, caption, media, postType]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async () => {
    if (!post || locked) return;
    setSaveState("saving");
    try {
      const p = await updateSocialPost(post.id, fields());
      setPost(p);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setError(e instanceof Error ? e.message : "Couldn't save.");
    }
  }, [post, locked, fields]);

  useEffect(() => {
    if (saveState !== "dirty") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [saveState, save]);

  /* ── Derived ────────────────────────────────────────────────── */

  const effectiveCaption = design ? compileCaption(design.caption) : caption;
  const slides = design?.slides ?? [];
  const selectedIndex = Math.max(0, slides.findIndex((s) => s.id === selectedId));
  const selected = slides[selectedIndex] ?? null;

  const problems = useMemo(() => {
    if (design) {
      const p = design.slides.flatMap((s, i) => slideProblems(s, i + 1));
      if (!platforms.length) p.push("Pick at least one platform.");
      // Media is rendered server-side; check the caption limits with stand-in media.
      const stand: SocialMedia[] = design.slides.map(() => ({ url: "https://x/slide.jpg", kind: "image" }));
      p.push(
        ...validatePost({
          brand,
          platforms,
          post_type: design.slides.length === 1 ? "image" : "carousel",
          caption: effectiveCaption,
          media: stand,
        }).filter((x) => !p.includes(x)),
      );
      return p;
    }
    return validatePost({ brand, platforms, post_type: postType, caption, media });
  }, [design, brand, platforms, postType, caption, media, effectiveCaption]);

  const brandConn = conn?.brands.find((b) => b.brand === brand);

  /* ── Slide editing ──────────────────────────────────────────── */

  function setCaptionParts(patch: Partial<CaptionParts>) {
    if (!design) return;
    setDesign({ ...design, caption: { ...design.caption, ...patch } }, `caption:${Object.keys(patch).join(",")}`);
  }
  function updateCanvas(next: CanvasSlide, key?: string) {
    if (!design) return;
    setDesign({ ...design, slides: design.slides.map((s) => (s.id === next.id ? next : s)) }, key);
  }
  async function addSlide(layout: SlideLayout | "blank") {
    if (!design || design.slides.length >= SLIDES_MAX) return;
    const at = selectedIndex + 1;
    const total = design.slides.length + 1;
    let s: DesignSlide;
    try {
      s = layout === "blank" ? blankCanvas(brand) : await convertLayoutSlide(newSlide(layout, brand), brand, at + 1, total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the slide.");
      return;
    }
    setDesign({ ...design, slides: [...design.slides.slice(0, at), s, ...design.slides.slice(at)] });
    setSelectedId(s.id);
  }
  function moveSlide(i: number, dir: -1 | 1) {
    if (!design) return;
    const j = i + dir;
    if (j < 0 || j >= design.slides.length) return;
    const next = [...design.slides];
    [next[i], next[j]] = [next[j], next[i]];
    setDesign({ ...design, slides: next });
  }
  function duplicateSlide(i: number) {
    if (!design || design.slides.length >= SLIDES_MAX) return;
    const copy: DesignSlide = { ...design.slides[i], id: newSlide("text", brand).id };
    const next = [...design.slides];
    next.splice(i + 1, 0, copy);
    setDesign({ ...design, slides: next });
    setSelectedId(copy.id);
  }
  function deleteSlide(i: number) {
    if (!design || design.slides.length <= 1) return;
    const next = design.slides.filter((_, j) => j !== i);
    setDesign({ ...design, slides: next });
    setSelectedId(next[Math.min(i, next.length - 1)].id);
  }

  function switchToDesign() {
    const d = starterDesign(brand);
    if (caption.trim()) d.caption = { ...emptyCaption(), body: caption.trim() };
    setDesign(d);
    setSelectedId(d.slides[0].id);
  }
  function switchToPhotos() {
    setCaption(effectiveCaption);
    setMedia([]);
    setPostType("image");
    setDesign(null);
  }

  /* ── Actions ────────────────────────────────────────────────── */

  async function act(kind: NonNullable<typeof busy>, fn: () => Promise<SocialPost | void>) {
    if (!post) return;
    if (timer.current) clearTimeout(timer.current);
    setBusy(kind);
    setError(null);
    try {
      const p = await fn();
      if (p) hydrate(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const schedule = (iso: string) => {
    setWhen(toLocalInput(iso));
    void act("schedule", () => updateSocialPost(post!.id, { ...fields(), scheduled_at: iso, action: "schedule" }));
  };
  const unschedule = () => act("draft", () => updateSocialPost(post!.id, { ...fields(), action: "draft" }));
  const retry = () => act("retry", () => updateSocialPost(post!.id, { action: "retry" }));
  const publishNow = () => act("publish", () => publishSocialPostNow(post!.id, fields()));
  const remove = () =>
    act("delete", async () => {
      await deleteSocialPost(post!.id);
      router.push("/marketing/social");
    });

  /** Runs the confirmed dialog's action. */
  function onConfirm() {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === "publish" && problems.length === 0) void publishNow();
    else if (c.kind === "delete") void remove();
    else if (c.kind === "photos") switchToPhotos();
    else if (c.kind === "slide") deleteSlide(c.index);
  }

  async function onVideo(file: File | undefined) {
    if (!file) return;
    setBusy("upload");
    setError(null);
    try {
      const url = await uploadSocialVideo(file);
      setMedia([{ url, kind: "video" }]);
      setPostType("reel");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */

  if (loadError) {
    return (
      <div className="p-6 md:px-8">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
      </div>
    );
  }
  if (!post) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-gray-400">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gray-50/50">
      <SlideFonts />

      <BuilderHeader
        title={title}
        onTitle={setTitle}
        brand={brand}
        onBrand={setBrand}
        platforms={platforms}
        onTogglePlatform={(p) =>
          setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : SOCIAL_PLATFORMS.filter((x) => x === p || cur.includes(x))))
        }
        status={status}
        scheduledAt={post.scheduled_at}
        publishedAt={post.published_at}
        suggestedAt={post.scheduled_at}
        suggestedNote={design?.source?.kind === "blog" ? "Same time as the blog post" : "The time already set"}
        saveState={saveState}
        locked={locked}
        busy={busy}
        connection={conn}
        problems={problems}
        onSchedule={schedule}
        onUnschedule={() => void unschedule()}
        onPublishNow={() => setConfirm({ kind: "publish" })}
        onRetry={() => void retry()}
        onDelete={() => setConfirm({ kind: "delete" })}
        onPreview={() => setPreviewOpen(true)}
        extraAction={design ? { label: "Use my own photos instead", onClick: () => setConfirm({ kind: "photos" }) } : null}
      />

      <div className="space-y-4 px-4 pb-10 pt-4 md:px-8">
      {design?.source?.kind === "blog" && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
          <Newspaper size={15} className="text-gray-400" />
          Made from the blog post
          <Link href={`/marketing/blog/${design.source.id}`} className="font-medium text-gray-900 underline-offset-2 hover:underline">
            {design.source.title}
          </Link>
          {design.source.url && (
            <a href={design.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
              on the site <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}
      {brandConn && !brandConn.ok && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="shrink-0" />
          {brand === "NI" ? "Natural Inspirations" : "Sassy"} can&apos;t post yet: {brandConn.error}
        </div>
      )}
      {(busy === "schedule" || busy === "publish") && design && (
        <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
          <Loader2 size={16} className="animate-spin" /> {busy === "publish" ? "Preparing the slides and posting…" : "Preparing the slides…"}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
      {locked && <Results post={post} />}
      {post.status === "failed" && post.last_error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">It didn&apos;t post: {post.last_error}</div>
      )}

      {design ? (
        <>
        <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_380px]">
          {/* Slide strip */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-gray-500">
              Slides · {slides.length}/{SLIDES_MAX}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {slides.map((s, i) => (
                <div
                  key={s.id}
                  className={clsx(
                    "group relative shrink-0 cursor-pointer rounded-lg border-2 p-0.5 transition",
                    s.id === selected?.id ? "border-gray-900" : "border-transparent hover:border-gray-300",
                  )}
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className="overflow-hidden rounded-md">
                    <SlidePreview slide={s} brand={brand} index={i + 1} total={slides.length} width={120} />
                  </div>
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1 text-[10px] text-white">{i + 1}</span>
                  {slideProblems(s, i + 1).length > 0 && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-500 p-0.5 text-white" title={slideProblems(s, i + 1).join(" ")}>
                      <AlertTriangle size={10} />
                    </span>
                  )}
                  {!locked && (
                    <div className="absolute inset-x-1 bottom-1 hidden justify-between rounded bg-black/60 px-1 py-0.5 group-hover:flex">
                      <IconBtn label="Move up" onClick={() => moveSlide(i, -1)} disabled={i === 0}>
                        <ArrowUp size={12} />
                      </IconBtn>
                      <IconBtn label="Move down" onClick={() => moveSlide(i, 1)} disabled={i === slides.length - 1}>
                        <ArrowDown size={12} />
                      </IconBtn>
                      <IconBtn label="Duplicate" onClick={() => duplicateSlide(i)} disabled={slides.length >= SLIDES_MAX}>
                        <Copy size={12} />
                      </IconBtn>
                      <IconBtn label="Delete" onClick={() => setConfirm({ kind: "slide", index: i })} disabled={slides.length <= 1}>
                        <Trash2 size={12} />
                      </IconBtn>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!locked && (
              <button onClick={switchToPhotos} className="block pt-2 text-left text-[11px] text-gray-400 hover:text-gray-700">
                Use my own photos instead
              </button>
            )}
          </div>

          {selected && isCanvas(selected) && !converting ? (
            <CanvasEditor
              key={selected.id}
              brand={brand}
              slide={selected}
              index={selectedIndex + 1}
              total={slides.length}
              locked={locked}
              onChange={updateCanvas}
              undo={history.undo}
              redo={history.redo}
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              requestImage={(source, onPicked) => setImageRequest({ source, onPicked })}
              problems={problems}
              onAddSlide={(l) => void addSlide(l)}
              canAddSlide={slides.length < SLIDES_MAX}
            />
          ) : selected && !isCanvas(selected) && locked ? (
            <div className="flex justify-center rounded-2xl border border-gray-200 bg-gray-50 p-6 lg:col-span-2">
              <div className="overflow-hidden rounded-lg shadow-md">
                <SlidePreview slide={selected} brand={brand} index={selectedIndex + 1} total={slides.length} width={420} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-16 text-sm text-gray-500 lg:col-span-2">
              <Loader2 size={16} className="animate-spin" /> Getting the slides ready to edit…
            </div>
          )}
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h3 className="text-base font-semibold text-gray-900">Caption</h3>
          <p className="mt-0.5 text-sm text-gray-500">The words posted under the slides. Built from the four parts below.</p>
          <fieldset disabled={locked} className="mt-4 min-w-0 disabled:opacity-70">
            <CaptionInspector caption={design.caption} onChange={setCaptionParts} compiled={effectiveCaption} platforms={platforms} />
          </fieldset>
        </section>
        </>
      ) : (
        <PhotoMode
          locked={locked}
          brand={brand}
          handle={brandConn?.instagram?.username ?? null}
          postType={postType}
          setPostType={(t) => {
            setPostType(t);
            setMedia((m) => {
              if (t === "reel") return m.filter((x) => x.kind === "video").slice(0, 1);
              const imgs = m.filter((x) => x.kind === "image");
              return t === "image" ? imgs.slice(0, 1) : imgs.slice(0, CAROUSEL_MAX);
            });
          }}
          media={media}
          setMedia={setMedia}
          caption={caption}
          setCaption={setCaption}
          platforms={platforms}
          problems={problems}
          uploading={busy === "upload"}
          onAddImage={() => setPicker("media")}
          onVideo={onVideo}
          onUseDesign={switchToDesign}
        />
      )}

      </div>

      <PlatformPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        brand={brand}
        platforms={platforms}
        postType={design ? (design.slides.length === 1 ? "image" : "carousel") : postType}
        slides={design?.slides ?? null}
        media={media}
        caption={effectiveCaption}
        igHandle={brandConn?.instagram?.username ?? null}
        fbName={brandConn?.facebook?.name ?? null}
      />

      <ConfirmDialog
        open={confirm?.kind === "publish"}
        title={problems.length ? "Not ready to post yet" : "Post this now?"}
        confirmLabel={problems.length ? "OK" : "Post now"}
        onCancel={() => setConfirm(null)}
        onConfirm={onConfirm}
      >
        {problems.length ? (
          <ul className="list-disc space-y-1 pl-5">
            {problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <>
            This goes live on <strong className="text-gray-900">{platforms.map((p) => PLATFORM_LABEL[p]).join(" and ")}</strong> for{" "}
            <strong className="text-gray-900">{brand === "NI" ? "Natural Inspirations" : "Sassy"}</strong> right away. After that,
            changes have to be made on {platforms.map((p) => PLATFORM_LABEL[p]).join(" and ")} directly.
          </>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === "delete"}
        title={status === "published" || status === "partial" ? "Remove this post from the list?" : "Delete this post?"}
        confirmLabel={status === "published" || status === "partial" ? "Remove" : "Delete post"}
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={onConfirm}
      >
        {status === "published" || status === "partial"
          ? "It stays up on Facebook and Instagram — delete it there if you want it gone."
          : "The draft and its slides are deleted. This can't be undone."}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === "photos"}
        title="Use your own photos instead?"
        confirmLabel="Remove slides"
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={onConfirm}
      >
        The designed slides are removed from this post. The caption is kept.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === "slide"}
        title={confirm?.kind === "slide" ? `Delete slide ${confirm.index + 1}?` : "Delete slide?"}
        confirmLabel="Delete slide"
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={onConfirm}
      >
        {confirm?.kind === "slide" && design?.slides[confirm.index] ? (
          <div className="flex items-center gap-4">
            <div className="shrink-0 overflow-hidden rounded-lg border border-gray-200">
              <SlidePreview slide={design.slides[confirm.index]} brand={brand} index={confirm.index + 1} total={design.slides.length} width={72} />
            </div>
            <span>This slide and everything on it is removed from the post.</span>
          </div>
        ) : null}
      </ConfirmDialog>

      {(picker === "media" || imageRequest?.source === "library") && (
        <MediaLibraryModal
          open
          onClose={() => {
            setPicker(null);
            setImageRequest(null);
          }}
          onSelect={(url) => {
            if (imageRequest) imageRequest.onPicked(url);
            else setMedia((m) => (postType === "image" ? [{ url, kind: "image" }] : [...m, { url, kind: "image" as const }].slice(0, CAROUSEL_MAX)));
            setPicker(null);
            setImageRequest(null);
          }}
          inbox="social-uploads"
          uploader={uploadSocialImage}
        />
      )}
      {imageRequest?.source === "product" && (
        <ProductPicker
          brand={brand}
          onClose={() => setImageRequest(null)}
          onPick={(_p, url) => {
            imageRequest.onPicked(url);
            setImageRequest(null);
          }}
        />
      )}
    </div>
  );
}

/* ─── Caption inspector ───────────────────────────────────────────── */

function CaptionInspector({
  caption: c,
  onChange,
  compiled,
  platforms,
}: {
  caption: CaptionParts;
  onChange: (patch: Partial<CaptionParts>) => void;
  compiled: string;
  platforms: SocialPlatform[];
}) {
  const [tag, setTag] = useState("");
  const ig = platforms.includes("instagram");
  const tags = countHashtags(compiled);

  function addTag(raw: string) {
    const clean = raw.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (clean && !c.hashtags.some((h) => h.toLowerCase() === clean.toLowerCase())) onChange({ hashtags: [...c.hashtags, clean] });
    setTag("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
      <TextArea label="Hook — the first line people see" value={c.hook} rows={2} max={150} onChange={(hook) => onChange({ hook })} />
      <TextArea label="Body" value={c.body} rows={6} onChange={(body) => onChange({ body })} />
      <TextArea label="Call to action" value={c.cta} rows={2} max={200} onChange={(cta) => onChange({ cta })} />
      <Field label={`Hashtags · ${c.hashtags.length}`}>
        <div className="flex flex-wrap gap-1.5">
          {c.hashtags.map((h) => (
            <span key={h} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
              #{h}
              <button type="button" onClick={() => onChange({ hashtags: c.hashtags.filter((x) => x !== h) })} aria-label={`Remove ${h}`}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === " ") {
              e.preventDefault();
              addTag(tag);
            }
          }}
          onBlur={() => tag && addTag(tag)}
          placeholder="Add a hashtag and press Enter"
          className="mt-2 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
        />
      </Field>
      </div>
      <div>
      <Field label="As posted">
        <p className="max-h-96 min-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
          {compiled || <span className="text-gray-400">Nothing yet.</span>}
        </p>
        <div className="mt-1 flex gap-3 text-[11px] text-gray-400">
          <span className={clsx(ig && compiled.length > IG_CAPTION_MAX && "text-red-600")}>
            {compiled.length.toLocaleString()} / {IG_CAPTION_MAX.toLocaleString()}
          </span>
          <span className={clsx(ig && tags > IG_HASHTAG_MAX && "text-red-600")}>{tags} hashtags</span>
        </div>
      </Field>
      </div>
    </div>
  );
}

/* ─── Photo / video mode ──────────────────────────────────────────── */

function PhotoMode(props: {
  locked: boolean;
  brand: SocialBrand;
  handle: string | null;
  postType: SocialPostType;
  setPostType: (t: SocialPostType) => void;
  media: SocialMedia[];
  setMedia: React.Dispatch<React.SetStateAction<SocialMedia[]>>;
  caption: string;
  setCaption: (v: string) => void;
  platforms: SocialPlatform[];
  problems: string[];
  uploading: boolean;
  onAddImage: () => void;
  onVideo: (f: File | undefined) => void;
  onUseDesign: () => void;
}) {
  const { locked, postType, media, setMedia, caption, platforms } = props;
  const videoInput = useRef<HTMLInputElement>(null);
  const hashtags = countHashtags(caption);

  function move(i: number, dir: -1 | 1) {
    setMedia((m) => {
      const j = i + dir;
      if (j < 0 || j >= m.length) return m;
      const next = [...m];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <fieldset disabled={locked} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 disabled:opacity-70">
        <Field label="Type">
          <Segmented options={SOCIAL_POST_TYPES.map((t) => ({ value: t, label: POST_TYPE_LABEL[t] }))} value={postType} onChange={props.setPostType} />
        </Field>
        <Field label={postType === "reel" ? "Video" : postType === "carousel" ? `Images (${media.length}/${CAROUSEL_MAX})` : "Image"}>
          <div className="flex flex-wrap gap-2">
            {media.map((m, i) => (
              <div key={`${m.url}-${i}`} className="group relative h-32 w-28 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                {m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={m.url} className="h-full w-full object-cover" muted />
                )}
                {!locked && (
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 px-1 py-0.5 opacity-0 transition group-hover:opacity-100">
                    <IconBtn label="Move left" onClick={() => move(i, -1)} disabled={i === 0}>
                      <ChevronLeft size={14} />
                    </IconBtn>
                    <IconBtn label="Remove" onClick={() => setMedia((cur) => cur.filter((_, j) => j !== i))}>
                      <X size={14} />
                    </IconBtn>
                    <IconBtn label="Move right" onClick={() => move(i, 1)} disabled={i === media.length - 1}>
                      <ChevronRight size={14} />
                    </IconBtn>
                  </div>
                )}
              </div>
            ))}
            {postType === "reel"
              ? media.length === 0 && (
                  <button
                    type="button"
                    onClick={() => videoInput.current?.click()}
                    disabled={props.uploading}
                    className="flex h-32 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-400"
                  >
                    {props.uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                    {props.uploading ? "Uploading…" : "Upload video"}
                  </button>
                )
              : (postType === "carousel" ? media.length < CAROUSEL_MAX : media.length === 0) && (
                  <button
                    type="button"
                    onClick={props.onAddImage}
                    className="flex h-32 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-400"
                  >
                    <ImagePlus size={18} />
                    Add image
                  </button>
                )}
          </div>
          <input
            ref={videoInput}
            type="file"
            accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
            className="hidden"
            onChange={(e) => {
              props.onVideo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {platforms.includes("instagram") && postType !== "reel" && (
            <p className="mt-1.5 text-xs text-gray-400">Instagram needs 4:5 to 1.91:1 — anything taller or wider is padded with white (never cropped).</p>
          )}
          {postType === "reel" && <p className="mt-1.5 text-xs text-gray-400">MP4 or MOV, vertical 9:16 works best, 3 s – 15 min.</p>}
        </Field>
        {!locked && (
          <button type="button" onClick={props.onUseDesign} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900">
            <Film size={13} /> Design branded slides instead
          </button>
        )}
        {!locked && props.problems.length > 0 && (media.length > 0 || caption) && (
          <ul className="space-y-0.5 text-xs text-amber-700">
            {props.problems.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        )}
      </fieldset>
      <fieldset disabled={locked} className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 disabled:opacity-70">
        <Field label="Caption">
          <textarea
            value={caption}
            onChange={(e) => props.setCaption(e.target.value)}
            rows={12}
            placeholder="Write the caption — hashtags and @mentions go right in the text."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
          />
          <div className="mt-1 flex gap-3 text-[11px] text-gray-400">
            <span className={clsx(caption.length > IG_CAPTION_MAX && platforms.includes("instagram") && "text-red-600")}>
              {caption.length.toLocaleString()} / {IG_CAPTION_MAX.toLocaleString()}
            </span>
            <span className={clsx(hashtags > IG_HASHTAG_MAX && "text-red-600")}>{hashtags} hashtags</span>
          </div>
        </Field>
      </fieldset>
    </div>
  );
}

/* ─── Product picker ──────────────────────────────────────────────── */

function ProductPicker({
  brand,
  onClose,
  onPick,
}: {
  brand: SocialBrand;
  onClose: () => void;
  onPick: (p: ProductOption, url: string) => void;
}) {
  const [products, setProducts] = useState<ProductOption[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listSocialProducts(brand)
      .then(setProducts)
      .catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load products."));
  }, [brand]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (products ?? []).filter((p) => p.images.length && (!term || p.name.toLowerCase().includes(term))).slice(0, 40);
  }, [products, q]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">Product photo</h2>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            className="ml-2 max-w-xs flex-1 rounded-full border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
          />
          <button onClick={onClose} className="ml-auto rounded-full p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {err && <p className="text-sm text-red-600">{err}</p>}
          {!products && !err && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" /> Loading products…
            </div>
          )}
          {shown.map((p) => (
            <div key={p.part}>
              <div className="mb-1.5 text-sm font-medium text-gray-800">
                {p.name} <span className="text-xs font-normal text-gray-400">{[p.size, p.price != null ? `$${p.price}` : null].filter(Boolean).join(" · ")}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.images.map((im) => (
                  <button
                    key={im.url}
                    onClick={() => onPick(p, im.url)}
                    className="h-24 w-24 overflow-hidden rounded-lg border border-gray-200 bg-white hover:border-gray-900"
                    title={im.type}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.url} alt="" className="h-full w-full object-contain" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Small pieces ────────────────────────────────────────────────── */


function Results({ post }: { post: SocialPost }) {
  return (
    <div className="space-y-1.5 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
      {post.platforms.map((p) => {
        const r = post.results[p];
        return (
          <div key={p} className="flex flex-wrap items-center gap-2">
            <span className="w-20 font-medium text-gray-700">{PLATFORM_LABEL[p]}</span>
            {r?.status === "published" ? (
              <>
                <span className="text-green-700">Posted{r.at ? ` ${formatDateTime(r.at)}` : ""}</span>
                {r.permalink && (
                  <a href={r.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900">
                    View <ExternalLink size={11} />
                  </a>
                )}
              </>
            ) : r?.status === "failed" ? (
              <span className="text-red-600">Failed — {r.error}</span>
            ) : (
              <span className="text-sky-700">{r?.container_id ? "Instagram is processing the video…" : "Waiting…"}</span>
            )}
          </div>
        );
      })}
      {post.status === "published" && (
        <p className="pt-1 text-xs text-gray-400">Posted content is locked. Edit or delete it on Facebook / Instagram directly.</p>
      )}
    </div>
  );
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
      {children}
    </div>
  );
}


function TextArea({
  label,
  value,
  onChange,
  rows,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        rows={rows}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
      />
      {max && <div className="text-right text-[10px] text-gray-400">{value.length}/{max}</div>}
    </Field>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx("rounded-md px-3 py-1 transition", value === o.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}

