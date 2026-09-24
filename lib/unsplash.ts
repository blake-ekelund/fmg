/**
 * Unsplash — photos from the photographers we work with, for the image picker.
 *
 * Config (server env):
 *   UNSPLASH_ACCESS_KEY    — the app's Access Key (unsplash.com/oauth/applications)
 *   UNSPLASH_PHOTOGRAPHERS — comma-separated Unsplash usernames, e.g. "jane,joe"
 *
 * API-guideline obligations this module (and the picker) keep:
 *   - hotlink the images.unsplash.com URL (never re-host it)
 *   - ping the photo's download_location when someone actually uses it
 *   - credit "Photo by <name> on Unsplash", both linked with utm params
 */

const API = "https://api.unsplash.com";
const APP_NAME = "fmg_portal"; // must match the registered Unsplash app ("FMG Portal")
const PER_PAGE = 30;

export type UnsplashPhoto = {
  id: string;
  /** Hotlinkable, sized for email/blog use (raw + dynamic resize params). */
  url: string;
  thumb: string;
  width: number;
  height: number;
  alt: string | null;
  description: string | null;
  likes: number;
  color: string | null;
  createdAt: string;
  /** Pass back to trackUnsplashDownload when the photo is chosen. */
  downloadLocation: string;
  photographer: { name: string; username: string; profileUrl: string };
  unsplashUrl: string;
};

type ApiPhoto = {
  id: string;
  width: number;
  height: number;
  color: string | null;
  created_at: string;
  alt_description: string | null;
  description: string | null;
  likes: number;
  urls: { raw: string; small: string };
  links: { html: string; download_location: string };
  user: { name: string; username: string; links: { html: string } };
};

export type UnsplashProfile = {
  username: string;
  name: string;
  bio: string | null;
  location: string | null;
  avatar: string | null;
  totalPhotos: number;
  totalDownloads: number | null;
  profileUrl: string;
};

type ApiUser = {
  username: string;
  name: string;
  bio: string | null;
  location: string | null;
  total_photos: number;
  downloads?: number;
  profile_image?: { large?: string };
  links: { html: string };
};

export function unsplashConfigured(): boolean {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY);
}

export function unsplashPhotographers(): string[] {
  return (process.env.UNSPLASH_PHOTOGRAPHERS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^@/, ""))
    .filter(Boolean);
}

const utm = (url: string) => `${url}${url.includes("?") ? "&" : "?"}utm_source=${APP_NAME}&utm_medium=referral`;

function toPhoto(p: ApiPhoto): UnsplashPhoto {
  return {
    id: p.id,
    // 1600w covers a 2x blog column and a 2x 600px email; fit=max never upscales.
    url: `${p.urls.raw}&w=1600&q=80&fm=jpg&fit=max`,
    thumb: p.urls.small,
    width: p.width,
    height: p.height,
    alt: p.alt_description ?? p.description ?? null,
    description: p.description,
    likes: p.likes,
    color: p.color,
    createdAt: p.created_at,
    downloadLocation: p.links.download_location,
    photographer: { name: p.user.name, username: p.user.username, profileUrl: utm(p.user.links.html) },
    unsplashUrl: utm(p.links.html),
  };
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" },
    // Demo-mode keys get 50 requests/hour — cache listings so browsing doesn't burn them.
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Unsplash ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * One page of photos from the given photographers (default: all configured),
 * newest first. Page N is page N of each photographer, merged.
 */
export async function listPhotographerPhotos(
  page: number,
  usernames: string[] = unsplashPhotographers(),
): Promise<{ photos: UnsplashPhoto[]; hasMore: boolean }> {
  const pages = await Promise.all(
    usernames.map((u) =>
      api<ApiPhoto[]>(`/users/${encodeURIComponent(u)}/photos?page=${page}&per_page=${PER_PAGE}&order_by=latest`),
    ),
  );
  const photos = pages.flat().map(toPhoto).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { photos, hasMore: pages.some((p) => p.length === PER_PAGE) };
}

/** Public profile + stats for each configured photographer. */
export async function getPhotographerProfiles(usernames: string[] = unsplashPhotographers()): Promise<UnsplashProfile[]> {
  const users = await Promise.all(usernames.map((u) => api<ApiUser>(`/users/${encodeURIComponent(u)}`)));
  return users.map((u) => ({
    username: u.username,
    name: u.name,
    bio: u.bio,
    location: u.location,
    avatar: u.profile_image?.large ?? null,
    totalPhotos: u.total_photos,
    totalDownloads: u.downloads ?? null,
    profileUrl: utm(u.links.html),
  }));
}

/** Required by the API guidelines whenever a photo is actually used. */
export async function trackUnsplashDownload(downloadLocation: string): Promise<void> {
  const url = new URL(downloadLocation);
  // Only ever call back to Unsplash's own API — this value comes from the client.
  if (url.origin !== API) throw new Error("Not an Unsplash download location");
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Unsplash ${res.status}`);
}
