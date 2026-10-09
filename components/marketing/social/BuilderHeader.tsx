"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  Eye,
  Facebook,
  ImageIcon,
  Instagram,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import {
  PLATFORM_LABEL,
  SOCIAL_BRANDS,
  SOCIAL_PLATFORMS,
  type MetaConnectionStatus,
  type SocialBrand,
  type SocialPlatform,
  type SocialStatus,
} from "@/lib/social/types";

/**
 * Top of the social post builder. Written for two people: a founder who
 * wants to read, in plain words, what will happen and when — and a designer
 * who wants the chrome out of the way of the slides. So: one quiet bar with
 * labelled actions, a single sentence about where the post goes, and every
 * irreversible step behind a dialog that says what it will do.
 */

const BRAND_NAME: Record<SocialBrand, string> = { NI: "Natural Inspirations", Sassy: "Sassy" };
const BRAND_DOT: Record<SocialBrand, string> = { NI: "bg-[#1F3D35]", Sassy: "bg-[#B3295C]" };
const PLATFORM_ICON: Record<SocialPlatform, typeof Instagram> = { instagram: Instagram, facebook: Facebook };

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `today at ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at ${time}`;
}

type SaveState = "saved" | "dirty" | "saving" | "error";

type Props = {
  title: string;
  onTitle: (v: string) => void;
  brand: SocialBrand;
  onBrand: (b: SocialBrand) => void;
  platforms: SocialPlatform[];
  onTogglePlatform: (p: SocialPlatform) => void;
  status: SocialStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  saveState: SaveState;
  locked: boolean;
  busy: string | null;
  connection: MetaConnectionStatus | null;
  /** Reasons the post can't go out yet (shown where the user tries). */
  problems: string[];
  onSchedule: (iso: string) => void;
  onUnschedule: () => void;
  onPublishNow: () => void;
  onRetry: () => void;
  onDelete: () => void;
  onPreview: () => void;
  /** Extra "More" menu item, e.g. switching between slides and own photos. */
  extraAction?: { label: string; onClick: () => void } | null;
};

export default function BuilderHeader(p: Props) {
  const live = p.status === "published" || p.status === "partial";

  return (
    <>
      {/* Bar */}
      <div className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/90 backdrop-blur">
        <div className="flex h-16 items-center gap-2 px-3 sm:gap-4 sm:px-4 md:px-8">
          <Link
            href="/marketing/social"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Social posts</span>
          </Link>
          <span className="hidden h-6 w-px bg-gray-200 sm:block" />

          <input
            value={p.title}
            onChange={(e) => p.onTitle(e.target.value)}
            disabled={p.locked}
            placeholder="Name this post"
            aria-label="Post name"
            className="min-w-0 flex-1 truncate rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[17px] font-semibold text-gray-900 placeholder:text-gray-300 hover:border-gray-200 focus:border-gray-300 focus:bg-white focus:outline-none disabled:hover:border-transparent"
          />

          <SaveIndicator state={p.saveState} locked={p.locked} />

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={p.onPreview}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <Eye size={18} />
              <span className="hidden md:inline">Preview</span>
            </button>
            <MoreMenu
              items={[
                ...(p.extraAction && !p.locked ? [{ label: p.extraAction.label, icon: ImageIcon, onClick: p.extraAction.onClick }] : []),
                ...(p.status === "scheduled" ? [{ label: "Unschedule", icon: CalendarClock, onClick: p.onUnschedule }] : []),
                {
                  label: live ? "Remove from list" : "Delete post",
                  icon: Trash2,
                  danger: true,
                  onClick: p.onDelete,
                  disabled: p.status === "publishing",
                },
              ]}
            />
            {p.status === "partial" ? (
              <button
                onClick={p.onRetry}
                disabled={!!p.busy}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                {p.busy === "retry" ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                Retry what failed
              </button>
            ) : !p.locked ? (
              <>
                <SchedulePopover
                  scheduledAt={p.status === "scheduled" ? p.scheduledAt : null}
                  problems={p.problems}
                  busy={p.busy === "schedule"}
                  onSchedule={p.onSchedule}
                />
                <button
                  onClick={p.onPublishNow}
                  disabled={!!p.busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-50 sm:px-4"
                >
                  {p.busy === "publish" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {p.status === "failed" ? "Try again now" : "Post now"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Where + when, as one sentence */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-5 text-[15px] text-gray-600 md:px-8">
        <span>Posting as</span>
        <BrandMenu brand={p.brand} onBrand={p.onBrand} disabled={p.locked} connection={p.connection} />
        <span>on</span>
        <div className="flex gap-2">
          {SOCIAL_PLATFORMS.map((pl) => {
            const on = p.platforms.includes(pl);
            const Icon = PLATFORM_ICON[pl];
            return (
              <button
                key={pl}
                type="button"
                disabled={p.locked}
                onClick={() => p.onTogglePlatform(pl)}
                aria-pressed={on}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition disabled:cursor-default",
                  on
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-dashed border-gray-300 bg-white text-gray-400 hover:border-gray-400 hover:text-gray-600",
                )}
              >
                <Icon size={15} />
                {PLATFORM_LABEL[pl]}
                {on && <Check size={14} />}
              </button>
            );
          })}
        </div>
        <span className="ml-auto">
          <StatusSentence status={p.status} scheduledAt={p.scheduledAt} publishedAt={p.publishedAt} />
        </span>
      </div>
    </>
  );
}

/* ─── Pieces ──────────────────────────────────────────────────────── */

function SaveIndicator({ state, locked }: { state: SaveState; locked: boolean }) {
  if (locked) return null;
  return (
    <span
      className={clsx(
        "hidden shrink-0 items-center gap-1.5 text-xs md:inline-flex",
        state === "error" ? "text-red-600" : state === "saved" ? "text-gray-400" : "text-gray-500",
      )}
    >
      {state === "saving" || state === "dirty" ? (
        <>
          <Loader2 size={12} className="animate-spin" /> Saving
        </>
      ) : state === "error" ? (
        "Not saved"
      ) : (
        <>
          <Check size={12} /> Saved
        </>
      )}
    </span>
  );
}

function StatusSentence({ status, scheduledAt, publishedAt }: { status: SocialStatus; scheduledAt: string | null; publishedAt: string | null }) {
  const dot = (c: string) => <span className={clsx("inline-block h-2 w-2 rounded-full", c)} />;
  const line = (c: string, text: React.ReactNode) => (
    <span className="inline-flex items-center gap-2 text-sm text-gray-600">
      {dot(c)}
      {text}
    </span>
  );
  switch (status) {
    case "scheduled":
      return line("bg-emerald-500", <>Goes out <strong className="font-semibold text-gray-900">{scheduledAt ? formatWhen(scheduledAt) : "soon"}</strong></>);
    case "publishing":
      return line("bg-sky-500 animate-pulse", "Posting now…");
    case "published":
      return line("bg-green-600", <>Posted {publishedAt ? formatWhen(publishedAt) : ""}</>);
    case "partial":
      return line("bg-orange-500", "Posted on one platform — the other failed");
    case "failed":
      return line("bg-red-500", "Didn't post — see the reason below");
    default:
      return line("bg-gray-300", "Draft — not scheduled yet");
  }
}

function BrandMenu({
  brand,
  onBrand,
  disabled,
  connection,
}: {
  brand: SocialBrand;
  onBrand: (b: SocialBrand) => void;
  disabled: boolean;
  connection: MetaConnectionStatus | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLDivElement>(() => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-900 transition hover:border-gray-300 disabled:cursor-default disabled:hover:border-gray-200"
      >
        <span className={clsx("h-2.5 w-2.5 rounded-full", BRAND_DOT[brand])} />
        {BRAND_NAME[brand]}
        {!disabled && <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-64 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl">
          {SOCIAL_BRANDS.map((b) => {
            const c = connection?.brands.find((x) => x.brand === b);
            const notSetUp = c ? !c.configured : false;
            return (
              <button
                key={b}
                type="button"
                onClick={() => {
                  onBrand(b);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-gray-50"
              >
                <span className={clsx("h-2.5 w-2.5 rounded-full", BRAND_DOT[b])} />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-gray-900">{BRAND_NAME[b]}</span>
                  {notSetUp && <span className="block text-xs text-gray-400">Not connected to Meta yet — can&apos;t post</span>}
                </span>
                {b === brand && <Check size={16} className="text-gray-900" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type MenuItem = { label: string; icon: typeof Trash2; onClick: () => void; danger?: boolean; disabled?: boolean };

function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLDivElement>(() => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={18} />
        <span className="hidden lg:inline">More</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.label}
                role="menuitem"
                type="button"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition disabled:opacity-40",
                  it.danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50",
                )}
              >
                <Icon size={16} />
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Schedule popover ────────────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function quickPicks(): { label: string; at: Date }[] {
  const now = new Date();
  const at = (days: number, h: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const picks = [
    { label: "This evening, 6 PM", at: at(0, 18) },
    { label: "Tomorrow, 9 AM", at: at(1, 9) },
    { label: "Tomorrow, 12 PM", at: at(1, 12) },
    { label: "Tomorrow, 6 PM", at: at(1, 18) },
  ];
  return picks.filter((p) => p.at.getTime() > now.getTime() + 15 * 60_000).slice(0, 3);
}

function SchedulePopover({
  scheduledAt,
  problems,
  busy,
  onSchedule,
}: {
  scheduledAt: string | null;
  problems: string[];
  busy: boolean;
  onSchedule: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  // "Now" and the quick picks are captured when the popover opens, not on every render.
  const [openedAt, setOpenedAt] = useState(0);
  const [picks, setPicks] = useState<{ label: string; at: Date }[]>([]);
  const ref = useClickAway<HTMLDivElement>(() => setOpen(false));

  function toggle() {
    if (!open) {
      const q = quickPicks();
      const start = scheduledAt ? new Date(scheduledAt) : q[0]?.at ?? new Date(Date.now() + 3600_000);
      setPicks(q);
      setOpenedAt(Date.now());
      setDate(dateValue(start));
      setTime(timeValue(start));
    }
    setOpen((o) => !o);
  }

  const picked = date && time ? new Date(`${date}T${time}`) : null;
  const valid = !!picked && !Number.isNaN(picked.getTime());
  const inPast = valid && picked!.getTime() < openedAt + 60_000;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        className={clsx(
          "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition",
          scheduledAt
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50",
        )}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
        {scheduledAt ? <span className="hidden sm:inline">{formatWhen(scheduledAt)}</span> : "Schedule"}
        {scheduledAt && <span className="sm:hidden">Scheduled</span>}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[340px] rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
          <h4 className="text-base font-semibold text-gray-900">{scheduledAt ? "Change the time" : "When should it go out?"}</h4>

          {problems.length > 0 ? (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Before it can be scheduled:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {problems.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {picks.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => {
                      setDate(dateValue(q.at));
                      setTime(timeValue(q.at));
                    }}
                    className={clsx(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      valid && picked!.getTime() === q.at.getTime()
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 text-gray-700 hover:border-gray-300",
                    )}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-gray-500">
                  Day
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                  />
                </label>
                <label className="text-xs font-medium text-gray-500">
                  Time
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                  />
                </label>
              </div>
              {inPast && <p className="mt-2 text-xs text-amber-700">That time has already passed — pick a later one, or use Post now.</p>}
              <button
                type="button"
                disabled={!valid || inPast || busy}
                onClick={() => {
                  onSchedule(picked!.toISOString());
                  setOpen(false);
                }}
                className="mt-4 w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-40"
              >
                {valid && !inPast ? `Schedule for ${formatWhen(picked!.toISOString())}` : "Schedule"}
              </button>
              <p className="mt-2 text-center text-[11px] text-gray-400">Goes out within 5 minutes of this time.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function useClickAway<T extends HTMLElement>(onAway: () => void) {
  const ref = useRef<T>(null);
  const cb = useRef(onAway);
  useEffect(() => {
    cb.current = onAway;
  });
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cb.current();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return ref;
}
