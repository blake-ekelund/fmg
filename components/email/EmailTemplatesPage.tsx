"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Plus,
  Loader2,
  Trash2,
  Save,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
  last_used_at: string | null;
  updated_at: string;
};

/** "new" = a draft that hasn't been saved yet. */
type Editing = Template | "new" | null;

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* Sample values used in the preview so merge fields aren't blank. The server
   substitutes real values at send time — this is just a "what would it look
   like" approximation. */
const NOW = new Date();
const SAMPLE_VARS: Record<string, string> = {
  // Customer
  firstName: "Alex",
  customerName: "Acme Goods Co.",
  city: "Sacramento",
  state: "California",
  channel: "GIFT",
  lifetimeRevenue: "$12,450",
  lifetimeOrders: "5",
  lastOrderDate: NOW.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }),
  daysSinceLastOrder: "124",
  // Sender
  senderName: "Your Name",
  senderFirstName: "Your",
  senderEmail: "you@fragrance-marketing-group.com",
  // Date
  currentYear: String(NOW.getFullYear()),
  currentQuarter: `Q${Math.floor(NOW.getMonth() / 3) + 1} ${NOW.getFullYear()}`,
};

const MERGE_KEYS = Object.keys(SAMPLE_VARS);
const MERGE_RE = new RegExp(`\\{\\{\\s*(${MERGE_KEYS.join("|")})\\s*\\}\\}`, "g");

function applyMerge(template: string): string {
  return template.replace(MERGE_RE, (_m, k: string) => SAMPLE_VARS[k] ?? _m);
}

/**
 * Merge fields, grouped and labelled in plain English.
 *
 * These used to be rendered as ~14 bare {{token}} chips in one paragraph of
 * 10px text — you had to know what each meant and then type it by hand. Now
 * they're grouped, described, and clicking one inserts it at the cursor.
 */
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

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing>(null);

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
    setEditing("new");
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
                Click <span className="font-medium">New template</span> to create your first one.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {templates.map((t) => {
                const isActive = editing && editing !== "new" && editing.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setEditing(t)}
                      className={clsx(
                        "flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-gray-50",
                        isActive && "bg-gray-50",
                      )}
                    >
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
              key={editing === "new" ? "__new__" : editing.id}
              template={editing === "new" ? null : editing}
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
  template,
  onSaved,
  onDeleted,
  onCancel,
}: {
  template: Template | null;
  onSaved: (t: Template) => void | Promise<void>;
  onDeleted: (id: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const isNew = !template;
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = useMemo(() => {
    if (isNew) return name.trim() !== "" || subject.trim() !== "" || body.trim() !== "";
    return (
      name !== (template?.name ?? "") ||
      subject !== (template?.subject ?? "") ||
      body !== (template?.body ?? "")
    );
  }, [isNew, name, subject, body, template]);

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/email/templates", {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({
          id: template?.id,
          name: name.trim(),
          subject,
          body,
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
    if (!template) return;
    if (!confirm(`Delete template "${template.name}"?`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/email/templates/${template.id}`, {
        method: "DELETE",
        headers: await authHeader(),
      });
      if (res.ok || res.status === 204) {
        await onDeleted(template.id);
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json?.error ?? `Delete failed (${res.status})`);
      }
    } finally {
      setDeleting(false);
    }
  }

  const previewSubject = applyMerge(subject) || "(no subject)";
  const previewBody = applyMerge(body) || "(no body)";

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
            disabled={!name.trim() || saving}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white transition hover:bg-gray-800 disabled:opacity-40 lg:min-h-0 lg:py-1.5"
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
            Internal only — recipients never see this.
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
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              Body
            </label>
            <span className="text-[10px] text-gray-400">
              Plain text. Line breaks preserved.
            </span>
          </div>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => (lastFocused.current = "body")}
            rows={12}
            placeholder={
              "Hi {{firstName}},\n\nWanted to check in on how things are going at {{customerName}}.\n\nBest,\nYour Name"
            }
            className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2.5 font-mono text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 lg:py-2 lg:text-sm"
          />
        </div>

        <MergeFieldPicker onInsert={insertMergeField} />

        {/* Preview */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
            Preview · sample customer &ldquo;{SAMPLE_VARS.customerName}&rdquo;
          </div>
          <div className="text-xs">
            <div className="text-gray-500">Subject</div>
            <div className="text-gray-900 font-medium mb-2">{previewSubject}</div>
            <div className="text-gray-500">Body</div>
            <div className="text-gray-800 whitespace-pre-wrap">{previewBody}</div>
          </div>
        </div>
      </div>

      {/* Footer. "Close" is redundant on small screens — the header's back
          arrow does the same job and is where a thumb already is. */}
      <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-5 py-3">
        <div className="text-[11px] text-gray-400">
          {template?.last_used_at
            ? `Last used ${formatWhen(template.last_used_at)}`
            : isNew
              ? "Unsaved"
              : `Updated ${formatWhen(template.updated_at)}`}
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
