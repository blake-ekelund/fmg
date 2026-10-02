"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Package,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import clsx from "clsx";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";

import { supabase } from "@/lib/supabaseClient";
import { Product } from "@/components/inventory/types";
import PageHeader from "@/components/ui/PageHeader";
import { CHART_NAVY } from "@/lib/colors";
import { type Trend, TREND_CONFIG, computeTrend } from "@/lib/trends";
import { project, colorFor } from "@/components/inventory/forecasting/utils/forecast";
import { addMonths } from "@/components/inventory/forecasting/utils/date";
import type { ForecastRow } from "@/components/inventory/forecasting/types";
import type { Section as MediaSection } from "@/components/marketing/media-kit/components/modalSections/types";
import ProductPhotos from "./ProductPhotos";
import { DetailsSection } from "./DetailsSection";

/* ─── Types ─── */

type MediaKitText = {
  short_description: string | null;
  long_description: string | null;
  benefits: string | null;
  ingredients_text: string | null;
  how_to_use: string | null;
  retailer_notes: string | null;
};

type AssetRecord = {
  id: string;
  asset_type: string;
  storage_path: string;
};

type SalesRow = {
  month: string;
  revenue: number;
  units_fulfilled: number;
};

type Section = "details" | "inventory" | "media" | "sales";

type TabIndicator = {
  color: string;
  bg: string;
  label: string;
} | null;

/* ─── Helpers ─── */

function fmtNum(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const ASSET_SECTIONS: MediaSection[] = [
  "front", "benefits", "lifestyle", "ingredients", "fragrance", "other",
];

/* ─── Page ─── */

export default function ProductDetailPage({
  partEncoded,
}: {
  partEncoded: string;
}) {
  const router = useRouter();
  const part = decodeURIComponent(partEncoded);

  const [product, setProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNewProduct = part.startsWith("NEW-");

  const [section, setSection] = useState<Section>("details");

  /* Product nav */
  const [allProducts, setAllProducts] = useState<
    { part: string; display_name: string; brand: string }[]
  >([]);

  /* Media kit */
  const [mediaText, setMediaText] = useState<MediaKitText | null>(null);
  const [mediaAssets, setMediaAssets] = useState<AssetRecord[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

  /* Inline media text editing */
  const [mkShortDesc, setMkShortDesc] = useState("");
  const [mkLongDesc, setMkLongDesc] = useState("");
  const [mkBenefits, setMkBenefits] = useState("");
  const [mkIngredients, setMkIngredients] = useState("");
  const [mkHowToUse, setMkHowToUse] = useState("");
  const [mkNotes, setMkNotes] = useState("");

  /* Per-section asset signed URLs for PhotoSection */
  const [assetImagesBySection, setAssetImagesBySection] = useState<
    Partial<Record<MediaSection, string[]>>
  >({});

  /* Sales */
  const [salesData, setSalesData] = useState<SalesRow[]>([]);

  /* Forecast */
  const [forecastOnHand, setForecastOnHand] = useState(0);
  const [forecastOnOrder, setForecastOnOrder] = useState(0);
  const [forecastSnapshotId, setForecastSnapshotId] = useState<string | null>(null);

  /* ─── Load product ─── */

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("inventory_products")
      .select("*")
      .eq("part", part)
      .maybeSingle();

    if (data) {
      setProduct(data as Product);
      setForm(data as Product);
    }
    setLoading(false);
  }, [part]);

  useEffect(() => {
    load();
  }, [load]);

  /* ─── Load all products for nav ─── */

  useEffect(() => {
    async function loadNav() {
      const { data } = await supabase
        .from("inventory_products")
        .select("part, display_name, brand")
        .eq("is_forecasted", true)
        .order("display_name");
      setAllProducts(data ?? []);
    }
    loadNav();
  }, []);

  /* ─── Load media kit ─── */

  const loadMedia = useCallback(async () => {
    const [textRes, assetsRes] = await Promise.all([
      supabase
        .from("media_kit_products")
        .select("short_description, long_description, benefits, ingredients_text, how_to_use, retailer_notes")
        .eq("part", part)
        .maybeSingle(),
      supabase
        .from("media_kit_assets")
        .select("id, asset_type, storage_path")
        .eq("part", part),
    ]);

    const text = (textRes.data as MediaKitText) ?? {
      short_description: null, long_description: null,
      benefits: null, ingredients_text: null,
      how_to_use: null, retailer_notes: null,
    };
    setMediaText(text);

    // Populate inline editing state
    setMkShortDesc(text.short_description ?? "");
    setMkLongDesc(text.long_description ?? "");
    setMkBenefits(text.benefits ?? "");
    setMkIngredients(text.ingredients_text ?? "");
    setMkHowToUse(text.how_to_use ?? "");
    setMkNotes(text.retailer_notes ?? "");

    const assets = (assetsRes.data as AssetRecord[]) ?? [];
    setMediaAssets(assets);

    // Build per-section signed URLs for PhotoSection
    if (assets.length > 0) {
      const paths = assets.map((a) => a.storage_path);
      const { data: signed } = await supabase.storage
        .from("media-kit")
        .createSignedUrls(paths, 3600);
      if (signed) {
        const urls: Record<string, string> = {};
        const bySection: Partial<Record<MediaSection, string[]>> = {};
        signed.forEach((s, i) => {
          if (s.signedUrl && s.path) {
            urls[s.path] = s.signedUrl;
            const assetType = assets[i]?.asset_type as MediaSection;
            if (assetType) {
              bySection[assetType] = [...(bySection[assetType] ?? []), s.signedUrl];
            }
          }
        });
        setAssetUrls(urls);
        setAssetImagesBySection(bySection);
      }
    } else {
      setAssetUrls({});
      setAssetImagesBySection({});
    }
  }, [part]);

  // Load media eagerly on mount so data is ready for Copy/Media tabs
  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  /* ─── Load sales + compute trend + auto-fill avg demand ─── */

  useEffect(() => {
    async function loadSales() {
      const { data } = await supabase
        .from("sales_by_product_month_enriched")
        .select("month, revenue, units_fulfilled")
        .eq("productnum", part)
        .order("month", { ascending: false })
        .limit(50);

      const byMonth: Record<string, SalesRow> = {};
      ((data as SalesRow[]) ?? []).forEach((r) => {
        if (!byMonth[r.month]) {
          byMonth[r.month] = { month: r.month, revenue: 0, units_fulfilled: 0 };
        }
        byMonth[r.month].revenue += r.revenue ?? 0;
        byMonth[r.month].units_fulfilled += r.units_fulfilled ?? 0;
      });

      const aggregated = Object.values(byMonth)
        .sort((a, b) => b.month.localeCompare(a.month))
        .slice(0, 12);

      setSalesData(aggregated);
    }
    loadSales();
  }, [part]);

  /* ─── Load forecast inventory data ─── */

  useEffect(() => {
    async function loadForecast() {
      // Get latest snapshot upload
      const { data: latestUpload } = await supabase
        .from("inventory_uploads")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!latestUpload) return;

      const { data: snap } = await supabase
        .from("inventory_snapshot_items")
        .select("id, on_hand, on_order")
        .eq("upload_id", latestUpload.id)
        .eq("part", part)
        .maybeSingle();

      if (snap) {
        setForecastOnHand(snap.on_hand ?? 0);
        setForecastOnOrder(snap.on_order ?? 0);
        setForecastSnapshotId(snap.id);
      }
    }
    loadForecast();
  }, [part]);

  /* Auto-fill avg_monthly_demand from trailing 90d and default lead time.
     Only fills when the DB value (product) is 0 — uses product (immutable after load)
     so this won't re-trigger when the user edits form fields. */
  useEffect(() => {
    if (!product || salesData.length === 0) return;

    const recent3 = salesData.slice(0, 3);
    const totalUnits = recent3.reduce((s, r) => s + r.units_fulfilled, 0);
    const avgDemand = Math.round(totalUnits / Math.max(recent3.length, 1));

    const updates: Partial<Product> = {};
    if (product.avg_monthly_demand === 0 && avgDemand > 0) {
      updates.avg_monthly_demand = avgDemand;
    }
    if (product.lead_time_months === 0) {
      updates.lead_time_months = 3;
    }

    if (Object.keys(updates).length > 0) {
      setForm((f) => (f ? { ...f, ...updates } : f));
    }
  }, [product, salesData]);

  /* ─── Trend (90-day windows) ─── */

  const trend = useMemo((): Trend => {
    if (salesData.length === 0) return "unknown";

    const now = new Date();
    const d90ago = new Date(now);
    d90ago.setDate(d90ago.getDate() - 90);
    const d180ago = new Date(now);
    d180ago.setDate(d180ago.getDate() - 180);

    const cutoff90 = d90ago.toISOString().slice(0, 10);
    const cutoff180 = d180ago.toISOString().slice(0, 10);

    let recent90 = 0;
    let prior90 = 0;
    let hasSalesInLast180 = false;
    let hasSalesBefore180 = false;

    for (const r of salesData) {
      const units = r.units_fulfilled ?? 0;
      if (r.month >= cutoff90) {
        recent90 += units;
        hasSalesInLast180 = true;
      } else if (r.month >= cutoff180) {
        prior90 += units;
        hasSalesInLast180 = true;
      } else {
        if (units > 0) hasSalesBefore180 = true;
      }
    }

    return computeTrend(recent90, prior90, hasSalesInLast180, hasSalesBefore180);
  }, [salesData]);

  const trendCfg = TREND_CONFIG[trend];
  const TrendIcon = trendCfg.icon;

  /* ─── Form helpers ─── */

  function update<K extends keyof Product>(k: K, v: Product[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setSaved(false);
  }

  // Copy fields (now in Details tab) are dirty when local mk* state differs
  // from the loaded mediaText snapshot.
  const copyDirty = !!(
    mediaText &&
    (
      (mediaText.short_description ?? "") !== mkShortDesc ||
      (mediaText.long_description ?? "") !== mkLongDesc ||
      (mediaText.benefits ?? "") !== mkBenefits ||
      (mediaText.ingredients_text ?? "") !== mkIngredients ||
      (mediaText.how_to_use ?? "") !== mkHowToUse ||
      (mediaText.retailer_notes ?? "") !== mkNotes
    )
  );
  const productDirty = !!(form && product && JSON.stringify(form) !== JSON.stringify(product));
  const hasChanges = productDirty || copyDirty;

  async function persistCopy() {
    const { error } = await supabase.from("media_kit_products").upsert({
      part,
      short_description: mkShortDesc,
      long_description: mkLongDesc,
      benefits: mkBenefits,
      ingredients_text: mkIngredients,
      how_to_use: mkHowToUse,
      retailer_notes: mkNotes,
      updated_at: new Date().toISOString(),
    });
    if (error) return { error };
    setMediaText({
      short_description: mkShortDesc || null,
      long_description: mkLongDesc || null,
      benefits: mkBenefits || null,
      ingredients_text: mkIngredients || null,
      how_to_use: mkHowToUse || null,
      retailer_notes: mkNotes || null,
    });
    return { error: null };
  }

  /** Autosave plumbing (see "Autosave" below): in-flight guard + latest save fn. */
  const savingRef = useRef(false);
  const saveAgainRef = useRef(false);
  const saveRef = useRef<() => Promise<void>>(async () => {});

  function requestSave() {
    if (isNewProduct) return;
    window.setTimeout(() => void saveRef.current(), 120);
  }

  async function handleSave() {
    if (!form || !hasChanges) return;
    // One save at a time; a field finished mid-save is picked up right after.
    if (savingRef.current) {
      saveAgainRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaving(true);

    // If new product and SKU was changed, delete old placeholder row and insert with new SKU
    const skuChanged = isNewProduct && form.part !== part;
    if (skuChanged) {
      // Strip id so Supabase generates a fresh one for the new row
      const { id: _id, ...insertData } = form;
      // Delete the placeholder first (no FK deps on a brand-new product)
      await supabase.from("inventory_products").delete().eq("part", part);
      const { error: insertErr } = await supabase.from("inventory_products").insert(insertData);
      if (insertErr) {
        console.error("Failed to save with new SKU", insertErr);
        alert("Failed to save. SKU may already exist.");
        savingRef.current = false;
        setSaving(false);
        return;
      }
      router.replace(`/products/${encodeURIComponent(form.part)}`);
      return;
    }

    // Persist inventory + copy in parallel.
    const [invRes, copyRes] = await Promise.all([
      productDirty
        ? supabase.from("inventory_products").update(form).eq("part", part)
        : Promise.resolve({ error: null }),
      copyDirty ? persistCopy() : Promise.resolve({ error: null }),
    ]);

    const saveError = invRes?.error ?? copyRes?.error;
    if (saveError) {
      console.error("Save failed", saveError);
      alert(`Save failed: ${saveError.message}`);
      savingRef.current = false;
      saveAgainRef.current = false;
      setSaving(false);
      return;
    }

    setProduct({ ...form });
    savingRef.current = false;
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    if (saveAgainRef.current) {
      saveAgainRef.current = false;
      requestSave();
    }
  }

  /* ─── Autosave ───
   * Saves when the user finishes an input — leaves a text/number field or
   * presses Enter, picks from a dropdown / checkbox, or flips a toggle — never
   * per keystroke. The save runs a beat later so it sees the state the input
   * just committed (via saveRef, refreshed after every render). New products
   * keep the manual Save bar: saving one rewrites its SKU and reloads.
   */
  useEffect(() => {
    saveRef.current = handleSave;
  });

  const autosaveProps = {
    onBlurCapture: (e: React.FocusEvent) => {
      if ((e.target as HTMLElement).matches?.('input, textarea, select, [contenteditable="true"]')) requestSave();
    },
    onChangeCapture: (e: React.FormEvent) => {
      // Discrete pickers commit on change; colour inputs fire continuously while dragging, so they wait for blur.
      if ((e.target as HTMLElement).matches?.('select, input[type="checkbox"], input[type="radio"]')) requestSave();
    },
    onKeyDownCapture: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.target as HTMLElement).matches?.("input")) requestSave();
    },
    onClickCapture: (e: React.MouseEvent) => {
      // Toggles and option buttons commit on click.
      if ((e.target as HTMLElement).closest?.("button")) requestSave();
    },
  };

  async function handleDelete() {
    setDeleting(true);
    await supabase.from("inventory_products").delete().eq("part", part);
    router.push("/products");
  }

  /* ─── Derived data ─── */


  const salesTotals = useMemo(() => {
    const rev = salesData.reduce((s, r) => s + (r.revenue ?? 0), 0);
    const units = salesData.reduce((s, r) => s + (r.units_fulfilled ?? 0), 0);
    return { revenue: rev, units };
  }, [salesData]);

  const chartData = useMemo(() => {
    return [...salesData]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((row) => {
        const date = new Date(row.month + "T00:00:00");
        return {
          label: date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
          revenue: row.revenue,
          units: row.units_fulfilled,
        };
      });
  }, [salesData]);

  // Media kit copy now persists via the unified handleSave (defined earlier).

  /* ─── Forecast projections ─── */

  const forecastRow = useMemo((): ForecastRow | null => {
    if (!form) return null;
    return {
      ...form,
      on_hand: forecastOnHand,
      on_order: forecastOnOrder,
      snapshot_id: forecastSnapshotId ?? "",
    };
  }, [form, forecastOnHand, forecastOnOrder, forecastSnapshotId]);

  const forecastMonths = 12;
  const forecastProjections = useMemo(() => {
    if (!forecastRow) return [];
    const now = new Date();
    return Array.from({ length: forecastMonths }, (_, i) => {
      const monthDate = addMonths(now, i);
      const projected = project(forecastRow, i, now);
      return {
        month: monthDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        projected: Math.round(projected),
        index: i,
      };
    });
  }, [forecastRow]);

  const monthsOfSupply = useMemo(() => {
    if (!form || form.avg_monthly_demand <= 0) return null;
    return (forecastOnHand + forecastOnOrder) / form.avg_monthly_demand;
  }, [form, forecastOnHand, forecastOnOrder]);

  const forecastStatus = useMemo(() => {
    if (!form || form.avg_monthly_demand <= 0)
      return { label: "No demand data", color: "text-gray-400", bg: "bg-gray-50", icon: Package };
    if (monthsOfSupply === null) return { label: "Unknown", color: "text-gray-400", bg: "bg-gray-50", icon: Package };
    if (monthsOfSupply > 3) return { label: "Healthy", color: "text-green-700", bg: "bg-green-50", icon: CheckCircle };
    if (monthsOfSupply > 1.5) return { label: "Needs Review", color: "text-amber-700", bg: "bg-amber-50", icon: AlertTriangle };
    return { label: "At Risk", color: "text-red-700", bg: "bg-red-50", icon: AlertTriangle };
  }, [form, monthsOfSupply]);

  /* ─── Tab status indicators ─── */

  const missingPhotoCount = useMemo(() => {
    return ASSET_SECTIONS.filter((s) => !(assetImagesBySection[s]?.length)).length;
  }, [assetImagesBySection]);

  const tabIndicators = useMemo((): Record<Section, TabIndicator> => {
    // Inventory & Forecast
    let invIndicator: TabIndicator = null;
    if (form && form.avg_monthly_demand > 0 && monthsOfSupply !== null) {
      if (monthsOfSupply > 3) invIndicator = { color: "text-green-700", bg: "bg-green-100", label: "Healthy" };
      else if (monthsOfSupply > 1.5) invIndicator = { color: "text-amber-700", bg: "bg-amber-100", label: "Review" };
      else invIndicator = { color: "text-red-700", bg: "bg-red-100", label: "At Risk" };
    }

    // Sales trend
    let salesIndicator: TabIndicator = null;
    if (trend !== "unknown") {
      salesIndicator = { color: trendCfg.color, bg: trendCfg.bg, label: trendCfg.label };
    }

    // Media (photos)
    let mediaIndicator: TabIndicator = null;
    if (mediaText !== null) {
      mediaIndicator = missingPhotoCount > 0
        ? { color: "text-amber-700", bg: "bg-amber-100", label: `${missingPhotoCount} missing` }
        : { color: "text-green-700", bg: "bg-green-100", label: "Complete" };
    }

    // Details tab indicator — show channel state at a glance.
    let detailsIndicator: TabIndicator = null;
    const channel = form?.storefront_channel ?? "off";
    if (channel === "d2c") {
      detailsIndicator = { color: "text-pink-700", bg: "bg-pink-100", label: "D2C" };
    } else if (channel === "wholesale") {
      detailsIndicator = { color: "text-indigo-700", bg: "bg-indigo-100", label: "Wholesale" };
    } else if (channel === "both") {
      detailsIndicator = { color: "text-gray-900", bg: "bg-gradient-to-r from-pink-100 to-indigo-100", label: "Both" };
    }

    return {
      details: detailsIndicator,
      inventory: invIndicator,
      sales: salesIndicator,
      media: mediaIndicator,
    };
  }, [form, monthsOfSupply, trend, trendCfg, mediaText, missingPhotoCount]);

  /* ─── Loading / Not Found ─── */

  if (loading) {
    return (
      <div className="px-4 md:px-8 py-6 md:py-8">
        <div className="flex items-center justify-center py-32">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
        <Link href="/products" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition">
          <ArrowLeft size={16} /> Back to products
        </Link>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-gray-900">Product not found</p>
          <p className="mt-1 text-sm text-gray-500">No product with SKU &ldquo;{part}&rdquo; exists.</p>
        </div>
      </div>
    );
  }

  const NAV_SECTIONS: { value: Section; label: string }[] = [
    { value: "details", label: "Details" },
    { value: "inventory", label: "Inventory" },
    { value: "sales", label: "Sales" },
    { value: "media", label: "Media" },
  ];

  /* ─── Prev / Next product ─── */

  const currentIdx = allProducts.findIndex((p) => p.part === part);
  const prevProduct = currentIdx > 0 ? allProducts[currentIdx - 1] : null;
  const nextProduct = currentIdx >= 0 && currentIdx < allProducts.length - 1 ? allProducts[currentIdx + 1] : null;

  /* ─── Render ─── */

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-5" {...autosaveProps}>
      {/* Top bar: back + prev/next */}
      <div className="flex items-center justify-between">
        <Link href="/products" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition">
          <ArrowLeft size={16} /> Back to products
        </Link>
        <div className="flex items-center gap-1">
          {prevProduct ? (
            <Link
              href={`/products/${encodeURIComponent(prevProduct.part)}`}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
              title={prevProduct.display_name}
            >
              <ChevronLeft size={14} />
              <span className="hidden sm:inline max-w-[120px] truncate">{prevProduct.display_name}</span>
              <span className="sm:hidden">Prev</span>
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-300 cursor-default">
              <ChevronLeft size={14} />
              <span className="hidden sm:inline">Prev</span>
            </span>
          )}

          {allProducts.length > 0 && (
            <span className="text-[10px] text-gray-400 tabular-nums px-1">
              {currentIdx + 1} / {allProducts.length}
            </span>
          )}

          {nextProduct ? (
            <Link
              href={`/products/${encodeURIComponent(nextProduct.part)}`}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
              title={nextProduct.display_name}
            >
              <span className="hidden sm:inline max-w-[120px] truncate">{nextProduct.display_name}</span>
              <span className="sm:hidden">Next</span>
              <ChevronRight size={14} />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-300 cursor-default">
              <span className="hidden sm:inline">Next</span>
              <ChevronRight size={14} />
            </span>
          )}
        </div>
      </div>

      {/* Header with trend badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{form.display_name || "Untitled Product"}</h1>
            {trend !== "unknown" && (
              <span className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", trendCfg.bg, trendCfg.color)}>
                <TrendIcon size={12} />
                {trendCfg.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-gray-500 font-mono">{form.part}</p>
        </div>
      </div>

      {/* ─── Two-Panel Layout ─── */}
      <div className="flex gap-6 items-start">
        {/* LEFT PANEL */}
        <div className="w-full space-y-5">
          {/* Section Nav */}
          <nav className="flex gap-1 rounded-lg bg-white border border-gray-200 p-1">
            {NAV_SECTIONS.map((s) => {
              const indicator = tabIndicators[s.value];
              return (
                <button
                  key={s.value}
                  onClick={() => setSection(s.value)}
                  className={clsx(
                    "flex-1 rounded-md px-3 py-2 text-sm font-medium transition flex items-center justify-center gap-1.5",
                    section === s.value
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-500 hover:text-gray-900"
                  )}
                >
                  {s.label}
                  {indicator && (
                    <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none", indicator.bg, indicator.color)}>
                      {indicator.label}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* ─── DETAILS (core product + publish + pricing + marketing copy + shipping) ─── */}
          {section === "details" && (
            <DetailsSection
              form={form}
              update={update}
              isNewProduct={isNewProduct}
              onHand={forecastOnHand}
              copy={{
                short_description: mkShortDesc,
                long_description: mkLongDesc,
                benefits: mkBenefits,
                ingredients_text: mkIngredients,
                how_to_use: mkHowToUse,
                retailer_notes: mkNotes,
              }}
              updateCopy={(k, v) => {
                if (k === "short_description") setMkShortDesc(v);
                else if (k === "long_description") setMkLongDesc(v);
                else if (k === "benefits") setMkBenefits(v);
                else if (k === "ingredients_text") setMkIngredients(v);
                else if (k === "how_to_use") setMkHowToUse(v);
                else if (k === "retailer_notes") setMkNotes(v);
              }}
            />
          )}

          {/* ─── INVENTORY & FORECAST ─── */}
          {section === "inventory" && (
            <div className="space-y-5">
              {/* KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={clsx("rounded-xl border px-4 py-3", forecastStatus.bg, "border-gray-200")}>
                  <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Status</div>
                  <div className={clsx("mt-0.5 flex items-center gap-1.5 text-sm font-semibold", forecastStatus.color)}>
                    <forecastStatus.icon size={14} />
                    {forecastStatus.label}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">On Hand</div>
                  <div className="mt-0.5 text-xl font-semibold text-gray-900 tabular-nums">{fmtNum(forecastOnHand)}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">On Order</div>
                  <div className="mt-0.5 text-xl font-semibold text-gray-900 tabular-nums">{fmtNum(forecastOnOrder)}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Months of Supply</div>
                  <div className="mt-0.5 text-xl font-semibold text-gray-900 tabular-nums">
                    {monthsOfSupply !== null ? monthsOfSupply.toFixed(1) : "—"}
                  </div>
                </div>
              </div>

              {/* Inventory Rules — editable */}
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100">
                  <div>
                    <h2 className="text-sm font-medium text-gray-900">Inventory Rules</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Avg monthly demand auto-populated from trailing 90-day sales. Lead time defaults to 3 months.
                    </p>
                  </div>
                  {/* Was the "Status" side panel. Off = archived: out of demand planning and off the storefronts. */}
                  <label className="flex shrink-0 items-center gap-2.5">
                    <span className="text-right">
                      <span className="block text-sm font-medium text-gray-900">Include in Forecast</span>
                      <span className="block text-xs text-gray-500">Off also takes it off the storefronts</span>
                    </span>
                    <Toggle
                      checked={form.is_forecasted}
                      onChange={(v) => {
                        update("is_forecasted", v);
                        // Archiving pulls the product off the storefronts (Draft).
                        if (!v) update("storefront_channel", "off");
                      }}
                    />
                  </label>
                </div>
                <div className="px-5 py-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <FormattedNumField label="Min Qty" value={form.min_qty} onChange={(v) => update("min_qty", v)} />
                    <FormattedNumField label="Max Qty" value={form.max_qty} onChange={(v) => update("max_qty", v)} />
                    <FormattedNumField label="Lead Time (mo)" value={form.lead_time_months} onChange={(v) => update("lead_time_months", v)} />
                    <FormattedNumField label="Avg Monthly Demand" value={form.avg_monthly_demand} onChange={(v) => update("avg_monthly_demand", v)} />
                  </div>
                </div>
              </div>

              {/* Projection chart + table */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-medium text-gray-900">12-Month Projection</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Based on {fmtNum(form.avg_monthly_demand)} units/mo demand · {form.lead_time_months}mo lead time
                  </p>
                </div>

                {form.avg_monthly_demand > 0 ? (
                  <>
                    <div className="px-4 pt-4 pb-2">
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={forecastProjections} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtNum(v)} width={50} />
                          <Tooltip
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={(value: any) => [fmtNum(Number(value)), "Projected"]}
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                          />
                          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} />
                          {form.min_qty > 0 && (
                            <ReferenceLine y={form.min_qty} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "Min", position: "right", fontSize: 10, fill: "#f59e0b" }} />
                          )}
                          <Line type="monotone" dataKey="projected" stroke={CHART_NAVY} strokeWidth={2} dot={{ r: 3, fill: CHART_NAVY, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-t border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-400">
                          <th className="px-4 py-2 text-left font-medium">Month</th>
                          <th className="px-4 py-2 text-right font-medium">Projected Qty</th>
                          <th className="px-4 py-2 text-right font-medium">vs Min</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecastProjections.map((p, idx) => {
                          const belowMin = p.projected < form.min_qty;
                          const belowZero = p.projected < 0;
                          return (
                            <tr key={p.month} className={clsx(
                              idx !== forecastProjections.length - 1 && "border-b border-gray-50",
                              belowZero && "bg-red-50",
                              !belowZero && belowMin && "bg-amber-50/50"
                            )}>
                              <td className="px-4 py-2 text-gray-900 font-medium">{p.month}</td>
                              <td className={clsx("px-4 py-2 text-right tabular-nums font-medium",
                                belowZero ? "text-red-600" : belowMin ? "text-amber-600" : "text-gray-700"
                              )}>
                                {fmtNum(p.projected)}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                                {form.min_qty > 0 ? (
                                  <span className={clsx(p.projected >= form.min_qty ? "text-green-600" : "text-red-500")}>
                                    {p.projected >= form.min_qty ? "+" : ""}{fmtNum(p.projected - form.min_qty)}
                                  </span>
                                ) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <div className="px-5 py-10 text-center text-sm text-gray-500">
                    Set average monthly demand above to generate projections.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── MEDIA ─── */}
          {section === "media" && (
            <ProductPhotos
              part={part}
              productName={form.display_name || part}
              photos={mediaAssets.map((a) => ({
                id: a.id,
                tag: a.asset_type,
                path: a.storage_path,
                url: assetUrls[a.storage_path] ?? null,
              }))}
              onChanged={loadMedia}
            />
          )}

          {/* ─── SALES ANALYSIS ─── */}
          {section === "sales" && (
            <div className="space-y-5">
              {/* KPI row */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">TTM Revenue</div>
                  <div className="mt-0.5 text-xl font-semibold text-gray-900 tabular-nums">
                    ${fmtNum(salesTotals.revenue)}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">TTM Units</div>
                  <div className="mt-0.5 text-xl font-semibold text-gray-900 tabular-nums">
                    {fmtNum(salesTotals.units)}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Trend</div>
                  <div className="mt-0.5">
                    <span className={clsx("inline-flex items-center gap-1 text-sm font-semibold", trendCfg.color)}>
                      <TrendIcon size={14} />
                      {trendCfg.label}
                    </span>
                  </div>
                </div>
              </div>

              {salesData.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-500">
                  No sales data available for this product.
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  {/* Chart */}
                  <div className="px-4 pt-4 pb-2">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                          tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                          width={44}
                        />
                        <Tooltip
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(value: any) => [`$${Number(value).toLocaleString()}`, "Revenue"]}
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                        />
                        <Bar dataKey="revenue" fill={CHART_NAVY} radius={[3, 3, 0, 0]} maxBarSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Table */}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-t border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-400">
                        <th className="px-4 py-2 text-left font-medium">Month</th>
                        <th className="px-4 py-2 text-right font-medium">Revenue</th>
                        <th className="px-4 py-2 text-right font-medium">Units</th>
                        <th className="px-4 py-2 text-right font-medium">Avg Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesData.map((row, idx) => {
                        const date = new Date(row.month + "T00:00:00");
                        const label = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
                        const avgPrice = row.units_fulfilled > 0 ? row.revenue / row.units_fulfilled : 0;
                        return (
                          <tr key={row.month} className={clsx(idx !== salesData.length - 1 && "border-b border-gray-50")}>
                            <td className="px-4 py-2 text-gray-900 font-medium">{label}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-700">${row.revenue.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-700">{row.units_fulfilled.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-500">{avgPrice > 0 ? `$${avgPrice.toFixed(2)}` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50/50">
                        <td className="px-4 py-2 text-gray-900 font-semibold text-[11px] uppercase tracking-wider">Total</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">${salesTotals.revenue.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">{salesTotals.units.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                          {salesTotals.units > 0 ? `$${(salesTotals.revenue / salesTotals.units).toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Danger Zone */}
          <div className="rounded-xl border border-red-200 bg-white">
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Delete this product</p>
                <p className="text-xs text-gray-500 mt-0.5">This action cannot be undone.</p>
              </div>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition">
                  <Trash2 size={14} /> Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 transition">Cancel</button>
                  <button onClick={handleDelete} disabled={deleting}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition disabled:opacity-50">
                    {deleting ? "Deleting..." : "Confirm Delete"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Sticky Save Bar — new products only; everything else autosaves */}
      {isNewProduct && hasChanges && (
        <div className="sticky bottom-0 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-white/90 backdrop-blur border-t border-gray-200 flex items-center justify-between z-10">
          <p className="text-sm text-gray-500">You have unsaved changes</p>
          <div className="flex items-center gap-3">
            <button onClick={load} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition">Discard</button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 transition shadow-sm disabled:opacity-50">
              <Save size={16} /> {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {(saving || saved) && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {saving ? "Saving…" : "Saved"}
        </div>
      )}

    </div>
  );
}

/* ─── Form Components ─── */

function Field({ label, value, onChange, disabled, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <input value={value} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-white px-3 py-2 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:bg-gray-50 disabled:text-gray-400 placeholder:text-gray-400 transition" />
    </div>
  );
}

function FormattedNumField({ label, value, onChange, prefix, decimals }: {
  label: string; value: number; onChange: (v: number) => void; prefix?: string; decimals?: number;
}) {
  const [display, setDisplay] = useState(
    (prefix ?? "") + value.toLocaleString("en-US", {
      minimumFractionDigits: decimals ?? 0,
      maximumFractionDigits: decimals ?? 0,
    })
  );

  // Sync when value changes externally
  useEffect(() => {
    setDisplay(
      (prefix ?? "") + value.toLocaleString("en-US", {
        minimumFractionDigits: decimals ?? 0,
        maximumFractionDigits: decimals ?? 0,
      })
    );
  }, [value, prefix, decimals]);

  function handleChange(raw: string) {
    // Strip prefix and commas, keep digits and decimal
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned) || 0;

    // Format for display
    const formatted = num.toLocaleString("en-US", {
      minimumFractionDigits: decimals ?? 0,
      maximumFractionDigits: decimals ?? 0,
    });
    setDisplay((prefix ?? "") + formatted);
    onChange(num);
  }

  function handleFocus() {
    // Show raw number on focus for easier editing
    setDisplay(
      value === 0 ? "" : value.toLocaleString("en-US", {
        minimumFractionDigits: decimals ?? 0,
        maximumFractionDigits: decimals ?? 0,
      })
    );
  }

  function handleBlur() {
    // Re-format on blur
    setDisplay(
      (prefix ?? "") + value.toLocaleString("en-US", {
        minimumFractionDigits: decimals ?? 0,
        maximumFractionDigits: decimals ?? 0,
      })
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <input
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="w-full rounded-lg bg-white px-3 py-2 text-sm text-right border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 transition tabular-nums"
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <p className={clsx("text-sm leading-relaxed", value ? "text-gray-700" : "text-gray-300 italic")}>
        {value || "Not set"}
      </p>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx("relative inline-flex h-6 w-11 items-center rounded-full transition shrink-0",
        disabled && "opacity-40 cursor-not-allowed",
        checked ? "bg-gray-900" : "bg-gray-200"
      )}>
      <span className={clsx("inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm",
        checked ? "translate-x-6" : "translate-x-1"
      )} />
    </button>
  );
}
