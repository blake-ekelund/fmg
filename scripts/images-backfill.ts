/**
 * One-time cleanup of every stored image (Nov 2026, decisions in the image
 * registry migration 20261114020000):
 *
 *   1. FINGERPRINT every product photo (media-kit) and Image Library image
 *      (email-assets): SHA-256, size, dimensions → email_asset_meta.
 *   2. COLLAPSE DUPLICATES. Byte-identical product photos (the same fragrance
 *      shot uploaded to 9–16 products) become ONE file:
 *        - a "fragrance" photo on several products that share exactly one
 *          scent becomes a FRAGRANCE photo (fragrance_images) — its rows are
 *          re-pointed in place (keeping each product's drag order) and every
 *          other product with that scent gets it too (Blake: shared automatically);
 *        - anything else just re-points its rows to the one kept file.
 *   3. OPTIMIZE oversized product photos (> 600 KB or > 2400 px) to a
 *      web-sized JPEG/PNG under a readable SEO name, re-pointing every row.
 *      Library images are NOT re-encoded: their URLs are embedded in sent
 *      emails and blog posts.
 *   4. Replaced files go to image_delete_queue (deleted by the image-cleanup
 *      cron after 30 days), never deleted here.
 *   5. DESCRIBE (--describe): Sage writes title / alt text / description for
 *      every image missing alt text. Only empty fields are filled.
 *
 * Run (needs the migration applied):
 *   npx tsx scripts/images-backfill.ts                 # dry run: plan + numbers, writes nothing
 *   npx tsx scripts/images-backfill.ts --apply         # steps 1–4
 *   npx tsx scripts/images-backfill.ts --apply --describe [--limit=50]   # also step 5
 *
 * Idempotent: re-running skips files already fingerprinted at their final path.
 * Hashes are cached in the OS temp dir so a re-run doesn't re-download 1.4 GB.
 */
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });
loadDotenv();
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { optimizeImage, seoSlug, sha256, MAX_EDGE } from "../lib/images/optimize";
import { describeImage, type ImageContext } from "../lib/images/describe";
import { fragrancesOf, hasFragrance } from "../lib/images/fragrance";

const APPLY = process.argv.includes("--apply");
const DESCRIBE = process.argv.includes("--describe");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? Infinity);
const OPTIMIZE_OVER_BYTES = 600 * 1024;
const PB = "media-kit";
const LB = "email-assets";
const BRAND_NAMES: Record<string, string> = { Sassy: "Sassy + Co", NI: "Natural Inspirations" };

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type FileInfo = { bucket: string; path: string; size: number; etag: string };
type HashInfo = { sha: string; width: number | null; height: number | null };
type Row = { id: string; part: string; asset_type: string; storage_path: string; sort_order: number | null };
type Product = { part: string; brand: string | null; display_name: string | null; fragrance: string | null; is_tester: boolean | null };

const metaKey = (bucket: string, p: string) => (bucket === PB ? `${PB}:${p}` : p);
const log = (...a: unknown[]) => console.log(...a);

async function walk(bucket: string, prefix = "", out: FileInfo[] = []): Promise<FileInfo[]> {
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset: off });
    if (error) throw error;
    for (const it of data) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (!it.id) await walk(bucket, p, out);
      else if (/\.(png|jpe?g|gif|webp)$/i.test(it.name)) {
        const m = (it.metadata ?? {}) as { size?: number; eTag?: string };
        out.push({ bucket, path: p, size: m.size ?? 0, etag: m.eTag ?? "" });
      }
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function download(bucket: string, p: string): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await sb.storage.from(bucket).download(p);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
    if (attempt >= 2) throw new Error(`download ${bucket}/${p}: ${error?.message}`);
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T, i: number) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        await fn(items[k], k);
      }
    }),
  );
}

async function pagedSelect<T>(table: string, cols: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).order(order).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main() {
  // Migration check.
  const probe = await sb.from("fragrance_images").select("id").limit(1);
  const migrated = !probe.error;
  if (!migrated && APPLY) {
    console.error("The image registry migration (20261114020000) isn't applied yet — run `supabase db push` first.");
    process.exit(1);
  }
  if (!migrated) log("(Migration not applied yet — dry run only.)");
  log(APPLY ? "APPLY mode — writing changes." : "DRY RUN — nothing will be written. Add --apply to run it.");

  /* 1. Inventory + fingerprints */
  const files = [...(await walk(PB)), ...(await walk(LB))];
  log(`Files: ${files.filter((f) => f.bucket === PB).length} product, ${files.filter((f) => f.bucket === LB).length} library`);

  const cacheFile = path.join(os.tmpdir(), "fmg-image-hashes.json");
  const cache: Record<string, HashInfo> = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
  const ck = (f: FileInfo) => `${f.bucket}/${f.path}|${f.etag}|${f.size}`;
  const todo = files.filter((f) => !cache[ck(f)]);
  log(`Fingerprinting ${todo.length} files (${files.length - todo.length} cached)…`);
  let done = 0;
  await pool(todo, 8, async (f) => {
    const buf = await download(f.bucket, f.path);
    let width: number | null = null;
    let height: number | null = null;
    try {
      const m = await sharp(buf, { failOn: "none" }).metadata();
      const swap = (m.orientation ?? 1) >= 5;
      width = (swap ? m.height : m.width) ?? null;
      height = (swap ? m.width : m.height) ?? null;
    } catch {
      /* unreadable — leave dims null */
    }
    cache[ck(f)] = { sha: sha256(buf), width, height };
    if (++done % 100 === 0) {
      log(`  ${done}/${todo.length}`);
      fs.writeFileSync(cacheFile, JSON.stringify(cache));
    }
  });
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  const info = (f: FileInfo) => cache[ck(f)];

  const rows = await pagedSelect<Row>("media_kit_assets", "id, part, asset_type, storage_path, sort_order", "id");
  const products = await pagedSelect<Product>("inventory_products", "part, brand, display_name, fragrance, is_tester", "part");
  const productBy = new Map(products.map((p) => [p.part, p]));
  type MetaRow = { path: string; title: string | null; alt_text: string | null; description: string | null; sha256: string | null };
  const metaRows = migrated
    ? await pagedSelect<MetaRow>("email_asset_meta", "path, title, alt_text, description, sha256", "path")
    : (await pagedSelect<MetaRow>("email_asset_meta", "path, title, alt_text, description", "path")).map((m) => ({ ...m, sha256: null }));
  const metaBy = new Map(metaRows.map((m) => [m.path, m]));

  /* 2–4. Product photos: group referenced files by content */
  const fileBy = new Map(files.filter((f) => f.bucket === PB).map((f) => [f.path, f]));
  const rowsByPath = new Map<string, Row[]>();
  for (const r of rows) (rowsByPath.get(r.storage_path) ?? rowsByPath.set(r.storage_path, []).get(r.storage_path)!).push(r);
  const groups = new Map<string, string[]>(); // sha → paths
  for (const p of rowsByPath.keys()) {
    const f = fileBy.get(p);
    if (!f) continue;
    const sha = info(f).sha;
    (groups.get(sha) ?? groups.set(sha, []).get(sha)!).push(p);
  }

  const stats = { groups: groups.size, dupFiles: 0, fragranceShared: 0, newlyLinked: 0, optimized: 0, bytesBefore: 0, bytesAfter: 0, queued: 0, fingerprinted: 0 };
  const queue: { bucket: string; path: string; reason: string; replaced_by: string }[] = [];

  for (const [sha, paths] of groups) {
    const groupRows = paths.flatMap((p) => rowsByPath.get(p) ?? []);
    const parts = Array.from(new Set(groupRows.map((r) => r.part)));
    // Keep the copy with the most links (ties: shortest path, i.e. oldest naming).
    paths.sort((a, b) => (rowsByPath.get(b)?.length ?? 0) - (rowsByPath.get(a)?.length ?? 0) || a.length - b.length || a.localeCompare(b));
    const keep = paths[0];
    const f = fileBy.get(keep)!;
    const hi = info(f);
    stats.dupFiles += paths.length - 1;

    // Fragrance photo shared by ≥2 products with exactly one scent in common?
    let scent: string | null = null;
    let brand: string | null = null;
    if (parts.length >= 2 && groupRows.every((r) => r.asset_type === "fragrance")) {
      const ps = parts.map((p) => productBy.get(p)).filter((p): p is Product => !!p && !p.is_tester);
      const brands = new Set(ps.map((p) => p.brand));
      if (ps.length === parts.length && brands.size === 1) {
        brand = ps[0].brand;
        const common = fragrancesOf(ps[0].fragrance).filter((s) => ps.every((p) => hasFragrance(p.fragrance, s)));
        if (common.length === 1) scent = common[0];
      }
    }

    const needsOptimize = f.size > OPTIMIZE_OVER_BYTES || Math.max(hi.width ?? 0, hi.height ?? 0) > MAX_EDGE;
    const already = metaBy.get(metaKey(PB, keep))?.sha256 === sha;
    if (!needsOptimize && paths.length === 1 && !scent && already) continue;

    let finalPath = keep;
    let finalBytes = f.size;
    let dims = { width: hi.width, height: hi.height };
    let optimizedData: Buffer | null = null;
    if (needsOptimize || scent) {
      const p0 = productBy.get(groupRows[0].part);
      const type = groupRows[0].asset_type;
      const brandSlug = (brand ?? p0?.brand) === "NI" ? "natural-inspirations" : (brand ?? p0?.brand ?? "");
      const base = scent
        ? seoSlug(brandSlug, scent, "fragrance")
        : seoSlug(brandSlug, (p0?.display_name ?? "").replace(/\s+[l|]\s+Sassy \+ Co\s*$/i, ""), p0?.fragrance && fragrancesOf(p0.fragrance).length === 1 ? p0.fragrance : null, type);
      const dir = scent ? `fragrances/${seoSlug(brand!)}/${seoSlug(scent)}` : `inventory_products/${groupRows[0].part}/${type}`;
      if (needsOptimize) {
        const buf = await download(PB, keep);
        const out = await optimizeImage(buf, /\.png$/i.test(keep) ? "image/png" : "image/jpeg");
        if (!out.untouched) {
          optimizedData = out.data;
          finalPath = `${dir}/${base || "photo"}-${sha.slice(0, 8)}.${out.ext}`;
          finalBytes = out.data.length;
          dims = { width: out.width, height: out.height };
          stats.optimized++;
          stats.bytesBefore += f.size;
          stats.bytesAfter += out.data.length;
          if (APPLY) {
            const { error } = await sb.storage.from(PB).upload(finalPath, out.data, {
              contentType: out.contentType,
              cacheControl: "31536000",
              upsert: true,
            });
            if (error) throw new Error(`upload ${finalPath}: ${error.message}`);
          }
        }
      }
    }

    if (APPLY) {
      // Carry over any title / alt / description already written on an old copy.
      const oldMeta = paths.map((p) => metaBy.get(metaKey(PB, p))).find((m) => m && (m.title || m.alt_text || m.description));
      await sb.from("email_asset_meta").upsert(
        {
          path: metaKey(PB, finalPath),
          sha256: sha,
          bytes: finalBytes,
          width: dims.width,
          height: dims.height,
          ...(oldMeta && finalPath !== keep
            ? { title: oldMeta.title, alt_text: oldMeta.alt_text, description: oldMeta.description }
            : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "path" },
      );

      let fiId: string | null = null;
      if (scent && brand) {
        const { data: fi, error } = await sb
          .from("fragrance_images")
          .upsert({ brand, fragrance: scent, storage_path: finalPath, asset_type: "fragrance" }, { onConflict: "brand,fragrance,storage_path" })
          .select("id")
          .single();
        if (error) throw new Error(`fragrance_images: ${error.message}`);
        fiId = (fi as { id: string }).id;
      }
      // Re-point every row in place (keeps each product's drag order).
      const ids = groupRows.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await sb
          .from("media_kit_assets")
          .update({ storage_path: finalPath, ...(fiId ? { shared_from: fiId } : {}), updated_at: new Date().toISOString() })
          .in("id", ids.slice(i, i + 200));
        if (error) throw new Error(`repoint: ${error.message}`);
      }
      // A product that ended up with the same file twice keeps one row.
      const seen = new Set<string>();
      const extra = groupRows.filter((r) => (seen.has(r.part) ? true : (seen.add(r.part), false))).map((r) => r.id);
      if (extra.length) await sb.from("media_kit_assets").delete().in("id", extra);
    }
    if (scent) stats.fragranceShared++;
    void optimizedData;

    for (const p of paths) {
      if (p === finalPath) continue;
      queue.push({ bucket: PB, path: p, reason: paths.length > 1 ? "duplicate" : "optimized", replaced_by: finalPath });
    }
    stats.fingerprinted++;
  }

  // Fragrance photos now reach every product with the scent.
  if (APPLY) {
    const { syncAll } = await syncFragrance();
    stats.newlyLinked = syncAll;
  }

  // Library images: fingerprint only (URLs are in sent emails — never re-encode).
  const libRows = files
    .filter((f) => f.bucket === LB)
    .filter((f) => metaBy.get(f.path)?.sha256 !== info(f).sha)
    .map((f) => ({ path: f.path, sha256: info(f).sha, bytes: f.size, width: info(f).width, height: info(f).height, updated_at: new Date().toISOString() }));
  if (APPLY) {
    for (let i = 0; i < libRows.length; i += 200) {
      const { error } = await sb.from("email_asset_meta").upsert(libRows.slice(i, i + 200), { onConflict: "path" });
      if (error) throw new Error(`library meta: ${error.message}`);
    }
  }

  if (APPLY && queue.length) {
    for (let i = 0; i < queue.length; i += 200) {
      const { error } = await sb.from("image_delete_queue").upsert(queue.slice(i, i + 200), { onConflict: "bucket,path" });
      if (error) throw new Error(`queue: ${error.message}`);
    }
  }
  stats.queued = queue.length;

  const mb = (n: number) => `${(n / 1e6).toFixed(0)} MB`;
  log("\nProduct photos");
  log(`  distinct images            ${stats.groups}`);
  log(`  duplicate copies collapsed ${stats.dupFiles}`);
  log(`  → fragrance photos         ${stats.fragranceShared}${APPLY ? ` (shared rows added: ${stats.newlyLinked})` : ""}`);
  log(`  optimized for web          ${stats.optimized}${stats.optimized ? ` (${mb(stats.bytesBefore)} → ${mb(stats.bytesAfter)})` : needsNote()}`);
  log(`  old files queued (30 days) ${stats.queued}`);
  log(`Library images fingerprinted ${libRows.length}`);

  /* 5. Describe */
  if (DESCRIBE) await describeAll();
}

function needsNote() {
  return APPLY ? "" : " (sizes measured on --apply)";
}

async function syncFragrance(): Promise<{ syncAll: number }> {
  // Same rule as lib/images/registry.syncFragranceImages, scoped to everything.
  const fis = (await sb.from("fragrance_images").select("id, brand, fragrance, storage_path, asset_type")).data as
    | { id: string; brand: string; fragrance: string; storage_path: string; asset_type: string }[]
    | null;
  const products = await pagedSelect<Product>("inventory_products", "part, brand, display_name, fragrance, is_tester", "part");
  const rows = await pagedSelect<Row & { shared_from: string | null }>("media_kit_assets", "id, part, asset_type, storage_path, sort_order, shared_from", "id");
  const ex = new Set((((await sb.from("fragrance_image_exclusions").select("part, fragrance_image_id")).data ?? []) as { part: string; fragrance_image_id: string }[]).map((e) => `${e.part}|${e.fragrance_image_id}`));
  const have = new Set(rows.map((r) => `${r.part}|${r.storage_path}`));
  const inserts: Record<string, unknown>[] = [];
  for (const fi of fis ?? []) {
    for (const p of products) {
      if (p.is_tester || p.brand !== fi.brand || !hasFragrance(p.fragrance, fi.fragrance)) continue;
      if (ex.has(`${p.part}|${fi.id}`) || have.has(`${p.part}|${fi.storage_path}`)) continue;
      inserts.push({ part: p.part, asset_type: fi.asset_type, storage_path: fi.storage_path, shared_from: fi.id });
      have.add(`${p.part}|${fi.storage_path}`);
    }
  }
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await sb.from("media_kit_assets").insert(inserts.slice(i, i + 500));
    if (error) throw new Error(`sync insert: ${error.message}`);
  }
  return { syncAll: inserts.length };
}

async function describeAll() {
  if (!process.env.ANTHROPIC_API_KEY) {
    log("No ANTHROPIC_API_KEY — skipping descriptions.");
    return;
  }
  const rows = await pagedSelect<Row & { shared_from: string | null }>("media_kit_assets", "id, part, asset_type, storage_path, sort_order, shared_from", "id");
  const products = new Map((await pagedSelect<Product>("inventory_products", "part, brand, display_name, fragrance, is_tester", "part")).map((p) => [p.part, p]));
  const fis = new Map(
    (((await sb.from("fragrance_images").select("id, brand, fragrance")).data ?? []) as { id: string; brand: string; fragrance: string }[]).map((f) => [f.id, f]),
  );
  const meta = new Map(
    (await pagedSelect<{ path: string; title: string | null; alt_text: string | null; description: string | null }>("email_asset_meta", "path, title, alt_text, description", "path")).map((m) => [m.path, m]),
  );

  type Job = { bucket: string; path: string; ctx: ImageContext };
  const jobs: Job[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.storage_path)) continue;
    seen.add(r.storage_path);
    const m = meta.get(metaKey(PB, r.storage_path));
    if (m?.alt_text && m.title && m.description) continue;
    const fi = r.shared_from ? fis.get(r.shared_from) : null;
    const p = products.get(r.part);
    const brand = fi?.brand ?? p?.brand ?? null;
    jobs.push({
      bucket: PB,
      path: r.storage_path,
      ctx: fi
        ? { brand: brand ? BRAND_NAMES[brand] ?? brand : null, fragrance: fi.fragrance, photoType: "fragrance" }
        : {
            brand: brand ? BRAND_NAMES[brand] ?? brand : null,
            productName: (p?.display_name ?? "").replace(/\s+[l|]\s+Sassy \+ Co\s*$/i, "") || null,
            fragrance: p?.fragrance ?? null,
            photoType: r.asset_type,
          },
    });
  }
  const lib = await walk(LB);
  for (const f of lib) {
    const m = meta.get(f.path);
    if (m?.alt_text && m.title && m.description) continue;
    jobs.push({ bucket: LB, path: f.path, ctx: { folder: f.path.split("/").slice(0, -1).join("/") || null, fileName: f.path.split("/").pop() } });
  }

  const run = jobs.slice(0, LIMIT);
  log(`\nDescribing ${run.length} of ${jobs.length} images missing text${APPLY ? "" : " (dry run: no calls made)"}…`);
  if (!APPLY) return;
  let ok = 0;
  let fail = 0;
  await pool(run, 4, async (j) => {
    try {
      const buf = await download(j.bucket, j.path);
      const d = await describeImage(buf, j.ctx);
      if (!d) {
        fail++;
        return;
      }
      const key = metaKey(j.bucket, j.path);
      const cur = meta.get(key);
      const patch: Record<string, unknown> = { path: key, ai_described_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (!cur?.title) patch.title = d.title;
      if (!cur?.alt_text) patch.alt_text = d.altText;
      if (!cur?.description) patch.description = d.description;
      const { error } = await sb.from("email_asset_meta").upsert(patch, { onConflict: "path" });
      if (error) throw error;
      if (++ok % 25 === 0) log(`  ${ok} described`);
    } catch (e) {
      fail++;
      console.error("  describe failed:", j.path, e instanceof Error ? e.message : e);
    }
  });
  log(`Described ${ok}, failed ${fail}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
