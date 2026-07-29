"use client";

import { useRef, useState } from "react";
import {
  Upload,
  Code2,
  ImagePlus,
  Copy,
  Check,
  Send,
  Loader2,
  Wand2,
  Ban,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { Brand, Channel, EmailTemplate } from "./types";
import { formatHtml } from "./formatHtml";
import { resizeImageForEmail } from "./resizeImage";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* Merge tokens mirror lib/email/send.ts (MergeVars) and the other editors. */
const MERGE_GROUPS: { group: string; fields: { key: string; label: string }[] }[] = [
  {
    group: "Customer",
    fields: [
      { key: "firstName", label: "First name" },
      { key: "customerName", label: "Company" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "channel", label: "Channel" },
      { key: "lifetimeRevenue", label: "Lifetime revenue" },
      { key: "lifetimeOrders", label: "Lifetime orders" },
      { key: "lastOrderDate", label: "Last order date" },
      { key: "daysSinceLastOrder", label: "Days since order" },
    ],
  },
  {
    group: "Sender",
    fields: [
      { key: "senderName", label: "Your name" },
      { key: "senderFirstName", label: "Your first name" },
      { key: "senderEmail", label: "Your email" },
    ],
  },
  {
    group: "Date",
    fields: [
      { key: "currentYear", label: "Year" },
      { key: "currentQuarter", label: "Quarter" },
    ],
  },
];

type UploadedAsset = { name: string; url: string; width: number; size: number };

type Props = {
  /** Persisted template id, needed to send a test. Null if never saved. */
  templateId: string | null;
  htmlView: "preview" | "code";
  rawHtml: string;
  setRawHtml: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  previewText: string;
  setPreviewText: (v: string) => void;
  fromName: string;
  setFromName: (v: string) => void;
  brand: Brand;
  setBrand: (v: Brand) => void;
  channel: Channel;
  setChannel: (v: Channel) => void;
  /** Persist the current editor state; resolves to the saved row (with id). */
  onRequestSave: () => Promise<EmailTemplate | null>;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function HtmlTemplateEditor({
  templateId,
  htmlView,
  rawHtml,
  setRawHtml,
  subject,
  setSubject,
  previewText,
  setPreviewText,
  fromName,
  setFromName,
  brand,
  setBrand,
  channel,
  setChannel,
  onRequestSave,
}: Props) {
  const replaceRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [imgBusy, setImgBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [testTo, setTestTo] = useState("");
  const [testState, setTestState] = useState<
    { s: "idle" } | { s: "sending" } | { s: "ok"; to: string } | { s: "err"; msg: string }
  >({ s: "idle" });

  /* ── Replace the HTML file ─────────────────────────────────────────────── */
  async function handleReplace(file: File | undefined | null) {
    setUploadError(null);
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== "text/html") {
      setUploadError("Please choose an .html file.");
      return;
    }
    const text = await file.text().catch(() => "");
    if (!text.trim()) {
      setUploadError("That file is empty or unreadable.");
      return;
    }
    setRawHtml(formatHtml(text));
  }

  /* ── Insert text at the cursor in the code view ────────────────────────── */
  function insertAtCursor(snippet: string) {
    const ta = codeRef.current;
    if (htmlView !== "code" || !ta) {
      // Not in the code editor — append so the click still does something.
      setRawHtml(rawHtml + snippet);
      return;
    }
    const start = ta.selectionStart ?? rawHtml.length;
    const end = ta.selectionEnd ?? rawHtml.length;
    const next = rawHtml.slice(0, start) + snippet + rawHtml.slice(end);
    setRawHtml(next);
    // Restore focus + caret just after the inserted text.
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + snippet.length;
      ta.setSelectionRange(caret, caret);
    });
  }

  /* ── Upload images to the public bucket ────────────────────────────────── */
  async function handleImages(files: FileList | null) {
    setUploadError(null);
    if (!files || files.length === 0) return;
    setImgBusy(true);
    const added: UploadedAsset[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setUploadError(`"${file.name}" is not an image.`);
        continue;
      }
      // Shrink + re-encode for email before it ever hits the bucket.
      const resized = await resizeImageForEmail(file);
      const safe = resized.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${templateId ?? "unsaved"}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from("email-assets").upload(path, resized.blob, {
        cacheControl: "31536000",
        contentType: resized.type,
        upsert: false,
      });
      if (error) {
        setUploadError(`Upload failed: ${error.message}`);
        continue;
      }
      const { data } = supabase.storage.from("email-assets").getPublicUrl(path);
      added.push({ name: resized.name, url: data.publicUrl, width: resized.width, size: resized.blob.size });
    }
    setAssets((prev) => [...added, ...prev]);
    setImgBusy(false);
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500);
    } catch {
      /* clipboard may be blocked; the URL is still visible to select */
    }
  }

  /* ── Send a test ───────────────────────────────────────────────────────── */
  async function sendTest() {
    setTestState({ s: "sending" });
    // Persist first so the server renders exactly what's on screen.
    const saved = await onRequestSave();
    const id = saved?.id ?? templateId;
    if (!id) {
      setTestState({ s: "err", msg: "Save the template first." });
      return;
    }
    try {
      const res = await fetch(`/api/email/block-templates/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestState({ s: "err", msg: json.error ?? "Send failed." });
        return;
      }
      setTestState({ s: "ok", to: json.sentTo ?? testTo.trim() });
    } catch (e) {
      setTestState({ s: "err", msg: e instanceof Error ? e.message : "Send failed." });
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: tools + settings */}
      <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
        {/* HTML file */}
        <div className="p-3 border-b border-gray-100">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">HTML File</div>
          <button
            onClick={() => replaceRef.current?.click()}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <Upload size={14} />
            Replace HTML file
          </button>
          <input
            ref={replaceRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(e) => {
              handleReplace(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
            Sent exactly as uploaded. Scripts and forms are stripped for safety.
          </p>
          {uploadError && <p className="mt-2 text-[11px] text-rose-600">{uploadError}</p>}
        </div>

        {/* Images */}
        <div className="p-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Images</span>
            {imgBusy && <Loader2 size={12} className="animate-spin text-gray-400" />}
          </div>
          <button
            onClick={() => imageRef.current?.click()}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            <ImagePlus size={14} />
            Upload image
          </button>
          <input
            ref={imageRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleImages(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
            Auto-resized for email and hosted publicly so recipients can see them. Insert into the code, or copy the URL.
          </p>

          {assets.length > 0 && (
            <ul className="mt-2.5 space-y-2">
              {assets.map((a) => (
                <li key={a.url} className="flex items-center gap-2 rounded-lg border border-gray-100 p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.name} className="h-9 w-9 shrink-0 rounded object-cover border border-gray-100" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium text-gray-700">{a.name}</div>
                    <div className="text-[10px] text-gray-400">
                      {a.width ? `${a.width}px · ` : ""}{formatBytes(a.size)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1">
                      <button
                        onClick={() => {
                          const displayW = a.width ? Math.min(a.width, 600) : 600;
                          insertAtCursor(
                            `<img src="${a.url}" alt="" width="${displayW}" style="display:block;width:100%;max-width:${displayW}px;height:auto;border:0;">`,
                          );
                        }}
                        className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-200 transition"
                      >
                        Insert
                      </button>
                      <button
                        onClick={() => copyUrl(a.url)}
                        className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-200 transition"
                      >
                        {copied === a.url ? <Check size={10} /> : <Copy size={10} />}
                        {copied === a.url ? "Copied" : "URL"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Merge fields */}
        <div className="p-3 border-b border-gray-100">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Merge Fields</span>
            <span className="text-[9px] text-gray-400">click to insert</span>
          </div>
          <div className="space-y-2">
            {MERGE_GROUPS.map(({ group, fields }) => (
              <div key={group}>
                <div className="mb-1 text-[10px] font-medium text-gray-500">{group}</div>
                <div className="flex flex-wrap gap-1">
                  {fields.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      title={`Inserts {{${f.key}}}`}
                      onClick={() => insertAtCursor(`{{${f.key}}}`)}
                      className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900 transition"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Unsubscribe */}
        <div className="p-3 border-b border-gray-100">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Unsubscribe</div>
          <button
            onClick={() =>
              insertAtCursor(
                `<a href="{{unsubscribeUrl}}" style="color:#6b7b88;text-decoration:underline;">Unsubscribe</a>`,
              )
            }
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <Ban size={14} />
            Insert unsubscribe link
          </button>
          <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
            Drops an <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{unsubscribeUrl}}"}</code> link
            you can place anywhere (e.g. your footer). If you don&apos;t add one, a default unsubscribe
            footer is appended automatically at send.
          </p>
        </div>

        {/* Settings */}
        <div className="p-3 border-b border-gray-100 space-y-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Settings</div>
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-500">Subject Line</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Your subject..."
              className="mt-1 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-500">Preview Text</span>
            <input
              type="text"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Shown in inbox..."
              className="mt-1 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-500">From Name</span>
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Natural Inspirations"
              className="mt-1 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500">Brand</span>
              <select value={brand} onChange={(e) => setBrand(e.target.value as Brand)} className="mt-1 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
                <option value="both">Both</option>
                <option value="ni">NI</option>
                <option value="sassy">Sassy</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500">Channel</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="mt-1 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
                <option value="both">Both</option>
                <option value="wholesale">Wholesale</option>
                <option value="d2c">D2C</option>
              </select>
            </label>
          </div>
        </div>

        {/* Send test */}
        <div className="p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Send Test</div>
          <input
            type="email"
            value={testTo}
            onChange={(e) => {
              setTestTo(e.target.value);
              if (testState.s !== "idle") setTestState({ s: "idle" });
            }}
            placeholder="you@example.com"
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <button
            onClick={sendTest}
            disabled={testState.s === "sending" || !testTo.trim()}
            className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition disabled:opacity-50"
          >
            {testState.s === "sending" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {testState.s === "sending" ? "Sending..." : "Send test email"}
          </button>
          {testState.s === "ok" && (
            <p className="mt-2 text-[11px] text-emerald-600">Sent to {testState.to}.</p>
          )}
          {testState.s === "err" && (
            <p className="mt-2 text-[11px] text-rose-600">{testState.msg}</p>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
            Sends through your connected mailbox with sample merge values. Not logged as a campaign.
          </p>
        </div>
      </div>

      {/* Center: preview or code */}
      <div className="flex-1 overflow-hidden bg-gray-100">
        {rawHtml.trim() === "" ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-8">
            <Code2 size={40} className="text-gray-300 mb-3" />
            <h3 className="text-sm font-semibold text-gray-600">No HTML yet</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">Upload an .html file to use as this template.</p>
            <button
              onClick={() => replaceRef.current?.click()}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition"
            >
              <Upload size={14} />
              Upload HTML
            </button>
          </div>
        ) : htmlView === "preview" ? (
          <div className="h-full p-4">
            {/* Sandboxed: no scripts run, so previewing is safe even before the
                server sanitises at send time. */}
            <iframe
              title="HTML preview"
              sandbox=""
              srcDoc={rawHtml}
              className="w-full h-full bg-white rounded-lg border border-gray-200 shadow-sm"
            />
          </div>
        ) : (
          <div className="relative h-full p-4">
            <button
              onClick={() => setRawHtml(formatHtml(rawHtml))}
              title="Reformat / beautify"
              className="absolute right-6 top-6 z-10 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-sm backdrop-blur hover:bg-white transition"
            >
              <Wand2 size={12} />
              Format
            </button>
            <textarea
              ref={codeRef}
              value={rawHtml}
              onChange={(e) => setRawHtml(e.target.value)}
              spellCheck={false}
              className="w-full h-full resize-none rounded-lg border border-gray-200 bg-white p-4 pt-11 font-mono text-xs leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        )}
      </div>
    </div>
  );
}
