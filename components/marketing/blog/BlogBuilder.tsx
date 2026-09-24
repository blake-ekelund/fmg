"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Columns2,
  Copy,
  Heading,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  Minus,
  MousePointerClick,
  Package,
  PanelTop,
  Pilcrow,
  Plus,
  Quote,
  Rows2,
  Settings2,
  Trash2,
  Upload,
} from "lucide-react";
import clsx from "clsx";
import { resolveHeroUrl, type BlogBrand } from "@/lib/blogPosts";
import {
  BLOG_FORMATS,
  SECTION_LAYOUTS,
  appendBlogBlock,
  appendToColumn,
  createBlock,
  createSection,
  duplicateBlogBlock,
  enforceFormat,
  findBlogBlock,
  insertBlogBlock,
  isLocked,
  moveBlogBlock,
  moveBlogBlockToColumn,
  newBlogId,
  nudgeBlogBlock,
  parentSection,
  removeBlogBlock,
  updateBlogBlock,
  type BlogBlock,
  type BlogContentBlock,
  type SectionLayout,
} from "@/lib/blog/blocks";
import { renderBlogBlocks } from "@/lib/blog/render";
import MediaLibraryModal from "@/components/templates/MediaLibraryModal";
import RichTextEditor from "./RichTextEditor";
import { NI_BODY, SASSY_BODY } from "./StorefrontPreview";
import { uploadBlogImage, uploadBlogImageResult } from "./api";

/**
 * The blog builder: palette on the left, the post in its brand format in the
 * middle, and a right rail that switches between the selected block and the
 * post's settings (the caller's publishing rail).
 *
 * The canvas is the real compiled HTML (lib/blog/render.ts in editor mode)
 * styled with the storefront's article classes, so what you arrange is what
 * the site shows. Selection and drag-and-drop are delegated off data-bb /
 * data-bb-col markers — the same approach as the email canvas, minus the
 * iframe, since the blog has no email-client quirks to isolate.
 *
 * What the format forbids, the builder simply can't do: there are no style
 * controls; the intro (and Sassy's closing) can't be moved or deleted and
 * nothing lands before/after them; sections only go at the top level.
 */

type Payload =
  | { kind: "move"; id: string; isSection: boolean }
  | { kind: "new"; make: () => BlogBlock; isSection: boolean };

type DropTarget =
  | { kind: "block"; id: string; pos: "before" | "after" }
  | { kind: "column"; id: string }
  | null;

type Props = {
  brand: BlogBrand;
  blocks: BlogBlock[];
  onChange: (blocks: BlogBlock[]) => void;
  header: { title: string; tags: string[]; heroUrl: string; dateLabel: string };
  /** The post-settings / publishing rail, shown in the "Post" tab. */
  rail: ReactNode;
  onError: (message: string) => void;
};

const CONTENT_PALETTE: { type: BlogContentBlock["type"]; label: string; icon: typeof Heading }[] = [
  { type: "heading", label: "Heading", icon: Heading },
  { type: "paragraph", label: "Paragraph", icon: Pilcrow },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "list", label: "List", icon: List },
  { type: "quote", label: "Quote", icon: Quote },
  { type: "button", label: "Button", icon: MousePointerClick },
  { type: "product", label: "Product", icon: Package },
  { type: "divider", label: "Divider", icon: Minus },
];

const SECTION_ICONS: Record<SectionLayout, typeof Heading> = {
  imageText: Columns2,
  textImage: Columns2,
  twoColumn: Rows2,
  gallery: LayoutGrid,
  callout: PanelTop,
};

const TYPE_LABEL: Record<BlogBlock["type"], string> = {
  intro: "Intro",
  heading: "Heading",
  paragraph: "Paragraph",
  list: "List",
  quote: "Quote",
  image: "Image",
  button: "Button",
  product: "Product",
  divider: "Divider",
  closing: "Shop the story",
  section: "Section",
};

export default function BlogBuilder({ brand, blocks, onChange, header, rail, onError }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"block" | "post">("post");
  const [drop, setDrop] = useState<DropTarget>(null);
  const [uploading, setUploading] = useState(false);
  const dragRef = useRef<Payload | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const selected = selectedId ? findBlogBlock(blocks, selectedId) : undefined;
  const html = useMemo(() => renderBlogBlocks(blocks, brand, { editor: true }), [blocks, brand]);

  const commit = useCallback(
    (next: BlogBlock[], select?: string) => {
      onChange(enforceFormat(brand, next));
      if (select) {
        setSelectedId(select);
        setTab("block");
      }
    },
    [brand, onChange],
  );

  function select(id: string | null) {
    setSelectedId(id);
    setTab(id ? "block" : "post");
  }

  /* ── Adding ── */

  /** Click-to-add: after the selection when that makes sense, else at the end. */
  function add(block: BlogBlock) {
    let next: BlogBlock[] | null = null;
    if (selected && selected.type !== "closing") {
      const nestedIn = parentSection(blocks, selected.id);
      if (nestedIn && block.type === "section") next = insertBlogBlock(blocks, block, nestedIn.id, "after");
      else next = insertBlogBlock(blocks, block, selected.id, "after");
      if (next === blocks) next = null;
    }
    commit(next ?? appendBlogBlock(blocks, block), block.id);
  }

  /* ── Canvas drag & drop ── */

  function targetFrom(e: React.DragEvent): DropTarget {
    const payload = dragRef.current;
    const hit = (e.target as Element).closest?.("[data-bb]") as HTMLElement | null;
    if (!hit || !canvasRef.current?.contains(hit)) return null;
    let blockEl: HTMLElement = hit;

    const wantsTop = payload?.isSection ?? false;
    if (wantsTop) {
      // Sections only land between top-level blocks.
      let up = blockEl.parentElement?.closest("[data-bb]") as HTMLElement | null;
      while (up && canvasRef.current.contains(up)) {
        blockEl = up;
        up = blockEl.parentElement?.closest("[data-bb]") as HTMLElement | null;
      }
    } else if (blockEl.dataset.bbType === "section") {
      // Over a section's column but not on a block in it → append to that column.
      const col = (e.target as Element).closest("[data-bb-col]") as HTMLElement | null;
      if (col && blockEl.contains(col)) return { kind: "column", id: col.dataset.bbCol! };
    }

    const id = blockEl.dataset.bb!;
    if (payload?.kind === "move" && payload.id === id) return null;
    const r = blockEl.getBoundingClientRect();
    return { kind: "block", id, pos: e.clientY < r.top + r.height / 2 ? "before" : "after" };
  }

  function onDragStart(e: React.DragEvent) {
    const el = (e.target as Element).closest?.("[data-bb]") as HTMLElement | null;
    if (!el || el.getAttribute("draggable") !== "true") {
      e.preventDefault();
      return;
    }
    const id = el.dataset.bb!;
    dragRef.current = { kind: "move", id, isSection: el.dataset.bbType === "section" };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `blog-block:${id}`);
  }

  function onDragOver(e: React.DragEvent) {
    const files = e.dataTransfer.types.includes("Files");
    if (!dragRef.current && !files) return;
    e.preventDefault();
    const t = targetFrom(e);
    setDrop((cur) => (JSON.stringify(cur) === JSON.stringify(t) ? cur : t));
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const target = targetFrom(e);
    const payload = dragRef.current;
    dragRef.current = null;
    setDrop(null);

    // Image files from the desktop → upload at full size, drop in as image blocks.
    const files = Array.from(e.dataTransfer.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!payload && files.length) {
      setUploading(true);
      try {
        let next = blocks;
        let lastId: string | undefined;
        for (const f of files) {
          const src = await uploadBlogImage(f);
          const block: BlogContentBlock = { id: newBlogId(), type: "image", src, alt: "", caption: "" };
          next = placeAt(next, block, target, lastId);
          lastId = block.id;
        }
        commit(next, lastId);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
      return;
    }
    if (!payload) return;

    if (payload.kind === "move") {
      if (!target) return;
      const next =
        target.kind === "column"
          ? moveBlogBlockToColumn(blocks, payload.id, target.id)
          : moveBlogBlock(blocks, payload.id, target.id, target.pos);
      commit(next, payload.id);
      return;
    }
    const block = payload.make();
    commit(placeAt(blocks, block, target), block.id);
  }

  /** Insert at a drop target; `after` chains multi-file drops in order. */
  function placeAt(list: BlogBlock[], block: BlogBlock, target: DropTarget, after?: string): BlogBlock[] {
    if (after) {
      const n = insertBlogBlock(list, block, after, "after");
      if (n !== list) return n;
    }
    if (target?.kind === "column" && block.type !== "section" && block.type !== "intro" && block.type !== "closing") {
      return appendToColumn(list, target.id, block);
    }
    if (target?.kind === "block") {
      const n = insertBlogBlock(list, block, target.id, target.pos);
      if (n !== list) return n;
    }
    return appendBlogBlock(list, block);
  }

  function onCanvasClick(e: React.MouseEvent) {
    const el = e.target as Element;
    if (el.closest("a")) e.preventDefault(); // links are content here, not navigation
    const hit = el.closest("[data-bb]") as HTMLElement | null;
    select(hit?.dataset.bb ?? null);
  }

  // Delete / Escape / arrows on the selected block when focus isn't in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const a = document.activeElement;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || (a as HTMLElement).isContentEditable)) return;
      if (!selectedId) return;
      if (e.key === "Escape") select(null);
      else if (e.key === "Delete" || e.key === "Backspace") {
        const b = findBlogBlock(blocks, selectedId);
        if (b && !isLocked(b)) {
          e.preventDefault();
          commit(removeBlogBlock(blocks, selectedId));
          select(null);
        }
      } else if (e.key === "ArrowUp" && e.altKey) {
        e.preventDefault();
        commit(nudgeBlogBlock(blocks, selectedId, -1));
      } else if (e.key === "ArrowDown" && e.altKey) {
        e.preventDefault();
        commit(nudgeBlogBlock(blocks, selectedId, 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const canvasCss = useMemo(() => {
    const rules = [
      `.bb-canvas [data-bb]{cursor:pointer;border-radius:8px;outline:1px dashed transparent;outline-offset:6px;transition:outline-color .12s}`,
      `.bb-canvas [data-bb]:hover{outline-color:#c7d2fe}`,
      `.bb-canvas [data-bb][draggable="true"]{cursor:grab}`,
      `.bb-canvas [data-bb-col]{min-height:56px}`,
      `.bb-canvas [data-bb-col]:empty{border:1px dashed #d1d5db;border-radius:12px}`,
      `.bb-canvas [data-bb-col]:empty::before{content:"Drop blocks here";display:block;padding:18px;text-align:center;font-size:12px;color:#9ca3af}`,
      `.bb-canvas.bb-ni [data-bb-type="intro"] p{font-size:1.125rem}`,
      `.bb-canvas.bb-ni [data-bb-type="intro"] > p:first-child{margin-top:0}`,
    ];
    if (selectedId) rules.push(`.bb-canvas [data-bb="${selectedId}"]{outline:2px solid #6366f1 !important}`);
    if (drop?.kind === "block") {
      rules.push(
        `.bb-canvas [data-bb="${drop.id}"]{box-shadow:0 ${drop.pos === "before" ? "-4px" : "4px"} 0 0 #6366f1}`,
      );
    }
    if (drop?.kind === "column") rules.push(`.bb-canvas [data-bb-col="${drop.id}"]{outline:2px dashed #6366f1;outline-offset:4px;border-radius:12px}`);
    return rules.join("\n");
  }, [selectedId, drop]);

  const hero = resolveHeroUrl(brand, header.heroUrl);
  const format = BLOG_FORMATS[brand];

  return (
    <div className="grid min-h-[calc(100vh-57px)] md:grid-cols-[220px_minmax(0,1fr)_340px]">
      {/* Palette */}
      <aside className="space-y-5 border-b border-gray-100 bg-gray-50/60 p-4 md:sticky md:top-[57px] md:h-[calc(100vh-57px)] md:overflow-y-auto md:border-b-0 md:border-r">
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Blocks</h3>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {CONTENT_PALETTE.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                draggable
                onDragStart={(e) => {
                  dragRef.current = { kind: "new", make: () => createBlock(type), isSection: false };
                  e.dataTransfer.effectAllowed = "copy";
                  e.dataTransfer.setData("text/plain", `blog-new:${type}`);
                }}
                onDragEnd={() => {
                  dragRef.current = null;
                  setDrop(null);
                }}
                onClick={() => add(createBlock(type))}
                title="Click to add, or drag onto the post"
                className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-2.5 text-[11px] font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Sections</h3>
          <div className="mt-2 space-y-1.5">
            {SECTION_LAYOUTS.map(({ layout, label, hint }) => {
              const Icon = SECTION_ICONS[layout];
              return (
                <button
                  key={layout}
                  draggable
                  onDragStart={(e) => {
                    dragRef.current = { kind: "new", make: () => createSection(layout), isSection: true };
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData("text/plain", `blog-section:${layout}`);
                  }}
                  onDragEnd={() => {
                    dragRef.current = null;
                    setDrop(null);
                  }}
                  onClick={() => add(createSection(layout))}
                  title={hint}
                  className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-left text-[11px] font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                >
                  <Icon size={14} className={clsx("shrink-0", layout === "textImage" && "scale-x-[-1]")} />
                  <span className="min-w-0">
                    <span className="block">{label}</span>
                    <span className="block truncate text-[10px] font-normal text-gray-400">{hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-700">
            <Lock size={11} /> {format.label} format
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{format.rules}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
            Drop image files straight onto the post to upload them.
          </p>
        </div>
      </aside>

      {/* Canvas */}
      <div className="min-w-0 bg-white" onClick={(e) => e.target === e.currentTarget && select(null)}>
        <style>{canvasCss}</style>
        <article className="mx-auto max-w-3xl px-6 py-10">
          <button
            type="button"
            onClick={() => select(null)}
            title="Title, tags, and hero are set in Post settings"
            className="block w-full rounded-lg text-left outline-offset-4 hover:outline hover:outline-1 hover:outline-dashed hover:outline-gray-300"
          >
            {brand === "NI" ? (
              <>
                {header.tags[0] ? (
                  <span className="block text-xs font-medium uppercase tracking-[0.3em] text-[#A8895A]">{header.tags[0]}</span>
                ) : null}
                <h1 className="mt-3 text-balance font-serif text-4xl font-medium leading-[1.1] text-[#1F3D35] md:text-5xl">
                  {header.title || "Untitled post"}
                </h1>
                <div className="mt-4 text-[11px] uppercase tracking-[0.25em] text-[#6b6b6b]">{header.dateLabel}</div>
              </>
            ) : (
              <>
                <span className="block text-[11px] uppercase tracking-[0.25em] text-[#1a1a1a]/45">{header.dateLabel}</span>
                <h1 className="mt-2 text-balance text-4xl font-black uppercase leading-[0.95] tracking-tight text-[#1a1a1a] md:text-5xl">
                  {header.title || "Untitled post"}
                </h1>
                {header.tags.length > 0 ? (
                  <span className="mt-4 flex flex-wrap gap-2">
                    {header.tags.map((t) => (
                      <span key={t} className="rounded-full bg-[#F1E6E4]/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1a1a1a]/65">
                        {t}
                      </span>
                    ))}
                  </span>
                ) : null}
              </>
            )}
            {hero ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero} alt="" className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover" />
            ) : (
              <span className="mt-8 flex h-28 w-full items-center justify-center rounded-2xl border border-dashed border-gray-200 text-xs text-gray-400">
                No hero image — add one in Post settings
              </span>
            )}
          </button>

          <div
            ref={canvasRef}
            className={clsx("bb-canvas", brand === "NI" ? `${NI_BODY} bb-ni` : SASSY_BODY)}
            onClick={onCanvasClick}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={(e) => {
              if (!canvasRef.current?.contains(e.relatedTarget as Node)) setDrop(null);
            }}
            onDrop={onDrop}
            onDragEnd={() => {
              dragRef.current = null;
              setDrop(null);
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {uploading ? (
            <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 size={13} className="animate-spin" /> Uploading images…
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => add(createBlock("paragraph"))}
            className="mt-8 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-200 py-3 text-xs font-medium text-gray-400 transition hover:border-gray-300 hover:text-gray-600"
          >
            <Plus size={13} /> Add a paragraph
          </button>
        </article>
      </div>

      {/* Right rail */}
      <aside className="border-t border-gray-100 md:sticky md:top-[57px] md:h-[calc(100vh-57px)] md:overflow-y-auto md:border-l md:border-t-0">
        <div className="sticky top-0 z-[1] flex gap-1 border-b border-gray-100 bg-white p-2">
          {(
            [
              ["block", "Block", <Settings2 key="b" size={12} />],
              ["post", "Post settings", <PanelTop key="p" size={12} />],
            ] as const
          ).map(([value, label, icon]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={clsx(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition",
                tab === value ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100",
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === "post" ? (
            rail
          ) : selected ? (
            <BlockInspector
              key={selected.id}
              brand={brand}
              block={selected}
              blocks={blocks}
              onUpdate={(b) => commit(updateBlogBlock(blocks, b))}
              onRemove={() => {
                commit(removeBlogBlock(blocks, selected.id));
                select(null);
              }}
              onDuplicate={() => commit(duplicateBlogBlock(blocks, selected.id))}
              onMove={(dir) => commit(nudgeBlogBlock(blocks, selected.id, dir))}
              onSelectParent={(id) => select(id)}
              onError={onError}
            />
          ) : (
            <p className="py-10 text-center text-xs text-gray-400">
              Click a block in the post to edit it, or add one from the left.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ─── Inspector ─── */

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-[11px] font-medium text-gray-500">
      {label}
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-1 block text-[11px] font-normal text-gray-400">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10";

function BlockInspector({
  brand,
  block,
  blocks,
  onUpdate,
  onRemove,
  onDuplicate,
  onMove,
  onSelectParent,
  onError,
}: {
  brand: BlogBrand;
  block: BlogBlock;
  blocks: BlogBlock[];
  onUpdate: (b: BlogBlock) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  onSelectParent: (id: string) => void;
  onError: (m: string) => void;
}) {
  const locked = isLocked(block);
  const parent = parentSection(blocks, block.id);
  const set = <K extends string>(patch: Record<K, unknown>) => onUpdate({ ...block, ...patch } as BlogBlock);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
            {locked ? <Lock size={12} className="text-gray-400" /> : null}
            {TYPE_LABEL[block.type]}
            {block.type === "section" ? (
              <span className="font-normal text-gray-400">· {SECTION_LAYOUTS.find((l) => l.layout === block.layout)?.label}</span>
            ) : null}
          </div>
          {parent ? (
            <button onClick={() => onSelectParent(parent.id)} className="text-[11px] text-blue-600 hover:text-blue-800">
              ← Select its section
            </button>
          ) : null}
        </div>
        {!locked ? (
          <div className="flex items-center gap-0.5">
            <IconBtn label="Move up (Alt+↑)" onClick={() => onMove(-1)}><ArrowUp size={13} /></IconBtn>
            <IconBtn label="Move down (Alt+↓)" onClick={() => onMove(1)}><ArrowDown size={13} /></IconBtn>
            <IconBtn label="Duplicate" onClick={onDuplicate}><Copy size={13} /></IconBtn>
            <IconBtn label="Delete (Del)" onClick={onRemove} danger><Trash2 size={13} /></IconBtn>
          </div>
        ) : null}
      </div>

      {locked ? (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-500">
          {block.type === "intro"
            ? `Every ${brand} post opens with this. Edit the words; it stays first.`
            : "Every Sassy post ends with this. Edit the words and link; it stays last."}
        </p>
      ) : null}

      {(block.type === "intro" || block.type === "paragraph") && (
        <RichTextEditor inline value={block.html} onChange={(html) => set({ html })} placeholder="Write…" />
      )}

      {block.type === "heading" && (
        <>
          <Field label="Text">
            <input className={inputCls} value={block.text} onChange={(e) => set({ text: e.target.value })} />
          </Field>
          <Field label="Level" hint="H2 starts a new part of the post; H3 is a point within one.">
            <Segmented
              value={String(block.level)}
              options={[["2", "H2 — section"], ["3", "H3 — sub-point"]]}
              onChange={(v) => set({ level: v === "3" ? 3 : 2 })}
            />
          </Field>
        </>
      )}

      {block.type === "list" && (
        <>
          <Field label="Style">
            <Segmented
              value={block.ordered ? "ol" : "ul"}
              options={[["ul", "Bullets"], ["ol", "Numbered"]]}
              onChange={(v) => set({ ordered: v === "ol" })}
            />
          </Field>
          <Field label="Items" hint="One per line. <strong> and <em> are allowed.">
            <textarea
              className={`${inputCls} min-h-[140px]`}
              value={block.items.join("\n")}
              onChange={(e) => set({ items: e.target.value.split("\n") })}
            />
          </Field>
        </>
      )}

      {block.type === "quote" && (
        <>
          <Field label="Quote">
            <textarea className={`${inputCls} min-h-[90px]`} value={block.text} onChange={(e) => set({ text: e.target.value })} />
          </Field>
          <Field label="Attribution" hint="Optional — e.g. a customer's first name.">
            <input className={inputCls} value={block.cite} onChange={(e) => set({ cite: e.target.value })} />
          </Field>
        </>
      )}

      {block.type === "image" && (
        <>
          <ImageField value={block.src} onChange={(src) => set({ src })} onError={onError} />
          <Field label="Alt text" hint="Describe the photo for screen readers and Google.">
            <input className={inputCls} value={block.alt} onChange={(e) => set({ alt: e.target.value })} />
          </Field>
          <Field label="Caption" hint="Optional line under the photo.">
            <input className={inputCls} value={block.caption} onChange={(e) => set({ caption: e.target.value })} />
          </Field>
        </>
      )}

      {block.type === "button" && (
        <>
          <Field label="Button text">
            <input className={inputCls} value={block.text} onChange={(e) => set({ text: e.target.value })} />
          </Field>
          <Field label="Link" hint="A site path like /shop or a full https:// URL.">
            <input className={inputCls} value={block.url} onChange={(e) => set({ url: e.target.value })} />
          </Field>
        </>
      )}

      {block.type === "product" && (
        <>
          <ImageField value={block.imageUrl} onChange={(imageUrl) => set({ imageUrl })} onError={onError} />
          <Field label="Name">
            <input className={inputCls} value={block.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Blurb">
            <textarea className={`${inputCls} min-h-[70px]`} value={block.blurb} onChange={(e) => set({ blurb: e.target.value })} />
          </Field>
          <Field label="Price" hint="Optional. Leave blank if it may change.">
            <input className={inputCls} value={block.price} onChange={(e) => set({ price: e.target.value })} />
          </Field>
          <Field label="Link">
            <input className={inputCls} value={block.url} onChange={(e) => set({ url: e.target.value })} />
          </Field>
        </>
      )}

      {block.type === "divider" && <p className="text-xs text-gray-400">A quiet rule between parts of the post.</p>}

      {block.type === "closing" && (
        <>
          <Field label="Heading">
            <input className={inputCls} value={block.heading} onChange={(e) => set({ heading: e.target.value })} />
          </Field>
          <Field label="Line">
            <textarea className={`${inputCls} min-h-[70px]`} value={block.text} onChange={(e) => set({ text: e.target.value })} />
          </Field>
          <Field label="Button text">
            <input className={inputCls} value={block.buttonText} onChange={(e) => set({ buttonText: e.target.value })} />
          </Field>
          <Field label="Link">
            <input className={inputCls} value={block.url} onChange={(e) => set({ url: e.target.value })} />
          </Field>
        </>
      )}

      {block.type === "section" && (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-gray-500">
            Click a block inside the section to edit it. Drag blocks in from the left, or between columns.
            Side-by-side columns stack on phones.
          </p>
          {(block.layout === "imageText" || block.layout === "textImage") && (
            <button
              onClick={() =>
                onUpdate({
                  ...block,
                  layout: block.layout === "imageText" ? "textImage" : "imageText",
                  columns: [...block.columns].reverse(),
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeftRight size={13} /> Swap sides
            </button>
          )}
          {block.layout === "gallery" && (
            <div className="flex gap-2">
              <button
                disabled={block.columns.length >= 3}
                onClick={() =>
                  onUpdate({ ...block, columns: [...block.columns, { id: newBlogId(), blocks: [createBlock("image")] }] })
                }
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Add a photo
              </button>
              <button
                disabled={block.columns.length <= 2}
                onClick={() => onUpdate({ ...block, columns: block.columns.slice(0, -1) })}
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Remove the last
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={clsx(
        "rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100",
        danger ? "hover:text-red-600" : "hover:text-gray-700",
      )}
    >
      {children}
    </button>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={clsx(
            "flex-1 rounded-md px-2 py-1 text-xs font-medium transition",
            value === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Image picker: the Image Library (browse or upload several at once), a
 *  direct upload, or a pasted URL. Uploads keep full resolution. */
export function ImageField({
  value,
  onChange,
  onError,
  label = "Image",
}: {
  value: string;
  onChange: (url: string) => void;
  onError: (m: string) => void;
  label?: string;
}) {
  const [library, setLibrary] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    try {
      onChange(await uploadBlogImage(file));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="text-[11px] font-medium text-gray-500">
      {label}
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="mt-1 aspect-[16/10] w-full rounded-lg border border-gray-100 object-cover" />
      ) : (
        <div className="mt-1 flex aspect-[16/10] w-full items-center justify-center rounded-lg border border-dashed border-gray-200 text-gray-300">
          <ImageIcon size={22} />
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setLibrary(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <ImageIcon size={13} /> Library
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload
        </button>
        {value ? (
          <button type="button" onClick={() => onChange("")} className="ml-auto text-xs font-normal text-gray-400 hover:text-gray-700">
            Remove
          </button>
        ) : null}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="…or paste an image URL"
        className={`${inputCls} mt-2 text-xs`}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <MediaLibraryModal
        open={library}
        onClose={() => setLibrary(false)}
        onSelect={(url) => {
          onChange(url);
          setLibrary(false);
        }}
        uploader={uploadBlogImageResult}
        emptyHint="Upload one to get started — blog images keep their full resolution."
      />
    </div>
  );
}
