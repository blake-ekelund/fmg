"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Film,
  ImagePlus,
  Loader2,
  RotateCcw,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import clsx from "clsx";
import MediaLibraryModal from "@/components/templates/MediaLibraryModal";
import { formatDateTime } from "@/components/marketing/blog/bits";
import {
  CAROUSEL_MAX,
  IG_CAPTION_MAX,
  IG_HASHTAG_MAX,
  PLATFORM_LABEL,
  POST_TYPE_LABEL,
  SOCIAL_BRANDS,
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
  createSocialPost,
  deleteSocialPost,
  publishSocialPostNow,
  updateSocialPost,
  uploadSocialImage,
  uploadSocialVideo,
  type PostFields,
} from "./api";
import { SocialStatusPill } from "./bits";

type Props = {
  post: SocialPost | null;
  defaultBrand: SocialBrand;
  connection: MetaConnectionStatus | null;
  onClose: () => void;
  onChanged: (p: SocialPost) => void;
  onDeleted: (id: string) => void;
};

/** ISO → value for <input type="datetime-local"> in the viewer's timezone. */
function toLocalInput(iso: string | null): string {
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

export default function SocialPostEditor({ post, defaultBrand, connection, onClose, onChanged, onDeleted }: Props) {
  const [saved, setSaved] = useState<SocialPost | null>(post);
  const [brand, setBrand] = useState<SocialBrand>(post?.brand ?? defaultBrand);
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(post?.platforms ?? ["instagram", "facebook"]);
  const [postType, setPostType] = useState<SocialPostType>(post?.post_type ?? "image");
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [media, setMedia] = useState<SocialMedia[]>(post?.media ?? []);
  const [when, setWhen] = useState(toLocalInput(post?.scheduled_at ?? null));

  const [busy, setBusy] = useState<null | "save" | "schedule" | "publish" | "delete" | "retry" | "upload">(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const videoInput = useRef<HTMLInputElement>(null);

  const status = saved?.status ?? "draft";
  const locked = status === "publishing" || status === "published" || status === "partial";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !pickerOpen && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pickerOpen]);

  const fields: PostFields = useMemo(
    () => ({ brand, platforms, post_type: postType, caption, media, scheduled_at: fromLocalInput(when) }),
    [brand, platforms, postType, caption, media, when],
  );
  const problems = useMemo(() => validatePost({ brand, platforms, post_type: postType, caption, media }), [
    brand,
    platforms,
    postType,
    caption,
    media,
  ]);

  const brandConn = connection?.brands.find((b) => b.brand === brand);
  const hashtags = countHashtags(caption);

  /* ── Media ─────────────────────────────────────────────── */

  function changeType(t: SocialPostType) {
    setPostType(t);
    // Keep what still fits the new type.
    setMedia((m) => {
      if (t === "reel") return m.filter((x) => x.kind === "video").slice(0, 1);
      const imgs = m.filter((x) => x.kind === "image");
      return t === "image" ? imgs.slice(0, 1) : imgs.slice(0, CAROUSEL_MAX);
    });
  }

  function addImage(url: string) {
    const item: SocialMedia = { url, kind: "image" };
    setMedia((m) => (postType === "image" ? [item] : [...m, item].slice(0, CAROUSEL_MAX)));
    setPickerOpen(false);
  }

  async function onVideo(file: File | undefined) {
    if (!file) return;
    setBusy("upload");
    setError(null);
    try {
      const url = await uploadSocialVideo(file);
      setMedia([{ url, kind: "video" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
      if (videoInput.current) videoInput.current.value = "";
    }
  }

  function move(i: number, dir: -1 | 1) {
    setMedia((m) => {
      const j = i + dir;
      if (j < 0 || j >= m.length) return m;
      const next = [...m];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  /* ── Actions ───────────────────────────────────────────── */

  async function ensureSaved(): Promise<SocialPost> {
    if (saved) return saved;
    const created = await createSocialPost(fields);
    setSaved(created);
    onChanged(created);
    return created;
  }

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<SocialPost | void>) {
    setBusy(kind);
    setError(null);
    try {
      const p = await fn();
      if (p) {
        setSaved(p);
        onChanged(p);
      }
      return p;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const saveDraft = () =>
    run("save", async () => {
      const p = await ensureSaved();
      return updateSocialPost(p.id, { ...fields, ...(p.status === "scheduled" ? { action: "draft" } : {}) });
    });

  const schedule = () =>
    run("schedule", async () => {
      const p = await ensureSaved();
      const out = await updateSocialPost(p.id, { ...fields, action: "schedule" });
      onClose();
      return out;
    });

  const publishNow = () => {
    const where = platforms.map((p) => PLATFORM_LABEL[p]).join(" and ");
    if (!window.confirm(`Post this to ${brand}'s ${where} right now?`)) return;
    run("publish", async () => {
      const p = await ensureSaved();
      return publishSocialPostNow(p.id, fields);
    });
  };

  const retry = () => run("retry", async () => updateSocialPost(saved!.id, { action: "retry" }));

  const remove = () => {
    if (!saved) return onClose();
    const live = saved.status === "published" || saved.status === "partial";
    const msg = live
      ? "Remove this from the list? It stays up on Facebook / Instagram — delete it there if you want it gone."
      : "Delete this post?";
    if (!window.confirm(msg)) return;
    run("delete", async () => {
      await deleteSocialPost(saved.id);
      onDeleted(saved.id);
    });
  };

  const whenIso = fromLocalInput(when);
  const whenInPast = whenIso ? new Date(whenIso).getTime() < Date.now() - 60_000 : false;

  /* ── Render ────────────────────────────────────────────── */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">{saved ? "Social post" : "New social post"}</h2>
          {saved && <SocialStatusPill status={status} />}
          <button onClick={onClose} className="ml-auto rounded-full p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto p-5 md:grid-cols-[1fr_320px]">
          {/* Form */}
          <div className="space-y-5">
            {locked && saved && <Results post={saved} />}

            <fieldset disabled={locked} className="space-y-5 disabled:opacity-70">
              <Field label="Brand">
                <Segmented
                  options={SOCIAL_BRANDS.map((b) => ({ value: b, label: b }))}
                  value={brand}
                  onChange={setBrand}
                />
              </Field>

              <Field label="Post to">
                <div className="flex flex-wrap gap-2">
                  {SOCIAL_PLATFORMS.map((p) => {
                    const on = platforms.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPlatforms((cur) => (on ? cur.filter((x) => x !== p) : [...cur, p]))}
                        className={clsx(
                          "rounded-lg border px-3 py-1.5 text-sm transition",
                          on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:border-gray-300",
                        )}
                      >
                        {PLATFORM_LABEL[p]}
                      </button>
                    );
                  })}
                </div>
                {brandConn && !brandConn.ok && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-700">
                    <AlertTriangle size={12} /> {brandConn.error}
                  </p>
                )}
              </Field>

              <Field label="Type">
                <Segmented
                  options={SOCIAL_POST_TYPES.map((t) => ({ value: t, label: POST_TYPE_LABEL[t] }))}
                  value={postType}
                  onChange={changeType}
                />
              </Field>

              <Field
                label={postType === "reel" ? "Video" : postType === "carousel" ? `Images (${media.length}/${CAROUSEL_MAX})` : "Image"}
              >
                <div className="flex flex-wrap gap-2">
                  {media.map((m, i) => (
                    <div key={`${m.url}-${i}`} className="group relative h-24 w-24 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                      {m.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <video src={m.url} className="h-full w-full object-cover" muted />
                      )}
                      {!locked && (
                        <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 px-1 py-0.5 opacity-0 transition group-hover:opacity-100">
                          <button type="button" onClick={() => move(i, -1)} className="text-white disabled:opacity-30" disabled={i === 0} aria-label="Move left">
                            <ChevronLeft size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMedia((cur) => cur.filter((_, j) => j !== i))}
                            className="text-white"
                            aria-label="Remove"
                          >
                            <X size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(i, 1)}
                            className="text-white disabled:opacity-30"
                            disabled={i === media.length - 1}
                            aria-label="Move right"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {postType === "reel" ? (
                    media.length === 0 && (
                      <button
                        type="button"
                        onClick={() => videoInput.current?.click()}
                        disabled={busy === "upload"}
                        className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-400"
                      >
                        {busy === "upload" ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                        {busy === "upload" ? "Uploading…" : "Upload video"}
                      </button>
                    )
                  ) : (
                    (postType === "carousel" ? media.length < CAROUSEL_MAX : media.length === 0) && (
                      <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-400"
                      >
                        <ImagePlus size={18} />
                        Add image
                      </button>
                    )
                  )}
                </div>
                <input
                  ref={videoInput}
                  type="file"
                  accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
                  className="hidden"
                  onChange={(e) => onVideo(e.target.files?.[0])}
                />
                {platforms.includes("instagram") && postType !== "reel" && (
                  <p className="mt-1.5 text-xs text-gray-400">
                    Instagram needs 4:5 to 1.91:1 — anything taller or wider is padded with white (never cropped).
                    {postType === "carousel" && " Every slide takes the first slide's shape."}
                  </p>
                )}
                {postType === "reel" && (
                  <p className="mt-1.5 text-xs text-gray-400">MP4 or MOV, vertical 9:16 works best, 3 s – 15 min.</p>
                )}
              </Field>

              <Field label="Caption">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={7}
                  placeholder="Write the caption — hashtags and @mentions go right in the text."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                />
                <div className="mt-1 flex gap-3 text-[11px] text-gray-400">
                  <span className={clsx(caption.length > IG_CAPTION_MAX && platforms.includes("instagram") && "text-red-600")}>
                    {caption.length.toLocaleString()} / {IG_CAPTION_MAX.toLocaleString()}
                  </span>
                  <span className={clsx(hashtags > IG_HASHTAG_MAX && "text-red-600")}>
                    {hashtags} hashtag{hashtags === 1 ? "" : "s"}
                  </span>
                </div>
              </Field>

              <Field label="When">
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
                />
                {whenInPast && <p className="mt-1 text-xs text-amber-700">That time has passed — scheduling posts it within 5 minutes.</p>}
              </Field>
            </fieldset>

            {!locked && problems.length > 0 && (media.length > 0 || caption) && (
              <ul className="space-y-0.5 text-xs text-gray-500">
                {problems.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
            )}
            {saved?.status === "failed" && saved.last_error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Last try failed: {saved.last_error}
              </div>
            )}
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          </div>

          {/* Preview */}
          <Preview brand={brand} handle={brandConn?.instagram?.username ?? null} postType={postType} media={media} caption={caption} />
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3">
          {saved && (
            <button
              onClick={remove}
              disabled={!!busy || status === "publishing"}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 size={14} /> {status === "published" || status === "partial" ? "Remove" : "Delete"}
            </button>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {locked ? (
              status === "partial" && (
                <Btn onClick={retry} busy={busy === "retry"} icon={<RotateCcw size={14} />}>
                  Retry failed
                </Btn>
              )
            ) : (
              <>
                <Btn onClick={saveDraft} busy={busy === "save"} disabled={!!busy} variant="ghost">
                  {status === "scheduled" ? "Unschedule" : "Save draft"}
                </Btn>
                <Btn onClick={schedule} busy={busy === "schedule"} disabled={!!busy || problems.length > 0 || !whenIso}>
                  {status === "scheduled" ? "Update schedule" : "Schedule"}
                </Btn>
                <Btn
                  onClick={publishNow}
                  busy={busy === "publish"}
                  disabled={!!busy || problems.length > 0 || connection?.configured === false}
                  icon={<Send size={14} />}
                  variant="dark"
                >
                  {status === "failed" ? "Try again now" : "Publish now"}
                </Btn>
              </>
            )}
          </div>
        </div>
      </div>

      {pickerOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <MediaLibraryModal
            open
            onClose={() => setPickerOpen(false)}
            onSelect={(url) => addImage(url)}
            inbox="social-uploads"
            uploader={uploadSocialImage}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Pieces ─────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-md px-3 py-1 transition",
            value === o.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Btn({
  children,
  onClick,
  busy,
  disabled,
  icon,
  variant = "outline",
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  variant?: "outline" | "dark" | "ghost";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40",
        variant === "dark" && "bg-gray-900 text-white hover:bg-gray-800",
        variant === "outline" && "border border-gray-200 text-gray-800 hover:bg-gray-50",
        variant === "ghost" && "text-gray-600 hover:bg-gray-100",
      )}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

function Results({ post }: { post: SocialPost }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
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

function Preview({
  brand,
  handle,
  postType,
  media,
  caption,
}: {
  brand: SocialBrand;
  handle: string | null;
  postType: SocialPostType;
  media: SocialMedia[];
  caption: string;
}) {
  const [slide, setSlide] = useState(0);
  const current = media[Math.min(slide, Math.max(0, media.length - 1))];
  const name = handle ?? (brand === "NI" ? "naturalinspirations" : "sassy");

  return (
    <div className="md:sticky md:top-0">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">Preview</div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className={clsx("h-7 w-7 rounded-full", brand === "NI" ? "bg-blue-100" : "bg-pink-100")} />
          <span className="text-xs font-semibold text-gray-900">{name}</span>
        </div>
        <div className={clsx("relative flex items-center justify-center bg-gray-100", postType === "reel" ? "aspect-[9/16]" : "aspect-[4/5]")}>
          {!current ? (
            <span className="text-xs text-gray-400">{postType === "reel" ? <Film size={24} /> : "No image yet"}</span>
          ) : current.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <video src={current.url} className="h-full w-full object-cover" controls muted />
          )}
          {media.length > 1 && (
            <>
              <button
                onClick={() => setSlide((s) => Math.max(0, s - 1))}
                className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-0.5"
                aria-label="Previous"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setSlide((s) => Math.min(media.length - 1, s + 1))}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-0.5"
                aria-label="Next"
              >
                <ChevronRight size={16} />
              </button>
              <div className="absolute bottom-2 flex gap-1">
                {media.map((_, i) => (
                  <span key={i} className={clsx("h-1.5 w-1.5 rounded-full", i === slide ? "bg-white" : "bg-white/50")} />
                ))}
              </div>
            </>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words px-3 py-2.5 text-xs text-gray-800">
          <span className="font-semibold">{name}</span> {caption || <span className="text-gray-400">Caption…</span>}
        </p>
      </div>
    </div>
  );
}
