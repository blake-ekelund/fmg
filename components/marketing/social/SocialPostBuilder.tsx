"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Package,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import clsx from "clsx";
import MediaLibraryModal from "@/components/templates/MediaLibraryModal";
import { formatDateTime } from "@/components/marketing/blog/bits";
import {
  LAYOUTS,
  SLIDES_MAX,
  TONES,
  compileCaption,
  emptyCaption,
  newSlide,
  slideProblems,
  starterDesign,
  type CaptionParts,
  type PostDesign,
  type ProductOption,
  type Slide,
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
import SlidePreview, { SlideFonts } from "./SlidePreview";

/**
 * The social post builder (/marketing/social/[id]).
 *
 * Designed posts: a strip of slides on the left, the selected slide large in
 * the middle (drawn by the same SlideView the server renders to JPEG), and
 * an inspector on the right for the slide and the caption blocks. Photo /
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
  const [design, setDesign] = useState<PostDesign | null>(null);
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState<SocialMedia[]>([]);
  const [postType, setPostType] = useState<SocialPostType>("image");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"slide" | "caption">("slide");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [busy, setBusy] = useState<null | "schedule" | "publish" | "draft" | "retry" | "delete" | "upload">(null);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | "library" | "product" | "media">(null);
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
    setDesign(p.design ?? null);
    setCaption(p.caption);
    setMedia(p.media);
    setPostType(p.post_type);
    setSelectedId((cur) => cur ?? p.design?.slides[0]?.id ?? null);
    setSaveState("saved");
  }, []);

  useEffect(() => {
    getSocialPost(id)
      .then(hydrate)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load the post."));
    getSocialStatus().then(setConn).catch(() => setConn(null));
  }, [id, hydrate]);

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

  function updateSlide(patch: Partial<Slide>) {
    if (!design || !selected) return;
    setDesign({ ...design, slides: design.slides.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)) });
  }
  function setCaptionParts(patch: Partial<CaptionParts>) {
    if (!design) return;
    setDesign({ ...design, caption: { ...design.caption, ...patch } });
  }
  function addSlide(layout: SlideLayout) {
    if (!design || design.slides.length >= SLIDES_MAX) return;
    const s = newSlide(layout, brand);
    const at = selectedIndex + 1;
    setDesign({ ...design, slides: [...design.slides.slice(0, at), s, ...design.slides.slice(at)] });
    setSelectedId(s.id);
    setTab("slide");
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
    const copy = { ...design.slides[i], id: newSlide("text", brand).id };
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
        extraAction={design ? { label: "Use my own photos instead", onClick: () => setConfirm({ kind: "photos" }) } : null}
      />

      <div className="space-y-4 px-4 pb-10 pt-4 md:px-8">
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
                  onClick={() => {
                    setSelectedId(s.id);
                    setTab("slide");
                  }}
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
            {!locked && slides.length < SLIDES_MAX && <AddSlideMenu onAdd={addSlide} />}
            {!locked && (
              <button onClick={switchToPhotos} className="block pt-2 text-left text-[11px] text-gray-400 hover:text-gray-700">
                Use my own photos instead
              </button>
            )}
          </div>

          {/* Canvas */}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            {selected && (
              <>
                <div className="overflow-hidden rounded-lg shadow-md">
                  <SlidePreview slide={selected} brand={brand} index={selectedIndex + 1} total={slides.length} width={420} />
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <button
                    onClick={() => setSelectedId(slides[Math.max(0, selectedIndex - 1)].id)}
                    disabled={selectedIndex === 0}
                    className="rounded-full p-1 hover:bg-gray-200 disabled:opacity-30"
                    aria-label="Previous slide"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  Slide {selectedIndex + 1} of {slides.length}
                  <button
                    onClick={() => setSelectedId(slides[Math.min(slides.length - 1, selectedIndex + 1)].id)}
                    disabled={selectedIndex === slides.length - 1}
                    className="rounded-full p-1 hover:bg-gray-200 disabled:opacity-30"
                    aria-label="Next slide"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </>
            )}
            {!locked && problems.length > 0 && (
              <ul className="w-full max-w-md space-y-0.5 text-xs text-amber-700">
                {problems.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Inspector */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex border-b border-gray-100 p-1">
              {(["slide", "caption"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={clsx(
                    "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                    tab === t ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-800",
                  )}
                >
                  {t === "slide" ? `Slide ${selectedIndex + 1}` : "Caption"}
                </button>
              ))}
            </div>
            <fieldset disabled={locked} className="space-y-4 p-4 disabled:opacity-70">
              {tab === "slide" && selected ? (
                <SlideInspector
                  slide={selected}
                  onChange={updateSlide}
                  onPickImage={() => setPicker("library")}
                  onPickProduct={() => setPicker("product")}
                />
              ) : (
                <CaptionInspector caption={design.caption} onChange={setCaptionParts} compiled={effectiveCaption} platforms={platforms} />
              )}
            </fieldset>
          </div>
        </div>
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

      {(picker === "library" || picker === "media") && (
        <MediaLibraryModal
          open
          onClose={() => setPicker(null)}
          onSelect={(url) => {
            if (picker === "library") updateSlide({ image: url });
            else setMedia((m) => (postType === "image" ? [{ url, kind: "image" }] : [...m, { url, kind: "image" as const }].slice(0, CAROUSEL_MAX)));
            setPicker(null);
          }}
          inbox="social-uploads"
          uploader={uploadSocialImage}
        />
      )}
      {picker === "product" && selected && (
        <ProductPicker
          brand={brand}
          onClose={() => setPicker(null)}
          onPick={(p, url) => {
            const patch: Partial<Slide> = { image: url };
            if (selected.layout === "product") {
              patch.headline = p.name;
              if (p.price != null) patch.meta = `$${p.price}`;
              if (!selected.body.trim() || selected.body === newSlide("product", brand).body) {
                patch.body = (p.blurb.match(/^[^.!?]+[.!?]/)?.[0] ?? p.blurb).slice(0, 160);
              }
            }
            updateSlide(patch);
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}

/* ─── Slide inspector ─────────────────────────────────────────────── */

const FIELD_LABELS: Record<SlideLayout, { kicker?: string; headline?: string; body?: string; meta?: string; items?: boolean; image?: boolean }> = {
  cover: { kicker: "Label", headline: "Headline", body: "Subhead", image: true },
  photo: { headline: "Caption on the photo (optional)", image: true },
  product: { kicker: "Label", headline: "Product name", body: "Benefit", meta: "Price", image: true },
  text: { kicker: "Label", headline: "Headline", body: "Text" },
  list: { kicker: "Label", headline: "Headline", items: true },
  quote: { headline: "Quote", meta: "Who said it" },
  cta: { kicker: "Label", headline: "Headline", body: "Line", meta: "Button text" },
};

function SlideInspector({
  slide: s,
  onChange,
  onPickImage,
  onPickProduct,
}: {
  slide: Slide;
  onChange: (patch: Partial<Slide>) => void;
  onPickImage: () => void;
  onPickProduct: () => void;
}) {
  const f = FIELD_LABELS[s.layout];
  return (
    <>
      <Field label="Layout">
        <div className="flex flex-wrap gap-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.value}
              type="button"
              title={l.hint}
              onClick={() => onChange({ layout: l.value })}
              className={clsx(
                "rounded-lg border px-2.5 py-1 text-xs transition",
                s.layout === l.value ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:border-gray-300",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </Field>
      {s.layout !== "photo" && (
        <Field label="Colour">
          <Segmented options={TONES} value={s.tone} onChange={(tone) => onChange({ tone })} />
        </Field>
      )}

      {f.image && (
        <Field label={s.layout === "product" ? "Product photo" : "Photo"}>
          <div className="flex items-center gap-3">
            <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
              {s.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex flex-col items-start gap-1">
              <button type="button" onClick={onPickProduct} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-gray-900">
                <Package size={13} /> Product photo
              </button>
              <button type="button" onClick={onPickImage} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-gray-900">
                <ImagePlus size={13} /> Library / Unsplash
              </button>
              {s.image && (
                <button type="button" onClick={() => onChange({ image: "" })} className="text-xs text-gray-400 hover:text-red-600">
                  Remove
                </button>
              )}
            </div>
          </div>
        </Field>
      )}

      {f.kicker && <TextInput label={f.kicker} value={s.kicker} max={40} onChange={(kicker) => onChange({ kicker })} />}
      {f.headline && (
        <TextArea label={f.headline} value={s.headline} rows={2} max={s.layout === "quote" ? 140 : 90} onChange={(headline) => onChange({ headline })} />
      )}
      {f.body && <TextArea label={f.body} value={s.body} rows={3} max={220} onChange={(body) => onChange({ body })} />}
      {f.items && (
        <Field label="Items">
          <div className="space-y-1.5">
            {s.items.map((item, i) => (
              <div key={i} className="flex gap-1.5">
                <input
                  value={item}
                  maxLength={80}
                  onChange={(e) => onChange({ items: s.items.map((x, j) => (j === i ? e.target.value : x)) })}
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onChange({ items: s.items.filter((_, j) => j !== i) })}
                  className="rounded p-1 text-gray-400 hover:text-red-600"
                  aria-label="Remove item"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {s.items.length < 5 && (
              <button
                type="button"
                onClick={() => onChange({ items: [...s.items, ""] })}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                <Plus size={12} /> Add item
              </button>
            )}
          </div>
        </Field>
      )}
      {f.meta && <TextInput label={f.meta} value={s.meta} max={60} onChange={(meta) => onChange({ meta })} />}
    </>
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
    <>
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
      <Field label="As posted">
        <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
          {compiled || <span className="text-gray-400">Nothing yet.</span>}
        </p>
        <div className="mt-1 flex gap-3 text-[11px] text-gray-400">
          <span className={clsx(ig && compiled.length > IG_CAPTION_MAX && "text-red-600")}>
            {compiled.length.toLocaleString()} / {IG_CAPTION_MAX.toLocaleString()}
          </span>
          <span className={clsx(ig && tags > IG_HASHTAG_MAX && "text-red-600")}>{tags} hashtags</span>
        </div>
      </Field>
    </>
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

function AddSlideMenu({ onAdd }: { onAdd: (l: SlideLayout) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-600 hover:border-gray-400"
      >
        <Plus size={14} /> Add slide
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-64 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          {LAYOUTS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => {
                onAdd(l.value);
                setOpen(false);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-gray-50"
            >
              <span className="block text-sm text-gray-800">{l.label}</span>
              <span className="block text-[11px] text-gray-400">{l.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

function TextInput({ label, value, onChange, max }: { label: string; value: string; onChange: (v: string) => void; max?: number }) {
  return (
    <Field label={label}>
      <input
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
      />
    </Field>
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

