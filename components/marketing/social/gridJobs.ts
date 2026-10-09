/**
 * Grid-set jobs — the slow parts of "Plan a grid" (Claude writing the set,
 * saving the drafts, scheduling them all) run here, outside the planner, so
 * the team can close it and keep working. A toast (lib/toast.ts) says when a
 * job is done or needs them, and its button reopens the planner on that job.
 *
 * Client-only module state: it survives page changes inside the app, not a
 * full reload of the browser tab.
 */

import { useSyncExternalStore } from "react";
import { dismissToast, toast, updateToast } from "@/lib/toast";
import { gridSchedule, type GridDraft, type GridRows } from "@/lib/social/gridPlan";
import type { SocialBrand, SocialPlatform, SocialPost } from "@/lib/social/types";
import { createSocialPost, updateSocialPost } from "./api";

export type GridKind = "story" | "picture";

/** Everything about the set that was decided before Claude wrote it. */
export type GridConfig = {
  brand: SocialBrand;
  rows: GridRows;
  kind: GridKind;
  startDay: string;
  time: string;
  /** One-picture sets: spread out (true) or all on one day (false). */
  spread: boolean;
  alsoFacebook: boolean;
  theme: string;
  about: "idea" | "blog" | "collection";
  blogId: string | null;
  collection: string | null;
};

export type GridJobStatus = "writing" | "ready" | "saving" | "saved" | "scheduling" | "scheduled" | "failed";

export type GridJob = {
  id: string;
  config: GridConfig;
  status: GridJobStatus;
  /** Which step failed (status "failed"). */
  failedAt?: "writing" | "saving";
  error?: string;
  draft?: GridDraft;
  created: SocialPost[];
  progress?: string;
  scheduleErrors: string[];
  /** The "working…" toast shown while nobody is watching. */
  toastId?: string;
};

/** One-picture sets posted "all at once" go out this far apart. */
export const BURST_MINUTES = 10;

/** Posting times for the set, in posting order. */
export function planDates(c: Pick<GridConfig, "rows" | "kind" | "spread" | "startDay" | "time">): Date[] {
  const total = c.rows * 3;
  if (c.kind === "story" || c.spread) return gridSchedule(total, c.startDay, c.time);
  const [first] = gridSchedule(1, c.startDay, c.time);
  return Array.from({ length: total }, (_, i) => new Date(first.getTime() + i * BURST_MINUTES * 60_000));
}

/* ─── Store ───────────────────────────────────────────────────────── */

const jobs = new Map<string, GridJob>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function patch(id: string, p: Partial<GridJob>) {
  const j = jobs.get(id);
  if (!j) return;
  jobs.set(id, { ...j, ...p });
  emit();
}

export function getGridJob(id: string | null): GridJob | null {
  return id ? (jobs.get(id) ?? null) : null;
}

export function useGridJob(id: string | null): GridJob | null {
  return useSyncExternalStore(
    subscribe,
    () => getGridJob(id),
    () => null,
  );
}

/** While the planner shows a job, its finish doesn't need a toast. */
const watchers = new Map<string, number>();
export function watchGridJob(id: string): () => void {
  watchers.set(id, (watchers.get(id) ?? 0) + 1);
  return () => watchers.set(id, Math.max(0, (watchers.get(id) ?? 1) - 1));
}
const watched = (id: string) => (watchers.get(id) ?? 0) > 0;

/* ─── "Open this" requests (toast buttons → the Social page) ───────── */

export type OpenRequest = { kind: "job"; id: string } | { kind: "preview"; brand: SocialBrand };
let pendingOpen: OpenRequest | null = null;
const openHandlers = new Set<(r: OpenRequest) => void>();
export function requestOpen(r: OpenRequest) {
  if (openHandlers.size) openHandlers.forEach((h) => h(r));
  else pendingOpen = r; // the Social page isn't mounted yet — it picks this up when it is
}
/** The Social page listens here; a request made before it mounted is delivered right away. */
export function onOpenRequest(handler: (r: OpenRequest) => void): () => void {
  openHandlers.add(handler);
  if (pendingOpen) {
    const r = pendingOpen;
    pendingOpen = null;
    queueMicrotask(() => handler(r));
  }
  return () => openHandlers.delete(handler);
}

/** Called whenever a job creates or schedules posts — the list reloads. */
const postsHandlers = new Set<() => void>();
export function onPostsChanged(handler: () => void): () => void {
  postsHandlers.add(handler);
  return () => postsHandlers.delete(handler);
}
function postsChanged() {
  postsHandlers.forEach((h) => h());
}

const SOCIAL = "/marketing/social";
const openJob = (id: string) => ({
  run: (go: (href: string) => void) => {
    requestOpen({ kind: "job", id });
    go(SOCIAL);
  },
});

function label(j: GridJob): string {
  const n = j.config.rows * 3;
  return j.config.kind === "picture" ? `${n}-post picture` : `${n}-post story`;
}

/** Show (or replace the working toast with) a result toast — only if nobody is watching. */
function notify(id: string, t: Parameters<typeof toast>[0]) {
  const j = jobs.get(id);
  if (!j) return;
  if (watched(id)) {
    if (j.toastId) dismissToast(j.toastId);
    patch(id, { toastId: undefined });
    return;
  }
  if (j.toastId) {
    updateToast(j.toastId, { ...t, sticky: t.sticky ?? true });
    patch(id, { toastId: undefined });
  } else {
    toast({ ...t, sticky: t.sticky ?? true });
  }
}

/* ─── Steps ───────────────────────────────────────────────────────── */

/** Start writing a set. `run` does the AI work (and, for pictures, the cutting). */
export function startGridWrite(config: GridConfig, run: () => Promise<{ draft: GridDraft }>): string {
  const id = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  jobs.set(id, { id, config, status: "writing", created: [], scheduleErrors: [] });
  emit();
  run()
    .then(({ draft }) => {
      patch(id, { status: "ready", draft });
      notify(id, {
        tone: "success",
        title: `“${draft.story.title}” is ready`,
        body: `Your ${label(jobs.get(id)!)} is written — have a look and save it.`,
        action: { label: "Review", ...openJob(id) },
      });
    })
    .catch((e) => {
      patch(id, { status: "failed", failedAt: "writing", error: e instanceof Error ? e.message : "Couldn't write the set." });
      notify(id, {
        tone: "error",
        title: "Couldn't write the grid set",
        body: e instanceof Error ? e.message : undefined,
        action: { label: "Open the planner", ...openJob(id) },
      });
    });
  return id;
}

/** The planner was closed with this job still going: say so, and keep a toast to come back to. */
export function leaveGridJob(id: string) {
  const j = jobs.get(id);
  if (!j) return;
  if (j.status === "writing") {
    const t = toast({
      tone: "working",
      title: j.config.kind === "picture" ? "Cutting your picture and writing captions…" : `Writing your ${label(j)}…`,
      body: "Keep working — we'll let you know when it's ready.",
    });
    patch(id, { toastId: t });
  } else if (j.status === "ready") {
    toast({
      tone: "info",
      sticky: true,
      title: `“${j.draft?.story.title ?? "Your set"}” isn't saved yet`,
      body: "Review it and save the posts when you're ready.",
      action: { label: "Review", ...openJob(id) },
    });
  } else if (j.status === "saved") {
    toast({
      tone: "info",
      sticky: true,
      title: `${j.created.length} drafts aren't scheduled yet`,
      body: "They won't post until they're scheduled.",
      action: { label: `Schedule all ${j.created.length}`, run: () => scheduleGridJob(id) },
    });
  } else if (j.status === "saving" || j.status === "scheduling") {
    const t = toast({ tone: "working", title: j.progress ?? "Working…", body: "Keep working — we'll let you know when it's done." });
    patch(id, { toastId: t });
  }
}

export function saveGridJob(id: string): void {
  const j = jobs.get(id);
  if (!j?.draft || j.status === "saving") return;
  const { config, draft } = j;
  const dates = planDates(config);
  const platforms: SocialPlatform[] = config.alsoFacebook ? ["instagram", "facebook"] : ["instagram"];
  patch(id, { status: "saving", error: undefined });

  void (async () => {
    const out: SocialPost[] = [];
    try {
      for (let i = 0; i < draft.posts.length; i++) {
        const p = draft.posts[i];
        progress(id, `Creating post ${i + 1} of ${draft.posts.length}…`);
        out.push(await createSocialPost({ brand: config.brand, platforms, title: p.title, design: p.design, scheduled_at: dates[i].toISOString() }));
      }
      patch(id, { status: "saved", created: out, progress: undefined });
      postsChanged();
      notify(id, {
        tone: "success",
        title: `${out.length} drafts saved`,
        body: "Schedule them all so they post by themselves.",
        action: { label: `Schedule all ${out.length}`, run: () => scheduleGridJob(id) },
      });
    } catch (e) {
      const msg = `${e instanceof Error ? e.message : "Something went wrong."} ${out.length} of ${draft.posts.length} were created.`;
      patch(id, out.length ? { status: "saved", created: out, progress: undefined, error: msg } : { status: "failed", failedAt: "saving", error: msg, progress: undefined });
      if (out.length) postsChanged();
      notify(id, { tone: "error", title: "Saving the set stopped part-way", body: msg, action: { label: "Open the planner", ...openJob(id) } });
    }
  })();
}

export function scheduleGridJob(id: string): void {
  const j = jobs.get(id);
  if (!j || !j.created.length || j.status === "scheduling") return;
  const created = j.created;
  patch(id, { status: "scheduling", scheduleErrors: [] });
  // Scheduling renders every slide — this one always gets a progress toast unless the planner is open.
  if (!watched(id) && !j.toastId) patch(id, { toastId: toast({ tone: "working", title: `Scheduling ${created.length} posts…` }) });

  void (async () => {
    const errs: string[] = [];
    for (let i = 0; i < created.length; i++) {
      progress(id, `Getting post ${i + 1} of ${created.length} ready…`);
      try {
        await updateSocialPost(created[i].id, { action: "schedule" });
      } catch (e) {
        errs.push(`Post ${i + 1} (${created[i].title || "untitled"}): ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    patch(id, { status: "scheduled", scheduleErrors: errs, progress: undefined });
    postsChanged();
    const brand = j.config.brand;
    notify(
      id,
      errs.length
        ? {
            tone: "error",
            title: `${created.length - errs.length} of ${created.length} posts scheduled`,
            body: `${errs.length} need a look before they can go out.`,
            action: { label: "Open the planner", ...openJob(id) },
          }
        : {
            tone: "success",
            sticky: false,
            title: `${created.length} posts scheduled`,
            body: "They'll post by themselves.",
            action: {
              label: "See the grid",
              run: (go) => {
                requestOpen({ kind: "preview", brand });
                go(SOCIAL);
              },
            },
          },
    );
  })();
}

function progress(id: string, text: string) {
  patch(id, { progress: text });
  const t = jobs.get(id)?.toastId;
  if (t) updateToast(t, { title: text });
}
