"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, AlertTriangle, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { Competitor } from "./types";

type Props = { id: string | "new" };

export default function CompetitorForm({ id }: Props) {
  const router = useRouter();
  const isNew = id === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [locatorUrl, setLocatorUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const { data, error } = await supabase
        .from("competitors")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        setError(error?.message ?? "Competitor not found");
        setLoading(false);
        return;
      }
      const c = data as Competitor;
      setName(c.name);
      // Prefer the original locator URL the user entered; fall back to base_url
      const original =
        (c.request_config as { originalLocatorUrl?: string } | null)?.originalLocatorUrl;
      setLocatorUrl(original ?? `${c.base_url}${c.endpoint_path}`);
      setNotes(c.notes ?? "");
      setEnabled(c.enabled);
      const platform = inferPlatform(c);
      setDetectedPlatform(platform);
      setLoading(false);
    })();
  }, [id, isNew]);

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/competitors/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: isNew ? undefined : id,
          name: name.trim(),
          locatorUrl: locatorUrl.trim(),
          notes: notes.trim() || null,
          enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        setSaving(false);
        return;
      }
      router.push("/marketing/competitors");
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-2xl space-y-6">
      <Link
        href="/marketing/competitors"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={14} /> Back to competitors
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isNew ? "New Competitor" : `Edit: ${name}`}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste the public "where to buy" page URL — we'll figure out the rest.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Thymes"
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Locator page URL</span>
          <input
            type="url"
            value={locatorUrl}
            onChange={(e) => setLocatorUrl(e.target.value)}
            placeholder="https://thymes.com/pages/stores"
            className={inputCls + " font-mono text-xs"}
          />
          <span className="block text-xs text-gray-400 mt-1">
            Paste the public page a shopper would visit to find retailers.
          </span>
        </label>

        {detectedPlatform && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs border border-violet-200">
            <Sparkles size={12} /> Detected: <span className="font-medium capitalize">{detectedPlatform}</span>
          </div>
        )}

        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputCls}
          />
        </label>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-sm text-gray-700">Include in scheduled scrapes</span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Link
          href="/marketing/competitors"
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </Link>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || !locatorUrl.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
        >
          <Save size={14} /> {saving ? "Detecting & saving…" : isNew ? "Detect & create" : "Save"}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 transition";

function inferPlatform(c: Competitor): string | null {
  const req = c.request_config as { platform?: string; latParam?: string; radiusParam?: string };
  if (req?.platform) return req.platform;
  // Heuristic fallback for the Thymes seed row which predates the platform field
  if (req?.latParam === "lat" && req?.radiusParam === "r") return "stockist";
  return null;
}
