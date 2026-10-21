"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Bookmark, Search, X } from "lucide-react";
import { BLOCK_INFO, type PageBlockType } from "@/lib/site/pageBlocks";
import { BLOCK_ICON } from "./blockMeta";
import type { SiteWidget } from "./useWidgets";

/**
 * "Add a section" — every section this page can take, each with a little
 * picture of its shape, plus the store's saved sections (widgets). Opened
 * from the "+ Add section" buttons on the page and in the sections list.
 */
export default function SectionPicker(props: PickerProps) {
  // Mounted only while open, so the search starts empty each time.
  return props.open ? <PickerBody {...props} /> : null;
}

type PickerProps = {
  open: boolean;
  /** "It goes below Product row" — said in the header so it is clear where it lands. */
  where: string;
  types: PageBlockType[];
  saved: SiteWidget[];
  onPick: (type: PageBlockType, widgetId?: string) => void;
  onClose: () => void;
};

function PickerBody({
  where,
  types,
  saved,
  onPick,
  onClose,
}: PickerProps) {
  const [q, setQ] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
  const shownTypes = types.filter((t) => match(BLOCK_INFO[t].label) || match(BLOCK_INFO[t].description));
  const shownSaved = saved.filter((x) => x.draft && (match(x.name) || match(BLOCK_INFO[x.draft.type].label)));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Add a section"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex flex-wrap items-start gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1 basis-48">
            <h2 className="text-base font-semibold text-gray-900">Add a section</h2>
            <p className="text-xs text-gray-500">{where}</p>
          </div>
          <label className="order-last flex w-full items-center gap-1.5 rounded-lg border sm:order-none sm:w-auto border-gray-200 px-2.5 py-1.5 focus-within:border-indigo-400">
            <Search size={13} className="text-gray-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="w-full text-sm outline-none sm:w-32"
            />
          </label>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {shownSaved.length ? (
            <>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                <Bookmark size={11} /> Your saved sections
              </h3>
              <p className="mb-3 text-[11px] text-gray-400">Shared with other pages — edit one and every page using it updates.</p>
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {shownSaved.map((x) => (
                  <Tile
                    key={x.id}
                    type={x.draft!.type}
                    title={x.name}
                    sub={BLOCK_INFO[x.draft!.type].label}
                    saved
                    onClick={() => onPick("widget", x.id)}
                  />
                ))}
              </div>
            </>
          ) : null}

          {shownSaved.length ? (
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">New section</h3>
          ) : null}
          {shownTypes.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {shownTypes.map((t) => (
                <Tile key={t} type={t} title={BLOCK_INFO[t].label} sub={BLOCK_INFO[t].description} onClick={() => onPick(t)} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">Nothing matches “{q}”.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({
  type,
  title,
  sub,
  saved,
  onClick,
}: {
  type: PageBlockType;
  title: string;
  sub: string;
  saved?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group flex flex-col overflow-hidden rounded-xl border bg-white text-left transition hover:-translate-y-0.5 hover:shadow-md",
        saved ? "border-violet-200 hover:border-violet-300" : "border-gray-200 hover:border-indigo-300",
      )}
    >
      <div className={clsx("aspect-[16/9] w-full border-b p-3", saved ? "border-violet-100 bg-violet-50/50" : "border-gray-100 bg-gray-50")}>
        <SectionThumb type={type} />
      </div>
      <div className="p-2.5">
        <div className="text-[13px] font-semibold text-gray-900">{title}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-gray-500">{sub}</div>
      </div>
    </button>
  );
}

/* ─── Little pictures of each section's shape ─────────────────────────── */

const Img = ({ className }: { className?: string }) => <div className={clsx("rounded bg-gray-300/80", className)} />;
const Line = ({ w = "100%", className }: { w?: string; className?: string }) => (
  <div className={clsx("h-1.5 rounded-full bg-gray-300", className)} style={{ width: w }} />
);
const Title = ({ w = "60%", className }: { w?: string; className?: string }) => (
  <div className={clsx("h-2.5 rounded-full bg-gray-500", className)} style={{ width: w }} />
);
const Btn = ({ className }: { className?: string }) => <div className={clsx("h-2.5 w-10 rounded-full bg-indigo-400", className)} />;
const Card = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <div className={clsx("flex flex-col gap-1 rounded-md border border-gray-200 bg-white p-1.5", className)}>{children}</div>
);
const Row = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={clsx("flex gap-1.5", className)}>{children}</div>
);
const Col = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={clsx("flex flex-col gap-1.5", className)}>{children}</div>
);
const times = (n: number, f: (i: number) => React.ReactNode) => Array.from({ length: n }, (_, i) => f(i));

export function SectionThumb({ type }: { type: PageBlockType }) {
  const body = THUMBS[type]?.();
  if (body) return <div className="flex h-full w-full flex-col justify-center gap-1.5">{body}</div>;
  const Icon = BLOCK_ICON[type];
  return (
    <div className="flex h-full w-full items-center justify-center text-gray-400">
      <Icon size={26} strokeWidth={1.5} />
    </div>
  );
}

const products = (n: number) => (
  <Row>
    {times(n, (i) => (
      <Card key={i} className="flex-1">
        <Img className="aspect-square w-full" />
        <Line w="80%" />
        <Line w="40%" />
      </Card>
    ))}
  </Row>
);

const THUMBS: Partial<Record<PageBlockType, () => React.ReactNode>> = {
  value_strip: () => (
    <Row className="items-center justify-around rounded bg-gray-200 px-2 py-2">
      {times(4, (i) => <Line key={i} w="18%" className="bg-gray-400" />)}
    </Row>
  ),
  product_row: () => (
    <>
      <Title w="35%" />
      {products(4)}
    </>
  ),
  related_products: () => (
    <>
      <Title w="40%" />
      {products(4)}
    </>
  ),
  shop_by_form: () => (
    <Row>
      {times(3, (i) => (
        <div key={i} className="relative flex-1">
          <Img className="aspect-[3/4] w-full" />
          <Line w="50%" className="absolute bottom-1.5 left-1.5 bg-white" />
        </div>
      ))}
    </Row>
  ),
  newsletter: () => (
    <Col className="items-center rounded bg-gray-200 py-3">
      <Title w="45%" />
      <Line w="60%" />
      <Row className="w-2/3">
        <div className="h-3 flex-1 rounded bg-white" />
        <Btn className="h-3" />
      </Row>
    </Col>
  ),
  promo_banner: () => (
    <Row className="items-center justify-between rounded bg-indigo-200 px-3 py-4">
      <Title w="55%" />
      <Btn />
    </Row>
  ),
  image_text: () => (
    <Row className="items-center">
      <Img className="aspect-[4/3] w-1/2" />
      <Col className="flex-1">
        <Title w="80%" />
        <Line />
        <Line w="85%" />
        <Btn />
      </Col>
    </Row>
  ),
  philosophy: () => (
    <Row>
      {times(2, (i) => (
        <Col key={i} className="flex-1">
          <Title w="70%" />
          <Line />
          <Line />
          <Line w="70%" />
        </Col>
      ))}
    </Row>
  ),
  rich_text: () => (
    <Col className="px-4">
      <Title w="45%" />
      <Line />
      <Line />
      <Line w="90%" />
      <Line w="60%" />
    </Col>
  ),
  stats: () => (
    <Row className="justify-around">
      {times(3, (i) => (
        <Col key={i} className="items-center">
          <div className="h-5 w-8 rounded bg-gray-500" />
          <Line w="2.5rem" />
        </Col>
      ))}
    </Row>
  ),
  quote: () => (
    <Row className="px-4">
      <div className="w-1 rounded bg-indigo-400" />
      <Col className="flex-1">
        <Title w="95%" />
        <Title w="70%" />
        <Line w="30%" />
      </Col>
    </Row>
  ),
  statement: () => (
    <Col className="items-center rounded bg-gray-700 py-5">
      <Title w="70%" className="bg-white" />
    </Col>
  ),
  link_list: () => (
    <Col className="px-3">
      {times(3, (i) => (
        <Row key={i} className="items-center">
          <span className="text-[9px] font-bold text-gray-400">{i + 1}</span>
          <Line w="45%" className="bg-gray-500" />
          <Line w="30%" />
        </Row>
      ))}
    </Col>
  ),
  cta: () => (
    <Col className="items-center py-2">
      <Title w="65%" />
      <Row>
        <Btn />
        <Btn className="bg-white ring-1 ring-indigo-400" />
      </Row>
    </Col>
  ),
  callout: () => (
    <div className="mx-4 rounded-lg bg-amber-100 p-3">
      <Col>
        <Title w="40%" />
        <Line />
        <Line w="70%" />
      </Col>
    </div>
  ),
  benefits_banner: () => (
    <Col className="items-center rounded bg-gray-200 py-3">
      <Title w="50%" />
      <Row>{times(3, (i) => <Line key={i} w="3rem" className="bg-gray-400" />)}</Row>
    </Col>
  ),
  reviews_note: () => (
    <Col className="items-center">
      <Row>{times(5, (i) => <div key={i} className="h-2.5 w-2.5 rounded-sm bg-amber-400" />)}</Row>
      <Line w="55%" />
    </Col>
  ),
  seed_band: () => (
    <Col className="rounded bg-emerald-900 p-3">
      <Title w="45%" className="bg-white" />
      <Row>{times(4, (i) => <div key={i} className="h-4 flex-1 rounded-full bg-emerald-500/60" />)}</Row>
    </Col>
  ),
  seed_cards: () => (
    <Row>
      {times(4, (i) => (
        <Card key={i} className={clsx("flex-1", i === 3 && "bg-emerald-50")}>
          <div className="h-3 w-3 rounded-full bg-emerald-400" />
          <Line w="70%" />
          <Line />
        </Card>
      ))}
    </Row>
  ),
  checklist: () => (
    <Row>
      <Col className="w-2/5">
        <Title />
        <Line />
      </Col>
      <Col className="flex-1">
        {times(4, (i) => (
          <Row key={i} className="items-center">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <Line w="70%" />
          </Row>
        ))}
      </Col>
    </Row>
  ),
  two_lists: () => (
    <Row>
      {times(2, (k) => (
        <Card key={k} className="flex-1">
          <Line w="50%" className="bg-gray-500" />
          {times(3, (i) => (
            <Row key={i} className="items-center">
              <div className={clsx("h-1.5 w-1.5 rounded-full", k ? "bg-red-400" : "bg-emerald-500")} />
              <Line w="70%" />
            </Row>
          ))}
        </Card>
      ))}
    </Row>
  ),
  pillars: () => (
    <Row>
      {times(3, (i) => (
        <Card key={i} className="flex-1">
          <span className="text-[10px] font-bold text-indigo-400">0{i + 1}</span>
          <Line w="70%" className="bg-gray-500" />
          <Line />
        </Card>
      ))}
    </Row>
  ),
  link_grid: () => (
    <div className="grid grid-cols-3 gap-1.5 rounded bg-indigo-50 p-2">
      {times(6, (i) => (
        <div key={i} className="h-4 rounded bg-white" />
      ))}
    </div>
  ),
  link_cards: () => (
    <Row>
      {times(2, (i) => (
        <Card key={i} className="flex-1 py-3">
          <Title w="60%" />
          <Line w="80%" />
        </Card>
      ))}
    </Row>
  ),
  faq: () => (
    <Col className="px-3">
      <Title w="35%" />
      {times(3, (i) => (
        <Card key={i}>
          <Row className="items-center justify-between">
            <Line w="65%" className="bg-gray-500" />
            <span className="text-[9px] text-gray-400">+</span>
          </Row>
        </Card>
      ))}
    </Col>
  ),
  embed: () => (
    <div className="mx-auto flex aspect-video w-3/4 items-center justify-center rounded bg-gray-800">
      <div className="h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-white" />
    </div>
  ),
};
