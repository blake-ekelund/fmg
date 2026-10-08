/**
 * Meta Graph API client — Facebook Page + Instagram publishing.
 *
 * SERVER ONLY (reads secrets). Auth is one long-lived System User token from
 * our Meta Business Manager (META_ACCESS_TOKEN) with pages_show_list,
 * pages_read_engagement, pages_manage_posts, instagram_basic and
 * instagram_content_publish. Each brand's Page is named by env; its Instagram
 * account is discovered from the Page (the IG account must be a Business or
 * Creator account linked to that Page), or pinned with META_IG_USER_ID_<BRAND>.
 *
 * Every call sends access_token in the POST body / header, never logged.
 */

import type { SocialBrand } from "./types";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class MetaError extends Error {
  code?: number;
  subcode?: number;
  /** Retrying later may succeed (rate limit / transient). */
  transient: boolean;
  constructor(message: string, opts: { code?: number; subcode?: number; transient?: boolean } = {}) {
    super(message);
    this.name = "MetaError";
    this.code = opts.code;
    this.subcode = opts.subcode;
    this.transient = opts.transient ?? false;
  }
}

/** Rate-limit / temporary Graph error codes worth a retry on the next tick. */
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 9007]);

export function metaConfigured(): boolean {
  return !!process.env.META_ACCESS_TOKEN;
}

export function pageIdFor(brand: SocialBrand): string | null {
  const v = brand === "Sassy" ? process.env.META_PAGE_ID_SASSY : process.env.META_PAGE_ID_NI;
  return v?.trim() || null;
}

function pinnedIgIdFor(brand: SocialBrand): string | null {
  const v = brand === "Sassy" ? process.env.META_IG_USER_ID_SASSY : process.env.META_IG_USER_ID_NI;
  return v?.trim() || null;
}

type Params = Record<string, string | number | boolean | undefined | null>;

async function graph<T>(
  method: "GET" | "POST",
  path: string,
  params: Params,
  token: string,
): Promise<T> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v != null) clean[k] = String(v);

  let res: Response;
  try {
    if (method === "GET") {
      const qs = new URLSearchParams(clean).toString();
      res = await fetch(`${GRAPH}/${path}${qs ? `?${qs}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } else {
      res = await fetch(`${GRAPH}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...clean, access_token: token }).toString(),
        cache: "no-store",
      });
    }
  } catch (e) {
    throw new MetaError(`Couldn't reach Meta: ${e instanceof Error ? e.message : String(e)}`, { transient: true });
  }

  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string; is_transient?: boolean };
  } & T;

  if (!res.ok || json.error) {
    const e = json.error ?? {};
    const msg = e.error_user_msg || e.message || `Meta returned ${res.status}`;
    throw new MetaError(msg, {
      code: e.code,
      subcode: e.error_subcode,
      transient: !!e.is_transient || (e.code != null && TRANSIENT_CODES.has(e.code)) || res.status >= 500,
    });
  }
  return json as T;
}

function systemToken(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new MetaError("META_ACCESS_TOKEN isn't set — connect Meta first (see docs/integrations.md, Meta section).");
  return t;
}

/* ─── Accounts ─────────────────────────────────────────────────────── */

export type BrandAccount = {
  brand: SocialBrand;
  pageId: string;
  pageName: string;
  pageToken: string;
  igUserId: string | null;
  igUsername: string | null;
};

const accountCache = new Map<SocialBrand, Promise<BrandAccount>>();

/** The brand's Page (with a Page token) and linked Instagram account. Cached per process. */
export function brandAccount(brand: SocialBrand): Promise<BrandAccount> {
  let p = accountCache.get(brand);
  if (!p) {
    p = loadBrandAccount(brand);
    accountCache.set(brand, p);
    p.catch(() => accountCache.delete(brand));
  }
  return p;
}

async function loadBrandAccount(brand: SocialBrand): Promise<BrandAccount> {
  const pageId = pageIdFor(brand);
  const envName = brand === "Sassy" ? "META_PAGE_ID_SASSY" : "META_PAGE_ID_NI";
  if (!pageId) throw new MetaError(`${envName} isn't set — no Facebook Page is connected for ${brand}.`);

  const page = await graph<{
    id: string;
    name: string;
    access_token?: string;
    instagram_business_account?: { id: string; username?: string };
  }>("GET", pageId, { fields: "id,name,access_token,instagram_business_account{id,username}" }, systemToken());

  if (!page.access_token) {
    throw new MetaError(
      `The Meta token can't manage the ${brand} Page (${page.name}). Assign the Page to the System User with full control.`,
    );
  }

  const pinned = pinnedIgIdFor(brand);
  let igUserId = pinned ?? page.instagram_business_account?.id ?? null;
  let igUsername = page.instagram_business_account?.username ?? null;
  if (pinned && pinned !== page.instagram_business_account?.id) {
    const ig = await graph<{ username?: string }>("GET", pinned, { fields: "username" }, page.access_token);
    igUsername = ig.username ?? null;
    igUserId = pinned;
  }

  return { brand, pageId: page.id, pageName: page.name, pageToken: page.access_token, igUserId, igUsername };
}

/** Pages the token can see — shown on the setup panel to find the Page ids. */
export async function listVisiblePages(): Promise<{ id: string; name: string; instagram: string | null }[]> {
  const res = await graph<{
    data: { id: string; name: string; instagram_business_account?: { username?: string } }[];
  }>("GET", "me/accounts", { fields: "id,name,instagram_business_account{username}", limit: 100 }, systemToken());
  return res.data.map((p) => ({ id: p.id, name: p.name, instagram: p.instagram_business_account?.username ?? null }));
}

/* ─── Facebook ─────────────────────────────────────────────────────── */

export type Published = { id: string; permalink: string | null };

async function fbPermalink(id: string, token: string): Promise<string | null> {
  try {
    const r = await graph<{ permalink_url?: string }>("GET", id, { fields: "permalink_url" }, token);
    return r.permalink_url ? new URL(r.permalink_url, "https://www.facebook.com").toString() : null;
  } catch {
    return null;
  }
}

export async function fbPublishPhoto(acct: BrandAccount, url: string, caption: string): Promise<Published> {
  const r = await graph<{ id: string; post_id?: string }>(
    "POST",
    `${acct.pageId}/photos`,
    { url, caption, published: true },
    acct.pageToken,
  );
  const id = r.post_id ?? r.id;
  return { id, permalink: await fbPermalink(id, acct.pageToken) };
}

export async function fbPublishAlbum(acct: BrandAccount, urls: string[], message: string): Promise<Published> {
  const ids: string[] = [];
  for (const url of urls) {
    const r = await graph<{ id: string }>(
      "POST",
      `${acct.pageId}/photos`,
      { url, published: false },
      acct.pageToken,
    );
    ids.push(r.id);
  }
  const params: Params = { message };
  ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
  const post = await graph<{ id: string }>("POST", `${acct.pageId}/feed`, params, acct.pageToken);
  return { id: post.id, permalink: await fbPermalink(post.id, acct.pageToken) };
}

export async function fbPublishVideo(acct: BrandAccount, url: string, description: string): Promise<Published> {
  const r = await graph<{ id: string }>(
    "POST",
    `${acct.pageId}/videos`,
    { file_url: url, description, published: true },
    acct.pageToken,
  );
  return { id: r.id, permalink: `https://www.facebook.com/${acct.pageId}/videos/${r.id}` };
}

/* ─── Instagram ────────────────────────────────────────────────────── */

function requireIg(acct: BrandAccount): string {
  if (!acct.igUserId) {
    throw new MetaError(
      `No Instagram account is linked to the ${acct.brand} Facebook Page (${acct.pageName}). Switch the IG account to Business and link it to the Page.`,
    );
  }
  return acct.igUserId;
}

export async function igCreateImage(acct: BrandAccount, imageUrl: string, caption: string | null, carouselItem = false) {
  const ig = requireIg(acct);
  const r = await graph<{ id: string }>(
    "POST",
    `${ig}/media`,
    carouselItem ? { image_url: imageUrl, is_carousel_item: true } : { image_url: imageUrl, caption: caption ?? "" },
    acct.pageToken,
  );
  return r.id;
}

export async function igCreateCarousel(acct: BrandAccount, childIds: string[], caption: string) {
  const ig = requireIg(acct);
  const r = await graph<{ id: string }>(
    "POST",
    `${ig}/media`,
    { media_type: "CAROUSEL", children: childIds.join(","), caption },
    acct.pageToken,
  );
  return r.id;
}

export async function igCreateReel(acct: BrandAccount, videoUrl: string, caption: string) {
  const ig = requireIg(acct);
  const r = await graph<{ id: string }>(
    "POST",
    `${ig}/media`,
    { media_type: "REELS", video_url: videoUrl, caption, share_to_feed: true },
    acct.pageToken,
  );
  return r.id;
}

export type ContainerState = "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED";

export async function igContainerStatus(acct: BrandAccount, containerId: string): Promise<{ state: ContainerState; detail: string | null }> {
  const r = await graph<{ status_code?: ContainerState; status?: string }>(
    "GET",
    containerId,
    { fields: "status_code,status" },
    acct.pageToken,
  );
  return { state: r.status_code ?? "IN_PROGRESS", detail: r.status ?? null };
}

/**
 * Poll a container until it is ready (FINISHED) or `deadline` passes.
 * Returns false if still processing at the deadline (resume next tick).
 */
export async function igWaitReady(acct: BrandAccount, containerId: string, deadline: number): Promise<boolean> {
  let delay = 1500;
  for (;;) {
    const { state, detail } = await igContainerStatus(acct, containerId);
    if (state === "FINISHED" || state === "PUBLISHED") return true;
    if (state === "ERROR" || state === "EXPIRED") {
      throw new MetaError(`Instagram couldn't process the media${detail ? `: ${detail}` : ""}.`);
    }
    if (Date.now() + delay > deadline) return false;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 8000);
  }
}

export async function igPublish(acct: BrandAccount, containerId: string): Promise<Published> {
  const ig = requireIg(acct);
  const r = await graph<{ id: string }>("POST", `${ig}/media_publish`, { creation_id: containerId }, acct.pageToken);
  let permalink: string | null = null;
  try {
    permalink = (await graph<{ permalink?: string }>("GET", r.id, { fields: "permalink" }, acct.pageToken)).permalink ?? null;
  } catch {
    /* the post is up; the link is a nicety */
  }
  return { id: r.id, permalink };
}

/** Instagram's rolling 24h publishing quota for the brand's account. */
export async function igQuota(acct: BrandAccount): Promise<{ used: number; total: number } | null> {
  if (!acct.igUserId) return null;
  try {
    const r = await graph<{ data: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
      "GET",
      `${acct.igUserId}/content_publishing_limit`,
      { fields: "quota_usage,config" },
      acct.pageToken,
    );
    const d = r.data[0];
    return d ? { used: d.quota_usage ?? 0, total: d.config?.quota_total ?? 100 } : null;
  } catch {
    return null;
  }
}
