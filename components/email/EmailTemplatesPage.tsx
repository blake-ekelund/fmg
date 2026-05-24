"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText,
  Plus,
  Loader2,
  Trash2,
  Save,
  CheckCircle2,
  AlertTriangle,
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

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Email Templates</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Save subjects + bodies you reuse. Pick them in the compose modal with one click.
          </p>
        </div>
        <button
          onClick={startNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3.5 py-2 text-xs font-medium hover:bg-gray-800 transition"
        >
          <Plus size={13} />
          New template
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* List */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-y-auto">
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
                        "w-full text-left px-4 py-3 hover:bg-gray-50 transition",
                        isActive && "bg-gray-50",
                      )}
                    >
                      <div className="text-sm font-medium text-gray-800 truncate">
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
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Editor */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col">
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
        <div className="text-sm font-semibold text-gray-900">
          {isNew ? "New template" : template?.name}
        </div>
        <div className="flex items-center gap-2">
          {savedAt && Date.now() - savedAt < 3000 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-green-600">
              <CheckCircle2 size={11} /> Saved
            </span>
          )}
          {!isNew && (
            <button
              onClick={remove}
              disabled={deleting}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-200 transition disabled:opacity-50"
            >
              <Trash2 size={12} />
              Delete
            </button>
          )}
          <button
            onClick={save}
            disabled={!name.trim() || saving}
            className="inline-flex items-center gap-1 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-gray-800 transition disabled:opacity-40"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {isNew ? "Save template" : dirty ? "Save changes" : "Saved"}
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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quarterly check-in"
            autoFocus
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
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
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="A quick question, {{firstName}}"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
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
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            placeholder={
              "Hi {{firstName}},\n\nWanted to check in on how things are going at {{customerName}}.\n\nBest,\nYour Name"
            }
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y font-mono"
          />
          <div className="text-[10px] text-gray-400 mt-1 leading-relaxed">
            <span className="font-medium">Customer:</span>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{firstName}}"}</code>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{customerName}}"}</code>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{city}}"}</code>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{state}}"}</code>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{channel}}"}</code>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{lifetimeRevenue}}"}</code>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{lifetimeOrders}}"}</code>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{lastOrderDate}}"}</code>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{daysSinceLastOrder}}"}</code>
            <br />
            <span className="font-medium">Sender:</span>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{senderName}}"}</code>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{senderFirstName}}"}</code>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{senderEmail}}"}</code>
            {" · "}
            <span className="font-medium">Date:</span>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{currentYear}}"}</code>{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{currentQuarter}}"}</code>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
            Preview · sample customer "{SAMPLE_VARS.customerName}"
          </div>
          <div className="text-xs">
            <div className="text-gray-500">Subject</div>
            <div className="text-gray-900 font-medium mb-2">{previewSubject}</div>
            <div className="text-gray-500">Body</div>
            <div className="text-gray-800 whitespace-pre-wrap">{previewBody}</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 shrink-0 flex items-center justify-between">
        <div className="text-[11px] text-gray-400">
          {template?.last_used_at
            ? `Last used ${formatWhen(template.last_used_at)}`
            : isNew
              ? "Unsaved"
              : `Updated ${formatWhen(template.updated_at)}`}
        </div>
        <button
          onClick={onCancel}
          className="text-xs text-gray-500 hover:text-gray-900 transition"
        >
          Close
        </button>
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
