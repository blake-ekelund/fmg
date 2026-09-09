"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
<<<<<<< Updated upstream
import MergeFieldTextarea from "@/components/email/MergeFieldTextarea";
=======
>>>>>>> Stashed changes
import {
  FileText,
  Plus,
  Loader2,
  Trash2,
  Save,
  CheckCircle2,
  AlertTriangle,
<<<<<<< Updated upstream
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { MERGE_GROUPS, SAMPLE_VARS, applyMergeSample } from "@/lib/email/mergeFields";
=======
  Upload,
  Code2,
} from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { applySampleMergeFields, sampleFor } from "@/lib/email/mergeFields";
import { validateTemplateBody, type TemplateIssue } from "@/lib/email/htmlTemplate";
import MergeFieldHints from "./MergeFieldHints";
>>>>>>> Stashed changes

type BodyFormat = "text" | "html";

type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
  body_format: BodyFormat;
  source_filename: string | null;
  last_used_at: string | null;
  updated_at: string;
};

/** An unsaved template — either a blank "New template" or a fresh upload. */
type Draft = {
  draft: true;
  name: string;
  subject: string;
  body: string;
  body_format: BodyFormat;
  source_filename: string | null;
};

type Editing = Template | Draft | null;

function isDraft(e: Editing): e is Draft {
  return e !== null && "draft" in e;
}

/** Uploads over this never reach the API; the server caps at 2MB. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function blankDraft(): Draft {
  return {
    draft: true,
    name: "",
    subject: "",
    body: "",
    body_format: "text",
    source_filename: null,
  };
}

/** "welcome-email.html" → "Welcome email" — a starting point, not a decision. */
function nameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  if (!base) return "";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/email/templates", { headers: await authHeader() });
      const json = await res.json();
      setTemplates((json.templates as Template[]) ?? []);
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  function startNew() {
    setUploadError(null);
    setEditing(blankDraft());
  }

  /**
   * Read the file into an unsaved draft rather than uploading it straight to
   * the server: an export almost always needs its merge fields checked and its
   * name set before it's worth persisting.
   */
  async function handleFile(file: File) {
    setUploadError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(
        `${file.name} is ${Math.round(file.size / 1024)}KB — the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
      );
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Could not read that file.");
      return;
    }
    setEditing({
      draft: true,
      name: nameFromFilename(file.name),
      subject: "",
      body: text,
      body_format: "html",
      source_filename: file.name,
    });
  }

  async function handleSaved(t: Template) {
    await reload();
    setEditing(t);
  }

  async function handleDeleted(id: string) {
    setTemplates((cur) => cur.filter((x) => x.id !== id));
    setEditing(null);
  }

  // Below lg the two panes can't sit side by side, and stacking them inside a
  // fixed-height grid gave each ~250px of scroll box. Small screens show one
  // pane at a time instead: the list, or the editor with a back button.
  const showEditorOnly = editing !== null;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      <div className={clsx("mb-4 flex items-center justify-between gap-3", showEditorOnly && "hidden lg:flex")}>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Email Templates</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            Save subjects + bodies you reuse. Pick them in the compose modal with one click.
          </p>
        </div>
<<<<<<< Updated upstream
        <button
          onClick={startNew}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 text-xs font-medium text-white transition hover:bg-gray-800 lg:min-h-0 lg:py-2"
        >
          <Plus size={13} />
          <span className="hidden sm:inline">New template</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:h-[calc(100vh-220px)] lg:min-h-[500px] lg:grid-cols-[320px_1fr]">
        {/* List — hidden on small screens once a template is open */}
        <div
          className={clsx(
            "rounded-xl border border-gray-200 bg-white lg:overflow-y-auto",
            showEditorOnly && "hidden lg:block",
          )}
        >
=======
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              // Reset so picking the same file twice still fires onChange.
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <Upload size={13} />
            Upload HTML
          </button>
          <button
            onClick={startNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3.5 py-2 text-xs font-medium hover:bg-gray-800 transition"
          >
            <Plus size={13} />
            New template
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 inline-flex items-start gap-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* List */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-y-auto">
>>>>>>> Stashed changes
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400 inline-flex items-center gap-2 justify-center w-full">
              <Loader2 size={14} className="animate-spin" />
              Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <FileText size={24} className="mx-auto text-gray-300 mb-2" />
              <div className="text-sm font-medium text-gray-500">No templates yet</div>
              <p className="text-xs text-gray-400 mt-1">
                Click <span className="font-medium">New template</span> to write one, or{" "}
                <span className="font-medium">Upload HTML</span> to import a design.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {templates.map((t) => {
                const isActive = !isDraft(editing) && editing?.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setEditing(t)}
                      className={clsx(
                        "flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-gray-50",
                        isActive && "bg-gray-50",
                      )}
                    >
<<<<<<< Updated upstream
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800">
                          {t.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-gray-500">
                          {t.subject || "(no subject)"}
                        </span>
                        <span className="mt-1 block text-[10px] text-gray-400">
                          {t.last_used_at
                            ? `Last used ${formatWhen(t.last_used_at)}`
                            : `Updated ${formatWhen(t.updated_at)}`}
                        </span>
                      </span>
                      <ChevronRight size={15} className="shrink-0 text-gray-300 lg:hidden" />
=======
                      <div className="text-sm font-medium text-gray-800 truncate flex items-center gap-1.5">
                        {t.body_format === "html" && (
                          <Code2 size={11} className="text-gray-400 shrink-0" />
                        )}
                        {t.name}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate mt-0.5">
                        {t.subject || "(no subject)"}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1">
                        {t.last_used_at
                          ? `Last used ${formatWhen(t.last_used_at)}`
                          : `Updated ${formatWhen(t.updated_at)}`}
                      </div>
>>>>>>> Stashed changes
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Editor — the only pane on small screens once something is open */}
        <div
          className={clsx(
            "flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white",
            editing === null && "hidden lg:flex",
          )}
        >
          {editing === null ? (
            <EmptyState onNew={startNew} hasAny={templates.length > 0} />
          ) : (
            <TemplateEditor
              key={isDraft(editing) ? `__draft__${editing.source_filename ?? ""}` : editing.id}
              initial={editing}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              onCancel={() => setEditing(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Editor ──────────────────────────────────────────────────────────────── */

function TemplateEditor({
  initial,
  onSaved,
  onDeleted,
  onCancel,
}: {
  initial: Template | Draft;
  onSaved: (t: Template) => void | Promise<void>;
  onDeleted: (id: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const isNew = isDraft(initial);
  const saved = isNew ? null : initial;

  const [name, setName] = useState(initial.name);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Format is fixed at creation: an uploaded document is HTML, a typed one is
  // text. Toggling would either escape the author's markup or dump raw tags
  // into a plain-text body, so we don't offer it.
  const format = initial.body_format;
  const isHtml = format === "html";
  const sourceFilename = initial.source_filename;

  const dirty = useMemo(() => {
    if (isNew) return name.trim() !== "" || subject.trim() !== "" || body.trim() !== "";
    return name !== initial.name || subject !== initial.subject || body !== initial.body;
  }, [isNew, name, subject, body, initial]);

  // Validate as they type. Same function the API gates on, so what the editor
  // shows is exactly what the server will accept.
  const issues = useMemo<TemplateIssue[]>(
    () => [
      ...validateTemplateBody(subject, "text").issues,
      ...validateTemplateBody(body, format).issues,
    ],
    [subject, body, format],
  );
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  async function save() {
    if (!name.trim() || saving || errors.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/email/templates", {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({
          id: saved?.id,
          name: name.trim(),
          subject,
          body,
          body_format: format,
          source_filename: sourceFilename,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Save failed (${res.status})`);
      } else if (json?.template) {
        setSavedAt(Date.now());
        await onSaved(json.template as Template);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!saved) return;
    if (!confirm(`Delete template "${saved.name}"?`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/email/templates/${saved.id}`, {
        method: "DELETE",
        headers: await authHeader(),
      });
      if (res.ok || res.status === 204) {
        await onDeleted(saved.id);
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json?.error ?? `Delete failed (${res.status})`);
      }
    } finally {
      setDeleting(false);
    }
  }

<<<<<<< Updated upstream
  const previewSubject = applyMergeSample(subject) || "(no subject)";
  const previewBody = applyMergeSample(body) || "(no body)";

  /* Insert a merge token at the caret of whichever field was last focused,
     defaulting to the body. Typing "{{daysSinceLastOrder}}" by hand from a
     10px reference line was the old flow. */
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocused = useRef<"subject" | "body">("body");

  function insertMergeField(key: string) {
    const token = `{{${key}}}`;
    const el = lastFocused.current === "subject" ? subjectRef.current : bodyRef.current;
    if (!el) return;

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + token + el.value.slice(end);

    if (lastFocused.current === "subject") setSubject(next);
    else setBody(next);

    // Restore the caret after the inserted token rather than dumping the user
    // at the end of the field.
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header. Sticky on small screens so Save stays reachable while the
          body scrolls; the back arrow returns to the list. */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-gray-100 bg-white px-3 py-2.5 lg:static lg:px-5 lg:py-3">
        <button
          onClick={onCancel}
          aria-label="Back to templates"
          className="-ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 lg:hidden"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
          {isNew ? "New template" : template?.name}
=======
  const previewSubject = applySampleMergeFields(subject) || "(no subject)";
  const previewBody = applySampleMergeFields(body);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
        <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          {isNew ? (isHtml ? "New HTML template" : "New template") : saved?.name}
          {isHtml && (
            <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              <Code2 size={9} />
              HTML
            </span>
          )}
>>>>>>> Stashed changes
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {savedAt && Date.now() - savedAt < 3000 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-green-600">
              <CheckCircle2 size={11} />
              <span className="hidden sm:inline">Saved</span>
            </span>
          )}
          {!isNew && (
            <button
              onClick={remove}
              disabled={deleting}
              aria-label="Delete template"
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-red-600 transition hover:border-red-200 hover:bg-red-50 disabled:opacity-50 lg:min-h-0 lg:py-1.5"
            >
              <Trash2 size={12} />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}
          <button
            onClick={save}
<<<<<<< Updated upstream
            disabled={!name.trim() || saving}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white transition hover:bg-gray-800 disabled:opacity-40 lg:min-h-0 lg:py-1.5"
=======
            disabled={!name.trim() || saving || errors.length > 0}
            title={
              errors.length > 0 ? "Fix the merge-field errors below first" : undefined
            }
            className="inline-flex items-center gap-1 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-gray-800 transition disabled:opacity-40"
>>>>>>> Stashed changes
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {isNew ? "Save" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 inline-flex items-start gap-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
            Template name
          </label>
          {/* No autoFocus — on a phone it opened the keyboard and scrolled the
              header off before the user had seen the form. */}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quarterly check-in"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 lg:py-2 lg:text-sm"
          />
          <div className="text-[10px] text-gray-400 mt-1">
            {sourceFilename
              ? `Uploaded from ${sourceFilename}. Internal only — recipients never see this.`
              : "Internal only — recipients never see this."}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
            Subject
          </label>
          <input
            ref={subjectRef}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onFocus={() => (lastFocused.current = "subject")}
            placeholder="A quick question, {{firstName}}"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 lg:py-2 lg:text-sm"
          />
          {isHtml && (
            <div className="text-[10px] text-gray-400 mt-1">
              Uploaded files carry no subject line — set one here.
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              Body
            </label>
            <span className="text-[10px] text-gray-400">
<<<<<<< Updated upstream
              Plain text · type “/” for merge fields
=======
              {isHtml
                ? "HTML — sent as authored, with links tracked."
                : "Plain text. Line breaks preserved."}
>>>>>>> Stashed changes
            </span>
          </div>
          <MergeFieldTextarea
            ref={bodyRef}
            value={body}
<<<<<<< Updated upstream
            onValueChange={setBody}
            channel="both"
            onFocus={() => (lastFocused.current = "body")}
            rows={12}
=======
            onChange={(e) => setBody(e.target.value)}
            rows={isHtml ? 10 : 12}
            spellCheck={!isHtml}
>>>>>>> Stashed changes
            placeholder={
              "Hi {{firstName}},\n\nWanted to check in on how things are going at {{customerName}}.\n\nBest,\nYour Name"
            }
            className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2.5 font-mono text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 lg:py-2 lg:text-sm"
          />
        </div>

<<<<<<< Updated upstream
        <MergeFieldPicker onInsert={insertMergeField} />
=======
        <IssueList errors={errors} warnings={warnings} />
>>>>>>> Stashed changes

        {/* Preview */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
<<<<<<< Updated upstream
            Preview · sample customer &ldquo;{SAMPLE_VARS.customerName}&rdquo;
=======
            Preview · sample customer &ldquo;{sampleFor("customerName")}&rdquo;
>>>>>>> Stashed changes
          </div>
          <div className="text-xs">
            <div className="text-gray-500">Subject</div>
            <div className="text-gray-900 font-medium mb-2">{previewSubject}</div>
            <div className="text-gray-500 mb-1">Body</div>
            {isHtml ? (
              <iframe
                // Sandboxed with no allow-* flags: this is untrusted authored
                // markup, and it must not run scripts or reach the parent page.
                sandbox=""
                srcDoc={previewBody}
                title="Template preview"
                className="w-full h-[420px] rounded border border-gray-200 bg-white"
              />
            ) : (
              <div className="text-gray-800 whitespace-pre-wrap">
                {previewBody || "(no body)"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer. "Close" is redundant on small screens — the header's back
          arrow does the same job and is where a thumb already is. */}
      <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-5 py-3">
        <div className="text-[11px] text-gray-400">
          {saved?.last_used_at
            ? `Last used ${formatWhen(saved.last_used_at)}`
            : isNew
              ? "Unsaved"
              : saved
                ? `Updated ${formatWhen(saved.updated_at)}`
                : "Unsaved"}
        </div>
        <button
          onClick={onCancel}
          className="hidden text-xs text-gray-500 transition hover:text-gray-900 lg:inline"
        >
          Close
        </button>
      </div>
    </div>
  );
}

<<<<<<< Updated upstream
/* ─── Merge fields ────────────────────────────────────────────────────────── */

function MergeFieldPicker({ onInsert }: { onInsert: (key: string) => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Merge fields
        </span>
        <span className="text-[10px] text-gray-400">
          Tap to insert at your cursor
        </span>
      </div>

      <div className="space-y-2.5">
        {MERGE_GROUPS.map(({ group, fields }) => (
          <div key={group}>
            <div className="mb-1 text-[10px] font-medium text-gray-500">{group}</div>
            <div className="flex flex-wrap gap-1.5">
              {fields.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => onInsert(f.key)}
                  title={`Inserts {{${f.key}}}`}
                  className="inline-flex min-h-[32px] items-center rounded-md border border-gray-200 bg-gray-50 px-2 text-[11px] font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200"
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
=======
/* ─── Validation feedback ─────────────────────────────────────────────────── */

function IssueList({
  errors,
  warnings,
}: {
  errors: TemplateIssue[];
  warnings: TemplateIssue[];
}) {
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
          <div className="text-[11px] font-semibold text-red-800 mb-1.5 inline-flex items-center gap-1.5">
            <AlertTriangle size={12} />
            {errors.length === 1
              ? "1 merge-field problem — fix it to save"
              : `${errors.length} merge-field problems — fix them to save`}
          </div>
          <ul className="space-y-1 list-disc pl-4">
            {errors.map((i, n) => (
              <li key={n} className="text-[11px] text-red-700 leading-relaxed">
                {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="text-[11px] font-semibold text-amber-800 mb-1.5 inline-flex items-center gap-1.5">
            <AlertTriangle size={12} />
            {warnings.length === 1 ? "1 warning" : `${warnings.length} warnings`}
          </div>
          <ul className="space-y-1 list-disc pl-4">
            {warnings.map((i, n) => (
              <li key={n} className="text-[11px] text-amber-800 leading-relaxed">
                {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}
>>>>>>> Stashed changes
    </div>
  );
}

/* ─── Empty state ─────────────────────────────────────────────────────────── */

function EmptyState({ onNew, hasAny }: { onNew: () => void; hasAny: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-6 py-10">
      <div>
        <FileText size={28} className="mx-auto text-gray-300 mb-3" />
        <div className="text-sm font-medium text-gray-500">
          {hasAny ? "Pick a template on the left" : "Create your first template"}
        </div>
        {hasAny ? (
          <p className="text-xs text-gray-400 mt-1">
            Or click <span className="font-medium">New template</span> to start a fresh one.
          </p>
        ) : (
          <button
            onClick={onNew}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3 py-2 text-xs font-medium hover:bg-gray-800 transition"
          >
            <Plus size={12} />
            New template
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function formatWhen(s: string): string {
  const d = new Date(s);
  const diff = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diff < 7 * day) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
