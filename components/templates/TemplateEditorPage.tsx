"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  X,
  Mail,
  MessageSquare,
  Newspaper,
  ChevronLeft,
  Copy,
  Eye,
  Pencil,
  GripVertical,
  Type,
  Image as ImageIcon,
  MousePointerClick,
  Minus,
  LayoutGrid,
  ShoppingBag,
  Share2,
  Sparkles,
  Rows3,
  PanelTop,
  Tag,
} from "lucide-react";
import clsx from "clsx";

import type {
  EmailBlock,
  EmailTemplate,
  BlockType,
  TemplateType,
  Brand,
  Channel,
  PromotionBlock,
} from "./types";
import { createDefaultBlock, BRAND_PRESETS } from "./types";
import { useTemplates } from "./useTemplates";
import BlockRenderer from "./BlockRenderer";
import BlockEditor from "./BlockEditor";
import GenerateTemplateModal from "./GenerateTemplateModal";
import PromotionPickerModal from "./PromotionPickerModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

/* ─── Block Palette ─── */
const BLOCK_PALETTE: { type: BlockType; label: string; icon: typeof Type }[] = [
  { type: "header", label: "Header", icon: PanelTop },
  { type: "hero", label: "Hero Banner", icon: Sparkles },
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "button", label: "Button", icon: MousePointerClick },
  { type: "columns", label: "Columns", icon: LayoutGrid },
  { type: "product", label: "Product Card", icon: ShoppingBag },
  { type: "promotion", label: "Promotion", icon: Tag },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: Rows3 },
  { type: "social", label: "Social Links", icon: Share2 },
];

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

  // AI generation modal
  const [showAiModal, setShowAiModal] = useState(false);

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
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  // Promotion picker modal
  const [showPromoPicker, setShowPromoPicker] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);

  // Load template into editor
  function openEditor(template?: EmailTemplate) {
    if (template) {
      setEditingId(template.id);
      setIsNew(false);
      setName(template.name);
      setSubject(template.subject ?? "");
      setTemplateType(template.type);
      setBrand(template.brand ?? "both");
      setChannel(template.channel ?? "both");
      setBlocks(template.blocks ?? []);
      setSmsBody(template.sms_body ?? "");
      setPreviewText(template.preview_text ?? "");
      setFromName(template.from_name ?? "");
    } else {
      setEditingId(null);
      setIsNew(true);
      setName("");
      setSubject("");
      setTemplateType("email");
      setBrand("both");
      setChannel("both");
      setBlocks([]);
      setSmsBody("");
      setPreviewText("");
      setFromName("");
    }
    setSelectedBlockId(null);
    setShowPreview(false);
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

  function addPromotionBlock(promoBlock: PromotionBlock) {
    setBlocks((prev) => [...prev, promoBlock]);
    setSelectedBlockId(promoBlock.id);
    setShowPromoPicker(false);
  }

  function updateBlock(updated: EmailBlock) {
    setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
  }

  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }

  // Save
  async function handleSave() {
    setSaving(true);
    const payload: Partial<EmailTemplate> = {
      name: name || "Untitled Template",
      subject,
      type: templateType,
      brand,
      channel,
      blocks,
      sms_body: smsBody,
      preview_text: previewText,
      from_name: fromName,
      status: "draft",
    };
    if (editingId) payload.id = editingId;

    const result = await save(payload);
    if (result && isNew) {
      setEditingId(result.id);
      setIsNew(false);
    }
    setSaving(false);
  }

  // Apply brand preset
  function applyBrandPreset(preset: "ni" | "sassy") {
    const p = BRAND_PRESETS[preset];
    // Update all blocks' colors to match brand
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.type === "header") return { ...b, bgColor: p.primaryColor, textColor: "#ffffff", companyName: p.name };
        if (b.type === "button") return { ...b, bgColor: p.primaryColor, textColor: "#ffffff" };
        if (b.type === "text") return { ...b, fontFamily: p.fontFamily, textColor: p.textColor };
        return b;
      })
    );
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
              Create and manage email, SMS, and newsletter templates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAiModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition shadow-sm"
            >
              <Sparkles size={16} />
              Create with AI
            </button>
            <button
              onClick={() => openEditor()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition shadow-sm"
            >
              <Plus size={16} />
              Blank Template
            </button>
          </div>
        </div>

        {/* Type quick filters */}
        <div className="flex items-center gap-4 text-xs">
          <span className="text-gray-500">{templates.length} templates</span>
          <div className="flex items-center gap-2">
            {[
              { count: templates.filter((t) => t.type === "email").length, label: "Email", icon: Mail, color: "text-blue-600 bg-blue-50" },
              { count: templates.filter((t) => t.type === "sms").length, label: "SMS", icon: MessageSquare, color: "text-violet-600 bg-violet-50" },
              { count: templates.filter((t) => t.type === "newsletter").length, label: "Newsletter", icon: Newspaper, color: "text-amber-600 bg-amber-50" },
            ].map((f) => (
              <span key={f.label} className={clsx("inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium", f.color)}>
                <f.icon size={12} />
                {f.count} {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* Template cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Mail size={48} className="text-gray-200 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">No templates yet</h3>
            <p className="text-sm text-gray-500 mt-1">Create your first email, SMS, or newsletter template.</p>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => setShowAiModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition"
              >
                <Sparkles size={16} />
                Create with AI
              </button>
              <button
                onClick={() => openEditor()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition"
              >
                <Plus size={16} />
                Blank Template
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => openEditor(t)}
              >
                {/* Preview strip */}
                <div className="h-32 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden relative">
                  {t.type === "sms" ? (
                    <MessageSquare size={32} className="text-violet-200" />
                  ) : t.blocks.length > 0 ? (
                    <div className="w-full scale-[0.4] origin-top pointer-events-none px-4">
                      {t.blocks.slice(0, 3).map((b) => (
                        <BlockRenderer key={b.id} block={b} selected={false} onSelect={() => {}} />
                      ))}
                    </div>
                  ) : (
                    <Mail size={32} className="text-gray-200" />
                  )}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                        t.type === "email" && "bg-blue-100 text-blue-700",
                        t.type === "sms" && "bg-violet-100 text-violet-700",
                        t.type === "newsletter" && "bg-amber-100 text-amber-700"
                      )}
                    >
                      {t.type.toUpperCase()}
                    </span>
                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                        t.status === "draft" && "bg-gray-100 text-gray-500",
                        t.status === "active" && "bg-emerald-100 text-emerald-700",
                        t.status === "archived" && "bg-red-100 text-red-600"
                      )}
                    >
                      {t.status}
                    </span>
                  </div>
                </div>

                <div className="px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-800 truncate">{t.name || "Untitled"}</h3>
                  {t.subject && <p className="text-xs text-gray-500 truncate mt-0.5">{t.subject}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1.5">
                      {t.brand && t.brand !== "both" && (
                        <span className={clsx("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", t.brand === "ni" ? "bg-emerald-100 text-emerald-700" : "bg-pink-100 text-pink-700")}>
                          {t.brand === "ni" ? "NI" : "Sassy"}
                        </span>
                      )}
                      {t.channel && t.channel !== "both" && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-gray-100 text-gray-600">
                          {t.channel === "wholesale" ? "Wholesale" : "D2C"}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {new Date(t.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Actions row */}
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); duplicate(t); }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                    title="Duplicate"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(t);
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* AI Generation Modal */}
        <GenerateTemplateModal
          open={showAiModal}
          onClose={() => setShowAiModal(false)}
          onGenerated={() => {
            setShowAiModal(false);
            // Poll for the generated template to appear
            setTimeout(() => refresh(), 2000);
            setTimeout(() => refresh(), 5000);
            setTimeout(() => refresh(), 10000);
          }}
        />

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
          description={`This will permanently delete this ${deleteTarget?.type || "template"} template.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (deleteTarget) {
              remove(deleteTarget.id);
              setDeleteTarget(null);
            }
          }}
        />
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
          <div className="flex items-center gap-1 ml-2">
            {(["email", "sms", "newsletter"] as TemplateType[]).map((t) => (
              <button
                key={t}
                onClick={() => setTemplateType(t)}
                className={clsx(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition",
                  templateType === t
                    ? t === "email" ? "bg-blue-100 text-blue-700" : t === "sms" ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"
                    : "text-gray-400 hover:bg-gray-100"
                )}
              >
                {t === "email" ? "Email" : t === "sms" ? "SMS" : "Newsletter"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEmailType && (
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
      {templateType === "sms" && (
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
      {isEmailType && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Block Palette */}
          {!showPreview && (
            <div className="w-56 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
              <div className="p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Add Block</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {BLOCK_PALETTE.map((b) => (
                    <button
                      key={b.type}
                      onClick={() => addBlock(b.type)}
                      className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition text-[10px] font-medium"
                    >
                      <b.icon size={16} />
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Brand presets */}
              <div className="p-3 border-t border-gray-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Brand Preset</div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => applyBrandPreset("ni")}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
                  >
                    NI
                  </button>
                  <button
                    onClick={() => applyBrandPreset("sassy")}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100 transition"
                  >
                    Sassy
                  </button>
                </div>
              </div>

              {/* Meta fields */}
              <div className="p-3 border-t border-gray-100 space-y-2.5">
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
            </div>
          )}

          {/* Center: Canvas */}
          <div
            className="flex-1 overflow-y-auto bg-gray-100"
            onClick={() => setSelectedBlockId(null)}
          >
            <div className="max-w-[620px] mx-auto my-6 bg-white shadow-lg rounded-lg overflow-hidden min-h-[400px]">
              {blocks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                  <Mail size={40} className="text-gray-200 mb-3" />
                  <h3 className="text-sm font-semibold text-gray-600">Start building your email</h3>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs">
                    Click blocks from the left panel to add them, or use a brand preset to get started quickly.
                  </p>
                </div>
              )}
              {blocks.map((block, i) => (
                <div key={block.id} className="relative group">
                  <BlockRenderer
                    block={block}
                    selected={selectedBlockId === block.id}
                    onSelect={() => setSelectedBlockId(block.id)}
                  />
                  {/* Hover actions */}
                  <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-lg shadow-sm border border-gray-200 p-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveBlock(block.id, -1); }}
                      disabled={i === 0}
                      className="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-20"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 1); }}
                      disabled={i === blocks.length - 1}
                      className="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-20"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}
                      className="p-1 rounded text-gray-400 hover:text-rose-500"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Block Properties */}
          {!showPreview && selectedBlock && (
            <div className="w-72 flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Properties</span>
                <button
                  onClick={() => setSelectedBlockId(null)}
                  className="p-1 rounded text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              </div>
              <BlockEditor block={selectedBlock} onUpdate={updateBlock} />
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

      {/* Promotion Picker Modal (available in editor view) */}
      <PromotionPickerModal
        open={showPromoPicker}
        onClose={() => setShowPromoPicker(false)}
        onSelect={addPromotionBlock}
      />
    </div>
  );
}
