"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Plus,
  Trash2,
  Save,
  X,
  Mail,
  MessageSquare,
  ChevronLeft,
  Copy,
  Eye,
  Pencil,
  Type,
  Image as ImageIcon,
  MousePointerClick,
  Minus,
  LayoutGrid,
  ShoppingBag,
  Share2,
  Sparkles,
  Captions,
  Rows3,
  PanelTop,
  PanelBottom,
  Tag,
  Code2,
  FileCode,
  MonitorSmartphone,
  SlidersHorizontal,
  Send,
  GraduationCap,
  Loader2,
} from "lucide-react";
import clsx from "clsx";

import type {
  EmailBlock,
  EmailTemplate,
  BlockType,
  TemplateType,
  TemplateSource,
  Brand,
  Channel,
  TemplatePurpose,
} from "./types";
import { createDefaultBlock, createSectionPreset, SECTION_PRESETS, TEMPLATE_PURPOSES, toPurposeArray } from "./types";
import type { SectionPreset } from "./types";
import { useTemplates } from "./useTemplates";
import { findBlock, updateBlockInTree, removeBlockFromTree, moveBlockAnywhere, addBlockToColumn, reorderBlocks, insertNewBlock } from "./blockTree";
import EmailCanvas, { NEW_BLOCK_MIME } from "./EmailCanvas";
import BlockEditor from "./BlockEditor";
import PromotionPickerModal from "./PromotionPickerModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import HtmlTemplateEditor from "./HtmlTemplateEditor";
import ClientPreviewMatrix from "./ClientPreviewMatrix";
import SendTestModal from "./SendTestModal";
import NewTemplateWizard, { type NewTemplateResult } from "./NewTemplateWizard";
import MergeFieldTextarea from "@/components/email/MergeFieldTextarea";

/* ─── Block Palette ─── */
const BLOCK_PALETTE: { type: BlockType; label: string; icon: typeof Type }[] = [
  { type: "header", label: "Header", icon: PanelTop },
  { type: "hero", label: "Hero Banner", icon: Sparkles },
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "caption", label: "Image + Caption", icon: Captions },
  { type: "button", label: "Button", icon: MousePointerClick },
  { type: "columns", label: "Columns", icon: LayoutGrid },
  { type: "product", label: "Product Card", icon: ShoppingBag },
  { type: "promotion", label: "Promotion", icon: Tag },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: Rows3 },
  { type: "social", label: "Social Links", icon: Share2 },
  { type: "footer", label: "Footer / Unsubscribe", icon: PanelBottom },
];

/* Mini glyph illustrating a section layout in the palette. */
function PresetGlyph({ preset }: { preset: SectionPreset }) {
  const cols =
    preset === "imageText" ? [{ w: 2, dark: true }, { w: 3, dark: false }]
    : preset === "textImage" ? [{ w: 3, dark: false }, { w: 2, dark: true }]
    : preset === "twoCol" ? [{ w: 1, dark: false }, { w: 1, dark: false }]
    : preset === "threeCol" ? [{ w: 1, dark: false }, { w: 1, dark: false }, { w: 1, dark: false }]
    : [{ w: 1, dark: true }];
  return (
    <span className="flex h-4 w-6 shrink-0 items-stretch gap-0.5 rounded-sm border border-gray-300 p-0.5">
      {cols.map((c, i) => (
        <span key={i} className={`rounded-[1px] ${c.dark ? "bg-indigo-400" : "bg-gray-300"}`} style={{ flex: `${c.w} 1 0%` }} />
      ))}
    </span>
  );
}

/* ─── SMS Editor ─── */
function SmsEditor({
  body,
  onChange,
}: {
  body: string;
  onChange: (v: string) => void;
}) {
  const charCount = body.length;
  const segments = Math.ceil(charCount / 160) || 1;

  return (
    <div className="max-w-lg mx-auto space-y-4 py-8">
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <MessageSquare size={16} className="text-violet-600" />
            SMS Message
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Keep it short and include opt-out language.
          </p>
        </div>
        <div className="p-5">
          <textarea
            value={body}
            onChange={(e) => onChange(e.target.value)}
            rows={6}
            placeholder="Hey [Name]! Your favorite products are waiting..."
            className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 resize-none"
          />
          <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
            <span>
              {charCount} characters / {segments} SMS segment{segments > 1 ? "s" : ""}
            </span>
            <span className={charCount > 160 ? "text-amber-600 font-medium" : ""}>
              {charCount > 160 ? `${segments} segments will be sent` : "Single segment"}
            </span>
          </div>
        </div>
        {/* Phone preview */}
        <div className="px-5 pb-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Preview</div>
          <div className="max-w-xs mx-auto">
            <div className="bg-gray-100 rounded-2xl p-4 relative">
              <div className="bg-green-500 text-white rounded-2xl rounded-bl-md px-4 py-2.5 text-sm max-w-[85%] ml-auto">
                {body || "Your message will appear here..."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Template Editor ─── */
export default function TemplateEditorPage() {
  const { templates, loading, save, remove, duplicate, refresh } = useTemplates();

  // List vs editor mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Editor state
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [templateType, setTemplateType] = useState<TemplateType>("email");
  const [brand, setBrand] = useState<Brand>("both");
  const [channel, setChannel] = useState<Channel>("both");
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [smsBody, setSmsBody] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [fromName, setFromName] = useState("");
  const [purpose, setPurpose] = useState<TemplatePurpose[]>([]);
  const [description, setDescription] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showSendTest, setShowSendTest] = useState(false);
  const [saving, setSaving] = useState(false);

  // Uploaded-HTML templates: `source` decides which editor the row uses, and
  // `rawHtml` holds the document. `htmlView` toggles code vs rendered preview.
  const [source, setSource] = useState<TemplateSource>("blocks");
  const [rawHtml, setRawHtml] = useState("");
  const [textBody, setTextBody] = useState("");
  const [htmlView, setHtmlView] = useState<"preview" | "code">("preview");

  // The creation wizard (brand → audience → purpose → title → description →
  // start method). Replaces the old inline "new / upload / plain-text" buttons.
  const [showWizard, setShowWizard] = useState(false);

  const selectedBlock = selectedBlockId ? findBlock(blocks, selectedBlockId) : undefined;

  // Promotion picker modal
  const [showPromoPicker, setShowPromoPicker] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);
  // When a template is used by automations, the first delete surfaces them here
  // so we can ask the user to confirm detaching before a forced delete.
  const [deleteUsedBy, setDeleteUsedBy] = useState<string[] | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function closeDelete() {
    setDeleteTarget(null);
    setDeleteUsedBy(null);
    setDeleteError(null);
    setDeleting(false);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    // Force only after the user has seen (and accepted) the in-use warning.
    const res = await remove(deleteTarget.id, deleteUsedBy !== null);
    setDeleting(false);
    if (res.ok) {
      closeDelete();
      return;
    }
    if (res.inUse) {
      setDeleteUsedBy(res.automations ?? []);
      return;
    }
    setDeleteError(res.error);
  }

  // Per-template send counts for the library table (sends made since tracking
  // shipped). Fetched once; keyed by template id.
  const [sendCounts, setSendCounts] = useState<Record<string, { sends: number; campaigns: number }>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch("/api/email/template-send-counts", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setSendCounts(json.counts ?? {});
      } catch {
        /* non-critical — the column just shows 0 */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* AI grades for the library. Fetched once (existing grades) and refreshed
     after a "Grade emails" run. Keyed by template id. */
  const [grades, setGrades] = useState<Record<string, TemplateGrade>>({});
  const [grading, setGrading] = useState(false);
  const [gradeMsg, setGradeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [gradeDetail, setGradeDetail] = useState<{ template: EmailTemplate; grade: TemplateGrade } | null>(null);

  /* ── AI fix queue — PAGE-level state, not modal state ──
     Fixes keep running when the grade modal closes, so the queue lives here:
     the library table can show a "fixing" chip, reopening the modal shows the
     true in-flight state, and a reopened modal can't accidentally start a
     second runner racing the first. One serial queue per template (a fix
     rewrites the template's content, so two on the same template would
     clobber each other); different templates may fix in parallel. */
  const [fixActive, setFixActive] = useState<Record<string, string>>({});   // template id → running issue key
  const [fixQueued, setFixQueued] = useState<Record<string, string[]>>({}); // template id → waiting issue keys
  const [fixErrors, setFixErrors] = useState<Record<string, string>>({});   // `${templateId}|${issueKey}` → error
  // Refs carry the queues for the async runners — state would go stale inside the loop.
  const fixQueuesRef = useRef<Map<string, Array<{ d: GradedDimension; iss: GradedIssue }>>>(new Map());
  const fixRunningRef = useRef<Set<string>>(new Set());

  const issueKeyOf = (d: GradedDimension, iss: GradedIssue) => `${d.key}:${iss.issue}`;

  function requestFix(template: EmailTemplate, d: GradedDimension, iss: GradedIssue) {
    const key = issueKeyOf(d, iss);
    const queue = fixQueuesRef.current.get(template.id) ?? [];
    if (queue.some((q) => issueKeyOf(q.d, q.iss) === key) || fixActive[template.id] === key) return;
    queue.push({ d, iss });
    fixQueuesRef.current.set(template.id, queue);
    setFixQueued((cur) => ({ ...cur, [template.id]: queue.map((q) => issueKeyOf(q.d, q.iss)) }));
    setFixErrors((cur) => ({ ...cur, [`${template.id}|${key}`]: "" }));
    if (!fixRunningRef.current.has(template.id)) void runFixQueue(template);
  }

  async function runFixQueue(template: EmailTemplate) {
    fixRunningRef.current.add(template.id);
    const queue = fixQueuesRef.current.get(template.id) ?? [];
    for (let task = queue.shift(); task; task = queue.shift()) {
      const key = issueKeyOf(task.d, task.iss);
      setFixQueued((cur) => ({ ...cur, [template.id]: queue.map((q) => issueKeyOf(q.d, q.iss)) }));
      setFixActive((cur) => ({ ...cur, [template.id]: key }));
      await applyOneFix(template, task.d, task.iss);
    }
    setFixActive((cur) => Object.fromEntries(Object.entries(cur).filter(([id]) => id !== template.id)));
    setFixQueued((cur) => Object.fromEntries(Object.entries(cur).filter(([id]) => id !== template.id)));
    fixRunningRef.current.delete(template.id);
    // One reload per drained queue: pulls the edited content into the library
    // (and surfaces the "stale grade" badge).
    refresh();
  }

  async function applyOneFix(template: EmailTemplate, dimension: GradedDimension, issue: GradedIssue) {
    const errKey = `${template.id}|${issueKeyOf(dimension, issue)}`;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/email/templates/grade/fix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          template_id: template.id,
          dimension_key: dimension.key,
          dimension_label: dimension.label,
          issue: issue.issue,
          fix: issue.fix,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFixErrors((cur) => ({ ...cur, [errKey]: json?.error ?? `Fix failed (${res.status})` }));
        return;
      }
      const fixes = (json.fixes as FixRecord[]) ?? [];
      // Keep the grades map current so the modal (open or reopened) shows the
      // fixed state immediately.
      setGrades((cur) =>
        cur[template.id] ? { ...cur, [template.id]: { ...cur[template.id], fixes } } : cur,
      );
    } catch (e) {
      setFixErrors((cur) => ({
        ...cur,
        [errKey]: e instanceof Error ? e.message : "Fix failed",
      }));
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch("/api/email/templates/grade", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setGrades(json.grades ?? {});
      } catch {
        /* non-critical — the column just shows "not graded" */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* Grade every template in one shot. Server caps + runs the AI per template,
     then upserts one current grade each. */
  async function gradeAll() {
    setGrading(true);
    setGradeMsg(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/email/templates/grade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const json = await res.json();
      if (!res.ok) {
        setGradeMsg({ ok: false, text: json?.error ?? `Grading failed (${res.status})` });
        return;
      }
      setGrades((prev) => ({ ...prev, ...(json.grades ?? {}) }));
      const failed = json.failed ?? 0;
      setGradeMsg({
        ok: failed === 0,
        text:
          `Graded ${json.graded} template${json.graded === 1 ? "" : "s"}` +
          (failed ? `, ${failed} failed` : "") +
          (json.capped ? " (capped at 60 — run again for the rest)" : "") +
          ".",
      });
    } catch (e) {
      setGradeMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setGrading(false);
    }
  }

  // Load template into editor. For a brand-new template, `blankSource` picks
  // which editor opens (blocks builder by default, or a plain-text body).
  function openEditor(template?: EmailTemplate, blankSource: TemplateSource = "blocks") {
    if (template) {
      setEditingId(template.id);
      setIsNew(false);
      setName(template.name);
      setSubject(template.subject ?? "");
      setTemplateType(template.type);
      setBrand(template.brand ?? "both");
      setChannel(template.channel ?? "both");
      setSource(template.source ?? "blocks");
      setBlocks(template.blocks ?? []);
      setRawHtml(template.raw_html ?? "");
      setTextBody(template.text_body ?? "");
      setSmsBody(template.sms_body ?? "");
      setPreviewText(template.preview_text ?? "");
      setFromName(template.from_name ?? "");
      setPurpose(toPurposeArray(template.purpose));
      setDescription(template.description ?? "");
    } else {
      setEditingId(null);
      setIsNew(true);
      setName("");
      setSubject("");
      setTemplateType("email");
      setBrand("both");
      setChannel("both");
      setSource(blankSource);
      setBlocks([]);
      setRawHtml("");
      setTextBody("");
      setSmsBody("");
      setPreviewText("");
      setFromName("");
      setPurpose([]);
      setDescription("");
    }
    setSelectedBlockId(null);
    setShowPreview(false);
    setHtmlView("preview");
  }

  /**
   * The creation wizard collected brand / audience / purpose / title /
   * description and a starting point — a seeded text block, an empty builder, or
   * blocks imported from an uploaded HTML file. Everything is source='blocks'
   * now. Open it as an unsaved draft; the user saves when ready.
   */
  function startFromWizard(r: NewTemplateResult) {
    setShowWizard(false);
    setEditingId(null);
    setIsNew(true);
    setName(r.name);
    setSubject(r.subject);
    setTemplateType("email");
    setBrand(r.brand);
    setChannel(r.channel);
    setPurpose(r.purpose);
    setDescription(r.description);
    setSource("blocks");
    setBlocks(r.blocks);
    setRawHtml("");
    setTextBody("");
    setSmsBody("");
    setPreviewText(r.previewText);
    setFromName("");
    setSelectedBlockId(null);
    setShowPreview(false);
    setHtmlView("preview");
  }

  function closeEditor() {
    setEditingId(null);
    setIsNew(false);
  }

  // Block operations
  function addBlock(type: BlockType) {
    if (type === "promotion") {
      // Must pick a real promotion first
      setShowPromoPicker(true);
      return;
    }
    const b = createDefaultBlock(type);
    setBlocks((prev) => [...prev, b]);
    setSelectedBlockId(b.id);
  }

  function addPromotionBlock(promoBlock: EmailBlock) {
    setBlocks((prev) => [...prev, promoBlock]);
    setSelectedBlockId(promoBlock.id);
    setShowPromoPicker(false);
  }

  function updateBlock(updated: EmailBlock) {
    setBlocks((prev) => updateBlockInTree(prev, updated));
  }

  function removeBlock(id: string) {
    setBlocks((prev) => removeBlockFromTree(prev, id));
    if (selectedBlockId === id) setSelectedBlockId(null);
  }

  // Add a preset section (pre-populated with placeholder content blocks).
  function addSection(preset: SectionPreset) {
    const s = createSectionPreset(preset);
    setBlocks((prev) => [...prev, s]);
    setSelectedBlockId(s.id);
  }

  // Add a content block into a specific section column (from the section panel).
  function addToColumn(sectionId: string, colIndex: number, type: BlockType) {
    const nb = blockFromDragSpec(type);
    if (nb.type === "section") return; // a section layout can't nest inside a column
    setBlocks((prev) => addBlockToColumn(prev, sectionId, colIndex, nb));
    setSelectedBlockId(nb.id);
  }

  // A palette drag carries either a block type, or "section:<preset>" for a
  // whole section layout. Build the right block from that spec.
  function blockFromDragSpec(spec: string): EmailBlock {
    if (spec.startsWith("section:")) {
      return createSectionPreset(spec.slice("section:".length) as SectionPreset);
    }
    return createDefaultBlock(spec as BlockType);
  }

  // Drag from the palette → drop a new block (or section layout) at a precise
  // spot in the canvas. insertNewBlock rejects a section dropped into a column,
  // so a layout only lands at the top level (above/below existing sections).
  function insertNewAt(type: BlockType, targetId: string, pos: "before" | "after") {
    const nb = blockFromDragSpec(type);
    setBlocks((prev) => insertNewBlock(prev, nb, targetId, pos));
    setSelectedBlockId(nb.id);
  }

  // Drop a palette item on empty canvas → append at the end.
  function appendNew(type: BlockType) {
    const nb = blockFromDragSpec(type);
    setBlocks((prev) => [...prev, nb]);
    setSelectedBlockId(nb.id);
  }

  // Save
  async function handleSave(): Promise<EmailTemplate | null> {
    setSaving(true);
    const payload: Partial<EmailTemplate> = {
      name: name || "Untitled Template",
      subject,
      type: templateType,
      brand,
      channel,
      source,
      blocks,
      raw_html: source === "html" ? rawHtml : null,
      text_body: source === "text" ? textBody : null,
      sms_body: smsBody,
      preview_text: previewText,
      from_name: fromName,
      purpose,
      description,
      status: "draft",
    };
    if (editingId) payload.id = editingId;

    const result = await save(payload);
    if (result && isNew) {
      setEditingId(result.id);
      setIsNew(false);
    }
    setSaving(false);
    return result ?? null;
  }

  /* ─── LIST VIEW ─── */
  if (!editingId && !isNew) {
    return (
      <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Create and manage email templates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={gradeAll}
              disabled={grading || templates.length === 0}
              title="Have AI score every template for content, design, subject line, deliverability, accessibility, and brand"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {grading ? <Loader2 size={16} className="animate-spin" /> : <GraduationCap size={16} />}
              {grading ? "Grading…" : "Grade emails"}
            </button>
            <button
              onClick={() => setShowWizard(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition shadow-sm"
            >
              <Plus size={16} />
              New template
            </button>
          </div>
        </div>

        {/* Count + grade run result */}
        <div className="flex items-center gap-4 text-xs">
          <span className="text-gray-500">{templates.length} templates</span>
          {gradeMsg && (
            <span className={clsx("font-medium", gradeMsg.ok ? "text-emerald-600" : "text-rose-600")}>
              {gradeMsg.text}
            </span>
          )}
          {grading && (
            <span className="text-gray-400">Scoring each template with AI — this can take a minute.</span>
          )}
        </div>

        {/* Template cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Mail size={48} className="text-gray-200 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">No templates yet</h3>
            <p className="text-sm text-gray-500 mt-1">Start a plain-text email, a blank builder, or import an HTML file — the wizard walks you through it.</p>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => setShowWizard(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition"
              >
                <Plus size={16} />
                New template
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-2.5 font-semibold">Template</th>
                    <th className="px-3 py-2.5 font-semibold">Type</th>
                    <th className="px-3 py-2.5 font-semibold hidden md:table-cell">Audience</th>
                    <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Grade</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Sends</th>
                    <th className="px-3 py-2.5 font-semibold hidden lg:table-cell">Updated</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {templates.map((t) => {
                    const count = sendCounts[t.id];
                    return (
                      <tr
                        key={t.id}
                        onClick={() => openEditor(t)}
                        className="group cursor-pointer transition hover:bg-gray-50"
                      >
                        {/* Template — icon + name + subject */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                              {t.source === "html" ? <FileCode size={16} /> : t.source === "text" ? <Type size={16} /> : <Mail size={16} />}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-gray-800 max-w-[240px]">{t.name || "Untitled"}</div>
                              <div className="truncate text-[11px] text-gray-500 max-w-[240px]">{t.subject || "(no subject)"}</div>
                            </div>
                          </div>
                        </td>

                        {/* Type */}
                        <td className="px-3 py-3">
                          <span className={clsx(
                            "inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                            t.source === "html" && "bg-gray-800 text-white",
                            t.source === "text" && "bg-gray-200 text-gray-600",
                            t.source === "blocks" && "bg-indigo-100 text-indigo-700",
                          )}>
                            {t.source === "html" ? "HTML" : t.source === "text" ? "Text" : "Designed"}
                          </span>
                        </td>

                        {/* Audience — brand + channel */}
                        <td className="px-3 py-3 hidden md:table-cell">
                          <div className="flex items-center gap-1.5">
                            {t.brand && t.brand !== "both" && (
                              <span className={clsx("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase", t.brand === "ni" ? "bg-emerald-100 text-emerald-700" : "bg-pink-100 text-pink-700")}>
                                {t.brand === "ni" ? "NI" : "Sassy"}
                              </span>
                            )}
                            {t.channel && t.channel !== "both" && (
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-600">
                                {t.channel === "wholesale" ? "Wholesale" : "D2C"}
                              </span>
                            )}
                            {(!t.brand || t.brand === "both") && (!t.channel || t.channel === "both") && (
                              <span className="text-[11px] text-gray-300">—</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3 hidden sm:table-cell">
                          <span className={clsx(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            t.status === "draft" && "bg-gray-100 text-gray-500",
                            t.status === "active" && "bg-emerald-100 text-emerald-700",
                            t.status === "archived" && "bg-red-100 text-red-600",
                          )}>
                            {t.status}
                          </span>
                        </td>

                        {/* Grade */}
                        <td className="px-3 py-3">
                          {(() => {
                            const g = grades[t.id];
                            if (!g) return <span className="text-[11px] text-gray-300">—</span>;
                            const fixingCount =
                              (fixActive[t.id] ? 1 : 0) + (fixQueued[t.id]?.length ?? 0);
                            const stale =
                              !!g.template_updated_at &&
                              new Date(t.updated_at).getTime() >
                                new Date(g.template_updated_at).getTime();
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGradeDetail({ template: t, grade: g });
                                }}
                                className="inline-flex items-center gap-1.5"
                                title="View grade breakdown"
                              >
                                <GradeBadge letter={g.letter} score={g.overall_score} />
                                {fixingCount > 0 ? (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-600"
                                    title={`The AI is applying ${fixingCount} fix${fixingCount === 1 ? "" : "es"} to this template`}
                                  >
                                    <Loader2 size={9} className="animate-spin" />
                                    AI fixing{fixingCount > 1 ? ` (${fixingCount})` : ""}
                                  </span>
                                ) : (
                                  stale && (
                                    <span
                                      className="text-[9px] font-semibold uppercase tracking-wide text-amber-500"
                                      title="Template edited since it was graded — re-grade to refresh"
                                    >
                                      stale
                                    </span>
                                  )
                                )}
                              </button>
                            );
                          })()}
                        </td>

                        {/* Sends */}
                        <td className="px-3 py-3 text-right">
                          {count && count.sends > 0 ? (
                            <span className="tabular-nums font-medium text-gray-700" title={`${count.campaigns} send${count.campaigns === 1 ? "" : "s"} · ${count.sends} recipients`}>
                              {count.sends.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-300">0</span>
                          )}
                        </td>

                        {/* Updated */}
                        <td className="px-3 py-3 hidden lg:table-cell text-[11px] text-gray-400 whitespace-nowrap">
                          {new Date(t.updated_at).toLocaleDateString()}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={(e) => { e.stopPropagation(); duplicate(t); }}
                              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600"
                              title="Duplicate"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(t); }}
                              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Promotion Picker Modal */}
        <PromotionPickerModal
          open={showPromoPicker}
          onClose={() => setShowPromoPicker(false)}
          onSelect={addPromotionBlock}
        />

        {/* Delete Confirmation Modal */}
        <ConfirmDeleteModal
          open={!!deleteTarget}
          title={`Delete "${deleteTarget?.name || "Untitled"}"?`}
          description={
            deleteError
              ? deleteError
              : deleteUsedBy !== null
                ? `Used by automation${deleteUsedBy.length === 1 ? "" : "s"}: ${
                    deleteUsedBy.length ? deleteUsedBy.join(", ") : "an active sequence"
                  }. Deleting removes this email from those steps — they'll need a new email before running.`
                : "This will permanently delete this template."
          }
          confirmLabel={deleting ? "Deleting…" : deleteUsedBy !== null ? "Delete anyway" : "Delete"}
          onCancel={closeDelete}
          onConfirm={confirmDelete}
        />

        {/* New-template creation wizard */}
        <NewTemplateWizard
          open={showWizard}
          onClose={() => setShowWizard(false)}
          onComplete={startFromWizard}
        />

        {/* Grade breakdown */}
        {gradeDetail && (
          <GradeDetailModal
            template={gradeDetail.template}
            grade={grades[gradeDetail.template.id] ?? gradeDetail.grade}
            activeKey={fixActive[gradeDetail.template.id] ?? null}
            queuedKeys={fixQueued[gradeDetail.template.id] ?? []}
            errors={Object.fromEntries(
              Object.entries(fixErrors)
                .filter(([k]) => k.startsWith(`${gradeDetail.template.id}|`))
                .map(([k, v]) => [k.slice(gradeDetail.template.id.length + 1), v]),
            )}
            onRequestFix={(d, iss) => requestFix(gradeDetail.template, d, iss)}
            onClose={() => setGradeDetail(null)}
            onOpenEditor={() => {
              const t = gradeDetail.template;
              setGradeDetail(null);
              openEditor(t);
            }}
          />
        )}
      </div>
    );
  }

  /* ─── EDITOR VIEW ─── */
  const isEmailType = templateType === "email" || templateType === "newsletter";

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={closeEditor}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name..."
            className="text-sm font-semibold text-gray-800 bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none px-1 py-0.5 w-56"
          />
          <span
            className={clsx(
              "ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium",
              source === "html" ? "bg-gray-900 text-white" : "bg-blue-100 text-blue-700"
            )}
          >
            {source === "html" ? <FileCode size={12} /> : <Mail size={12} />}
            {source === "html" ? "Custom HTML" : "Email"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {source === "html" && (
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5">
              {(["preview", "code"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setHtmlView(v)}
                  className={clsx(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition",
                    htmlView === v ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                  )}
                >
                  {v === "preview" ? <Eye size={12} /> : <Code2 size={12} />}
                  {v === "preview" ? "Preview" : "Code"}
                </button>
              ))}
            </div>
          )}
          {source === "blocks" && isEmailType && (
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={clsx(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border",
                showPreview ? "bg-blue-50 text-blue-700 border-blue-200" : "text-gray-500 border-gray-200 hover:bg-gray-50"
              )}
            >
              {showPreview ? <Pencil size={12} /> : <Eye size={12} />}
              {showPreview ? "Edit" : "Preview"}
            </button>
          )}
          {source === "blocks" && isEmailType && (
            <button
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition"
            >
              <SlidersHorizontal size={13} />
              Settings
            </button>
          )}
          {isEmailType && (
            <button
              onClick={() => setShowMatrix(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition"
            >
              <MonitorSmartphone size={13} />
              Test across clients
            </button>
          )}
          {isEmailType && (
            <button
              onClick={() => setShowSendTest(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition"
            >
              <Send size={13} />
              Send test
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-800 transition shadow-sm disabled:opacity-50"
          >
            <Save size={12} />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* SMS Editor */}
      {source === "blocks" && templateType === "sms" && (
        <div className="flex-1 overflow-auto bg-gray-50">
          <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
            {/* Meta fields */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Brand</span>
                  <select value={brand} onChange={(e) => setBrand(e.target.value as Brand)} className="mt-1 w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
                    <option value="both">Both Brands</option>
                    <option value="ni">Natural Inspirations</option>
                    <option value="sassy">Sassy</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Channel</span>
                  <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="mt-1 w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
                    <option value="both">Both Channels</option>
                    <option value="wholesale">Wholesale</option>
                    <option value="d2c">D2C</option>
                  </select>
                </label>
              </div>
            </div>
            <SmsEditor body={smsBody} onChange={setSmsBody} />
          </div>
        </div>
      )}

      {/* Email / Newsletter Editor */}
      {source === "blocks" && isEmailType && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Block Palette */}
          {!showPreview && (
            <div className="w-56 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
              <div className="p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Add Block</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {BLOCK_PALETTE.map((b) => {
                    // Promotion needs the picker, so it stays click-only. The rest
                    // can be dragged onto any spot in the canvas.
                    const draggable = b.type !== "promotion";
                    return (
                      <button
                        key={b.type}
                        draggable={draggable}
                        onDragStart={(e) => {
                          if (!draggable) return;
                          e.dataTransfer.setData(NEW_BLOCK_MIME, b.type);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => addBlock(b.type)}
                        title={draggable ? "Click to add, or drag onto the canvas" : undefined}
                        className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition text-[10px] font-medium cursor-grab active:cursor-grabbing"
                      >
                        <b.icon size={16} />
                        {b.label}
                      </button>
                    );
                  })}
                </div>

                {/* Section layouts — multi-column containers with backgrounds */}
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-4 mb-2">Section Layouts</div>
                <div className="space-y-1.5">
                  {SECTION_PRESETS.map((p) => (
                    <button
                      key={p.preset}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(NEW_BLOCK_MIME, `section:${p.preset}`);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => addSection(p.preset)}
                      title="Click to add, or drag above/below a section"
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition text-[11px] font-medium cursor-grab active:cursor-grabbing"
                    >
                      <PresetGlyph preset={p.preset} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* Center: Canvas */}
          <div
            className="flex-1 overflow-y-auto bg-gray-100"
            onClick={() => setSelectedBlockId(null)}
          >
            {blocks.length === 0 ? (
              <div className="max-w-[620px] mx-auto my-6 bg-white shadow-lg rounded-lg min-h-[400px] flex flex-col items-center justify-center py-20 text-center px-8">
                <Mail size={40} className="text-gray-200 mb-3" />
                <h3 className="text-sm font-semibold text-gray-600">Start building your email</h3>
                <p className="text-xs text-gray-400 mt-1 max-w-xs">
                  Click blocks from the left panel to add them and build your email.
                </p>
              </div>
            ) : (
              /* True WYSIWYG: the canvas is the exact email HTML the send produces. */
              <div className="my-6" onClick={(e) => e.stopPropagation()}>
                <EmailCanvas
                  blocks={blocks}
                  selectedId={selectedBlockId}
                  onSelect={setSelectedBlockId}
                  onMove={(id, dir) => setBlocks((prev) => moveBlockAnywhere(prev, id, dir))}
                  onDelete={removeBlock}
                  onReorder={(draggedId, targetId, pos) =>
                    setBlocks((prev) => reorderBlocks(prev, draggedId, targetId, pos))
                  }
                  onAddToColumn={(sectionId, colIndex, type) => addToColumn(sectionId, colIndex, type)}
                  onInsertNew={insertNewAt}
                  onAppendNew={appendNew}
                />
              </div>
            )}
          </div>

          {/* Right: Block Properties */}
          {!showPreview && selectedBlock && (
            <div className="w-96 flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Properties</span>
                <button
                  onClick={() => setSelectedBlockId(null)}
                  className="p-1 rounded text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              </div>
              <BlockEditor block={selectedBlock} onUpdate={updateBlock} brand={brand} channel={channel} onAddToColumn={addToColumn} />
            </div>
          )}

          {/* Preview mode */}
          {showPreview && (
            <div className="w-80 flex-shrink-0 bg-gray-50 border-l border-gray-200 overflow-y-auto p-4">
              <div className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">Inbox Preview</div>
              <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100">
                  <div className="text-xs font-semibold text-gray-800">{fromName || "Sender Name"}</div>
                  <div className="text-xs text-gray-700 font-medium mt-0.5">{subject || "Subject line"}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{previewText || "Preview text..."}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Uploaded-HTML Editor */}
      {source === "html" && (
        <HtmlTemplateEditor
          templateId={editingId}
          htmlView={htmlView}
          rawHtml={rawHtml}
          setRawHtml={setRawHtml}
          subject={subject}
          setSubject={setSubject}
          previewText={previewText}
          setPreviewText={setPreviewText}
          fromName={fromName}
          setFromName={setFromName}
          brand={brand}
          setBrand={setBrand}
          channel={channel}
          setChannel={setChannel}
          onRequestSave={handleSave}
        />
      )}

      {/* Plain-text Editor */}
      {source === "text" && (
        <div className="flex-1 overflow-auto bg-gray-50">
          <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
            {/* Subject + audience */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="A quick note, {{firstName}}"
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Audience</span>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as Channel)}
                  className="mt-1 w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
                >
                  <option value="both">Both audiences</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="d2c">D2C</option>
                </select>
              </label>
            </div>

            {/* Body */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Message</span>
                <span className="text-[10px] text-gray-400">Type “/” to insert a merge field</span>
              </div>
              <MergeFieldTextarea
                value={textBody}
                onValueChange={setTextBody}
                channel={channel}
                rows={14}
                placeholder={"Hi {{firstName}},\n\n…\n\nBest,\n{{senderName}}"}
                className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>

            {/* Preview text */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Preview text <span className="font-normal text-gray-400">(inbox preview line, optional)</span>
                </span>
                <input
                  type="text"
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  placeholder="The short line inboxes show after the subject"
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Promotion Picker Modal (available in editor view) */}
      <PromotionPickerModal
        open={showPromoPicker}
        onClose={() => setShowPromoPicker(false)}
        onSelect={addPromotionBlock}
      />

      {/* Cross-client preview matrix */}
      <ClientPreviewMatrix
        open={showMatrix}
        onClose={() => setShowMatrix(false)}
        templateId={editingId}
        onRequestSave={handleSave}
      />

      {/* Send a real test email */}
      <SendTestModal
        open={showSendTest}
        onClose={() => setShowSendTest(false)}
        templateId={editingId}
        onRequestSave={handleSave}
      />

      {/* Settings modal — subject, preview, sender, targeting, purpose, notes */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-800">Template settings</h2>
              <button onClick={() => setShowSettings(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Subject line</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Your subject…"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Preview text</span>
                <input
                  type="text"
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  placeholder="Shown in the inbox after the subject…"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">From name</span>
                <input
                  type="text"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Natural Inspirations"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Brand</span>
                  <select value={brand} onChange={(e) => setBrand(e.target.value as Brand)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm">
                    <option value="both">Both</option>
                    <option value="ni">NI</option>
                    <option value="sassy">Sassy</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Audience</span>
                  <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm">
                    <option value="both">Both</option>
                    <option value="wholesale">Wholesale</option>
                    <option value="d2c">D2C</option>
                  </select>
                </label>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Purpose</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {TEMPLATE_PURPOSES.map((p) => {
                    const on = purpose.includes(p.value);
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPurpose((cur) => (cur.includes(p.value) ? cur.filter((x) => x !== p.value) : [...cur, p.value]))}
                        className={clsx(
                          "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                          on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50",
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="A note for the team, shown in the library."
                  className="mt-1 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </label>
            </div>

            <div className="flex flex-shrink-0 justify-end border-t border-gray-100 px-5 py-2.5">
              <button
                onClick={() => setShowSettings(false)}
                className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── AI grading ─── */

/** New grades store issue objects; grades saved before "Fix this" shipped
    store plain strings. The UI renders both. */
type GradedIssue = {
  issue: string;
  fix: string;
  auto_fixable: boolean;
};

type GradedDimension = {
  key: string;
  label: string;
  score: number;
  summary: string;
  issues: Array<string | GradedIssue>;
  strengths: string[];
};

/** A fix that was applied via the "Fix this" button. */
type FixRecord = {
  dimension: string;
  issue: string;
  note: string;
  fixed_at: string;
};

type TemplateGrade = {
  template_id: string;
  overall_score: number;
  letter: string;
  summary: string | null;
  dimensions: GradedDimension[];
  fixes?: FixRecord[];
  template_updated_at: string | null;
  graded_at: string;
};

/** Tailwind classes for a score, red→green. Shared by the badge and bars. */
function scoreTone(score: number): { text: string; bg: string; bar: string } {
  if (score >= 90) return { text: "text-emerald-700", bg: "bg-emerald-100", bar: "bg-emerald-500" };
  if (score >= 80) return { text: "text-green-700", bg: "bg-green-100", bar: "bg-green-500" };
  if (score >= 70) return { text: "text-amber-700", bg: "bg-amber-100", bar: "bg-amber-500" };
  if (score >= 60) return { text: "text-orange-700", bg: "bg-orange-100", bar: "bg-orange-500" };
  return { text: "text-rose-700", bg: "bg-rose-100", bar: "bg-rose-500" };
}

function GradeBadge({ letter, score }: { letter: string; score: number }) {
  const tone = scoreTone(score);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
        tone.bg,
        tone.text,
      )}
    >
      {letter}
      <span className="font-semibold opacity-70">{score}</span>
    </span>
  );
}

function GradeDetailModal({
  template,
  grade,
  activeKey,
  queuedKeys,
  errors,
  onRequestFix,
  onClose,
  onOpenEditor,
}: {
  template: EmailTemplate;
  /** The LIVE grade from the page's grades map — updates as fixes land. */
  grade: TemplateGrade;
  /** Issue key currently being fixed for this template (page-level queue). */
  activeKey: string | null;
  /** Issue keys waiting in this template's fix queue. */
  queuedKeys: string[];
  /** Fix errors for this template, keyed by issue key. */
  errors: Record<string, string>;
  onRequestFix: (dimension: GradedDimension, issue: GradedIssue) => void;
  onClose: () => void;
  onOpenEditor: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fixes = grade.fixes ?? [];
  const fixedKeys = new Set(fixes.map((f) => `${f.dimension}:${f.issue}`));
  const noteFor = (key: string) =>
    fixes.find((f) => `${f.dimension}:${f.issue}` === key)?.note ?? null;

  const tone = scoreTone(grade.overall_score);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={clsx(
                "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl font-bold leading-none",
                tone.bg,
                tone.text,
              )}
            >
              <span className="text-lg">{grade.letter}</span>
              <span className="text-[10px] font-semibold opacity-70 tabular-nums">
                {grade.overall_score}
              </span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gray-900">
                {template.name || "Untitled"}
              </div>
              {grade.summary && (
                <div className="mt-0.5 text-xs text-gray-500">{grade.summary}</div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Dimensions */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {grade.dimensions.map((d) => {
            const t = scoreTone(d.score);
            return (
              <div key={d.key} className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-800">{d.label}</span>
                  <span className={clsx("text-xs font-bold tabular-nums", t.text)}>{d.score}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className={clsx("h-full rounded-full", t.bar)} style={{ width: `${d.score}%` }} />
                </div>
                {d.summary && <p className="mt-2 text-[11px] text-gray-600">{d.summary}</p>}
                {d.issues.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {d.issues.map((raw, i) => {
                      // Legacy grades stored plain strings — render, no button.
                      const iss: GradedIssue =
                        typeof raw === "string"
                          ? { issue: raw, fix: "", auto_fixable: false }
                          : raw;
                      const key = `${d.key}:${iss.issue}`;
                      const isFixed = fixedKeys.has(key);
                      const isFixing = activeKey === key;
                      const isQueued = queuedKeys.includes(key);
                      const err = errors[key];
                      return (
                        <li key={i} className="flex gap-1.5 text-[11px]">
                          <span
                            className={clsx(
                              "mt-[3px] h-1 w-1 shrink-0 rounded-full",
                              isFixed ? "bg-emerald-400" : "bg-rose-400",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={clsx(
                                  "text-gray-600",
                                  isFixed && "text-gray-400 line-through decoration-gray-300",
                                )}
                              >
                                {iss.issue}
                              </span>
                              {iss.auto_fixable && !isFixed && (
                                <button
                                  onClick={() => onRequestFix(d, iss)}
                                  disabled={isFixing || isQueued}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-40"
                                  title={
                                    isQueued
                                      ? "Waiting — fixes apply one at a time"
                                      : "Have the AI apply this change to the template"
                                  }
                                >
                                  {isFixing ? (
                                    <Loader2 size={10} className="animate-spin" />
                                  ) : (
                                    <Sparkles size={10} />
                                  )}
                                  {isFixing ? "Fixing…" : isQueued ? "Queued" : "Fix this"}
                                </button>
                              )}
                            </div>
                            {iss.fix && !isFixed && (
                              <p className="mt-0.5 text-[10px] leading-relaxed text-gray-400">
                                <span className="font-medium text-gray-500">Suggested:</span>{" "}
                                {iss.fix}
                              </p>
                            )}
                            {isFixed && (
                              <p className="mt-0.5 text-[10px] leading-relaxed text-emerald-600">
                                ✓ Fixed — {noteFor(key)}
                              </p>
                            )}
                            {err && (
                              <p className="mt-0.5 text-[10px] leading-relaxed text-rose-600">{err}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {d.strengths.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {d.strengths.map((s, i) => (
                      <li key={i} className="flex gap-1.5 text-[11px] text-gray-500">
                        <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
          <span className="text-[10px] text-gray-400">
            Graded {new Date(grade.graded_at).toLocaleString()}
          </span>
          <button
            onClick={onOpenEditor}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800"
          >
            <Pencil size={13} />
            Open template
          </button>
        </div>
      </div>
    </div>
  );
}
