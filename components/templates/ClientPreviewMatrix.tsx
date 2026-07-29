"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  Sun,
  Moon,
  ImageOff,
  Smartphone,
  Monitor,
  AlertCircle,
  AlertTriangle,
  Info,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import type { EmailTemplate } from "./types";
import {
  EMAIL_CLIENTS,
  clientById,
  lintEmailHtml,
  findingsForClient,
  type EmailClientId,
  type CompatSeverity,
} from "@/lib/email/clientCompat";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Persisted template id, or null if it's never been saved. */
  templateId: string | null;
  /** Persist current editor state; resolves to the saved row (with id). */
  onRequestSave: () => Promise<EmailTemplate | null>;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Pull the inner rules of every @media (prefers-color-scheme: dark) block. */
function extractDarkBlocks(css: string): string[] {
  const out: string[] = [];
  const re = /@media([^{]*)\{/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    if (!/prefers-color-scheme\s*:\s*dark/i.test(m[1])) continue;
    let depth = 1;
    let i = re.lastIndex;
    const start = i;
    while (i < css.length && depth > 0) {
      const ch = css[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    out.push(css.slice(start, i - 1));
    re.lastIndex = i;
  }
  return out;
}

/**
 * Approximate a given client's rendering of the email by transforming its HTML:
 * swap blocked images for alt placeholders, promote the email's own dark-mode
 * rules, and flatten CSS that Outlook's Word engine drops. This is an
 * approximation — the compatibility panel is the reliable signal.
 */
function transformForClient(
  baseHtml: string,
  client: EmailClientId,
  opts: { dark: boolean; imagesOff: boolean },
): string {
  if (typeof window === "undefined") return baseHtml;
  const doc = new DOMParser().parseFromString(baseHtml, "text/html");
  const head = doc.head ?? doc.documentElement;
  const injected: string[] = [];

  if (opts.imagesOff) {
    doc.querySelectorAll("img").forEach((img) => {
      const alt = img.getAttribute("alt") ?? "";
      const w = img.getAttribute("width");
      const dims = w ? `width:${/^\d+$/.test(w) ? `${w}px` : w};` : "";
      const ph = doc.createElement("span");
      ph.setAttribute(
        "style",
        `display:inline-block;box-sizing:border-box;border:1px solid #cbd5e1;background:#f1f5f9;` +
          `color:#64748b;font:11px/1.3 Arial,sans-serif;padding:6px 8px;vertical-align:middle;${dims}`,
      );
      ph.textContent = alt ? `⊘ ${alt}` : "⊘ Image";
      img.replaceWith(ph);
    });
  }

  if (opts.dark) {
    const darkRules: string[] = [];
    doc.querySelectorAll("style").forEach((s) => {
      darkRules.push(...extractDarkBlocks(s.textContent ?? ""));
    });
    // A dark canvas so even an email with no dark styles reads as dark-mode.
    injected.push("html,body{background:#1c1c1e !important;color:#e6e6e6;}");
    if (darkRules.length) injected.push(darkRules.join("\n"));
    const meta = doc.createElement("meta");
    meta.setAttribute("name", "color-scheme");
    meta.setAttribute("content", "dark");
    head.appendChild(meta);
  }

  if (client === "outlook-desktop") {
    // Word drops these outright — flatten them so the preview reflects reality.
    injected.push(
      "*{border-radius:0 !important;box-shadow:none !important;text-shadow:none !important;background-image:none !important;}",
    );
  }

  if (injected.length) {
    const style = doc.createElement("style");
    style.textContent = injected.join("\n");
    head.appendChild(style);
  }

  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
}

const SEV_ICON: Record<CompatSeverity, typeof Info> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};
const SEV_STYLE: Record<CompatSeverity, string> = {
  error: "text-red-600 bg-red-50 border-red-100",
  warning: "text-amber-600 bg-amber-50 border-amber-100",
  info: "text-blue-600 bg-blue-50 border-blue-100",
};

export default function ClientPreviewMatrix({ open, onClose, templateId, onRequestSave }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseHtml, setBaseHtml] = useState<string | null>(null);

  const [selected, setSelected] = useState<EmailClientId>("apple-mail");
  const [dark, setDark] = useState(false);
  const [imagesOff, setImagesOff] = useState(false);
  const [mobile, setMobile] = useState(false);

  // On open: persist first (so the preview matches what's on screen), then fetch
  // the send-accurate HTML the server would produce.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setBaseHtml(null);
      const saved = await onRequestSave();
      const id = saved?.id ?? templateId;
      if (!id) {
        if (!cancelled) {
          setError("Save the template first, then preview.");
          setLoading(false);
        }
        return;
      }
      try {
        const res = await fetch(`/api/email/block-templates/${id}/preview`, {
          headers: await authHeader(),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `Preview failed (${res.status})`);
        }
        const html = await res.text();
        if (!cancelled) setBaseHtml(html);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Preview failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-run each time the modal is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const findings = useMemo(() => (baseHtml ? lintEmailHtml(baseHtml) : []), [baseHtml]);
  const srcDoc = useMemo(
    () => (baseHtml ? transformForClient(baseHtml, selected, { dark, imagesOff }) : ""),
    [baseHtml, selected, dark, imagesOff],
  );

  if (!open) return null;

  const client = clientById(selected);
  const width = mobile ? 375 : client.width;
  const clientFindings = findingsForClient(findings, selected);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/60 backdrop-blur-sm">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4 px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <Monitor size={16} className="text-gray-400 shrink-0" />
          <span className="text-sm font-semibold text-gray-800">Preview across clients</span>
          <span className="hidden sm:inline text-[11px] text-gray-400 truncate">
            Approximated rendering — the checks on the right are the reliable signal.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Toggle active={dark} onClick={() => setDark((v) => !v)} icon={dark ? Moon : Sun} label={dark ? "Dark" : "Light"} />
          <Toggle active={imagesOff} onClick={() => setImagesOff((v) => !v)} icon={ImageOff} label="Images off" />
          <Toggle active={mobile} onClick={() => setMobile((v) => !v)} icon={Smartphone} label="Mobile" />
          <button
            onClick={onClose}
            className="ml-1 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Preview stage */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-100">
          {/* Client tabs */}
          <div className="flex-shrink-0 flex flex-wrap items-center gap-1.5 px-4 py-2 bg-white border-b border-gray-200">
            {EMAIL_CLIENTS.map((c) => {
              const issues = findingsForClient(findings, c.id).filter((f) => f.severity !== "info").length;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className={clsx(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition",
                    selected === c.id
                      ? "bg-gray-900 text-white border-gray-900"
                      : "text-gray-600 border-gray-200 hover:bg-gray-50",
                  )}
                >
                  {c.name}
                  {c.approximate && (
                    <span
                      className={clsx(
                        "text-[9px] uppercase tracking-wide",
                        selected === c.id ? "text-gray-300" : "text-gray-400",
                      )}
                      title="Approximation — Word engine can't be reproduced in a browser"
                    >
                      approx
                    </span>
                  )}
                  {issues > 0 && (
                    <span
                      className={clsx(
                        "inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold",
                        selected === c.id ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700",
                      )}
                    >
                      {issues}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Frame */}
          <div className="flex-1 overflow-auto p-6 flex justify-center">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 self-center">
                <Loader2 size={16} className="animate-spin" /> Rendering preview…
              </div>
            ) : error ? (
              <div className="self-center max-w-sm text-center">
                <AlertCircle size={22} className="mx-auto text-red-400 mb-2" />
                <p className="text-sm text-gray-600">{error}</p>
              </div>
            ) : (
              <div className="flex flex-col" style={{ width }}>
                <div className="flex items-center justify-between px-1 pb-1.5">
                  <span className="text-[11px] font-medium text-gray-500">{client.engine}</span>
                  <span className="text-[11px] text-gray-400">{width}px</span>
                </div>
                <div className="flex-1 rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden">
                  <iframe
                    title={`${client.name} preview`}
                    srcDoc={srcDoc}
                    sandbox=""
                    className="w-full h-full min-h-[60vh] bg-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Compatibility panel */}
        <aside className="w-80 flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Compatibility</h3>
              <span className="text-[11px] text-gray-400">{client.name}</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{client.blurb}</p>

            <div className="mt-4 space-y-2">
              {!baseHtml ? null : clientFindings.length === 0 ? (
                <div className="flex items-start gap-2 rounded-lg border border-green-100 bg-green-50 p-3">
                  <div className="text-green-600 mt-0.5">✓</div>
                  <p className="text-xs text-green-700">No known issues for {client.name}.</p>
                </div>
              ) : (
                clientFindings.map((f) => {
                  const Icon = SEV_ICON[f.severity];
                  return (
                    <div key={f.rule} className={clsx("rounded-lg border p-3", SEV_STYLE[f.severity])}>
                      <div className="flex items-start gap-2">
                        <Icon size={14} className="mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-snug">
                            {f.title}
                            {f.count && f.count > 1 ? <span className="font-normal"> ×{f.count}</span> : null}
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-gray-600">{f.detail}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {findings.length > 0 && (
              <p className="mt-4 text-[10px] leading-relaxed text-gray-400">
                Showing issues that affect {client.name}. Switch clients above to see the rest — the badge counts
                errors and warnings per client.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Info;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition",
        active ? "bg-gray-900 text-white border-gray-900" : "text-gray-600 border-gray-200 hover:bg-gray-50",
      )}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}
