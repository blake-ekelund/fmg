/**
 * Unsplash — our brands' collections and our photographers' work, for the
 * image pickers and Marketing → Photography.
 *
 * Sources: the brand collections below, plus any photographer accounts in env.
 * Config (server env):
 *   UNSPLASH_ACCESS_KEY    — the "FMG Portal" app's Access Key (unsplash.com/oauth/applications)
 *   UNSPLASH_PHOTOGRAPHERS — optional comma-separated Unsplash usernames, e.g. "jane,joe"
 *
 * The Access Key is public-scope only, so a collection must be PUBLIC on
 * Unsplash — a private one 404s here even though its share link works.
 *
 * API-guideline obligations this module (and its callers) keep:
 *   - hotlink the images.unsplash.com URL (never re-host it)
 *   - ping the photo's download_location when someone actually uses it
 *   - credit "Photo by <name> on Unsplash", both linked with utm params
 */

const API = "https://api.unsplash.com";
const APP_NAME = "fmg_portal"; // must match the registered Unsplash app ("FMG Portal")
const PER_PAGE = 30;

/** Brand photo collections on Unsplash (id = the segment after /collections/). */
const BRAND_COLLECTIONS: { key: string; label: string; id: string }[] = [
  { key: "sassy", label: "Sassy", id: "deBXpNW6csY" },
  { key: "ni", label: "Natural Inspirations", id: "4839527" },
];

/** The Unsplash collection for a blog/email brand ("Sassy" | "NI"), if there is one. */
export function brandCollection(brand: string): UnsplashSource | null {
  const c = BRAND_COLLECTIONS.find((b) => b.key === brand.toLowerCase());
  return c ? { ...c, kind: "collection" } : null;
}

export type UnsplashSource = { key: string; label: string; kind: "collection" | "user"; id: string };

/** Header-card details for a source (collection or photographer). */
export type UnsplashSourceInfo = {
  key: string;
  label: string;
  kind: "collection" | "user";
  title: string;
  subtitle: string | null;
  description: string | null;
  image: string | null;
  /** Everything in the collection/account, as unsplash.com counts it. */
  totalPhotos: number;
  /** What the API will actually return: Unsplash+ (paid) photos are excluded. */
  available: number;
  url: string;
};

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

type ApiUser = {
  username: string;
  name: string;
  bio: string | null;
  location: string | null;
  total_photos: number;
  profile_image?: { large?: string };
  links: { html: string };
};

type ApiCollection = {
  title: string;
  description: string | null;
  total_photos: number;
  cover_photo: { urls: { small: string } } | null;
  user: { name: string };
  links: { html: string };
};

export function unsplashConfigured(): boolean {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY);
}

export function unsplashSources(): UnsplashSource[] {
  const photographers = (process.env.UNSPLASH_PHOTOGRAPHERS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^@/, ""))
    .filter(Boolean);
  return [
    ...BRAND_COLLECTIONS.map((c) => ({ ...c, kind: "collection" as const })),
    ...photographers.map((u) => ({ key: `@${u}`, label: `@${u}`, kind: "user" as const, id: u })),
  ];
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
    if (res.status === 404) throw new Error("Not found — is it public on Unsplash?");
    const body = await res.text().catch(() => "");
    throw new Error(`Unsplash ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

/** Photo count the API will serve for a listing, via its X-Total header. */
async function servableCount(path: string): Promise<number> {
  const res = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}per_page=1`, {
    headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" },
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error(`Unsplash ${res.status}`);
  return Number(res.headers.get("x-total")) || 0;
}

/**
 * One page of photos from the given sources, newest first (page N is page N
 * of each source, merged and de-duplicated). A failing source doesn't sink the
 * rest — it comes back in `errors`.
 */
export async function listPhotos(
  page: number,
  sources: UnsplashSource[],
): Promise<{ photos: UnsplashPhoto[]; hasMore: boolean; errors: { key: string; label: string; message: string }[] }> {
  const results = await Promise.allSettled(
    sources.map((s) =>
      api<ApiPhoto[]>(
        s.kind === "collection"
          ? `/collections/${enc(s.id)}/photos?page=${page}&per_page=${PER_PAGE}`
          : `/users/${enc(s.id)}/photos?page=${page}&per_page=${PER_PAGE}&order_by=latest`,
      ),
    ),
  );
  const seen = new Set<string>();
  const photos: UnsplashPhoto[] = [];
  const errors: { key: string; label: string; message: string }[] = [];
  let hasMore = false;
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      errors.push({ key: sources[i].key, label: sources[i].label, message: String(r.reason?.message ?? r.reason) });
      return;
    }
    if (r.value.length === PER_PAGE) hasMore = true;
    for (const p of r.value) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      photos.push(toPhoto(p));
    }
  });
  photos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { photos, hasMore, errors };
}

/** Header-card details per source; sources that fail are simply left out. */
export async function getSourceInfo(sources: UnsplashSource[]): Promise<UnsplashSourceInfo[]> {
  const results = await Promise.allSettled(
    sources.map(async (s): Promise<UnsplashSourceInfo> => {
      if (s.kind === "collection") {
        const [c, available] = await Promise.all([
          api<ApiCollection>(`/collections/${enc(s.id)}`),
          servableCount(`/collections/${enc(s.id)}/photos`),
        ]);
        return {
          key: s.key,
          label: s.label,
          kind: s.kind,
          title: c.title,
          subtitle: `Curated by ${c.user.name}`,
          description: c.description,
          image: c.cover_photo?.urls.small ?? null,
          totalPhotos: c.total_photos,
          available,
          url: utm(c.links.html),
        };
      }
      const [u, available] = await Promise.all([
        api<ApiUser>(`/users/${enc(s.id)}`),
        servableCount(`/users/${enc(s.id)}/photos`),
      ]);
      return {
        key: s.key,
        label: s.label,
        kind: s.kind,
        title: u.name,
        subtitle: [`@${u.username}`, u.location].filter(Boolean).join(" · "),
        description: u.bio,
        image: u.profile_image?.large ?? null,
        totalPhotos: u.total_photos,
        available,
        url: utm(u.links.html),
      };
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
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
