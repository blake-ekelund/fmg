"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ListTodo, Mail, Newspaper, Plus, Share2 } from "lucide-react";
import { useUser } from "@/components/UserContext";
import { getAllowedPaths } from "@/components/navConfig";
import { AddTaskModal } from "@/components/tasks/AddTaskModal";

/**
 * The top-bar "+" menu: start a new task, email template, social post or blog
 * post from any page. Each entry only shows if the user's role can open the
 * page it belongs to (same rule as the sidebar).
 *
 * A task opens the Task List's own form right here. The others land on their
 * page with ?new=1, which opens that page's own "new" wizard.
 */

type Entry = {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** The page whose access gates this entry. */
  path: string;
  /** Where to go (omitted for the inline task form). */
  href?: string;
};

const ENTRIES: Entry[] = [
  { key: "task", label: "New task", icon: <ListTodo size={14} />, path: "/task-list" },
  { key: "template", label: "New email template", icon: <Mail size={14} />, path: "/templates", href: "/templates?new=1" },
  { key: "social", label: "New social post", icon: <Share2 size={14} />, path: "/marketing/social", href: "/marketing/social?new=1" },
  { key: "blog", label: "New blog post", icon: <Newspaper size={14} />, path: "/marketing/blog", href: "/marketing/blog?new=1" },
];

export default function QuickCreateMenu() {
  const { profile } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => {
    const allowed = new Set(getAllowedPaths(profile?.access ?? null));
    return ENTRIES.filter((e) => allowed.has(e.path));
  }, [profile?.access]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (entries.length === 0) return null;

  function choose(e: Entry) {
    setOpen(false);
    if (!e.href) {
      setTaskOpen(true);
      return;
    }
    // Already on that page: its "open the wizard" check only runs on load, so
    // do a full load; otherwise a normal client-side navigation.
    if (pathname === e.path) window.location.assign(e.href);
    else router.push(e.href);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface-muted hover:text-ink"
        aria-label="Create new"
        aria-expanded={open}
        title="Create new"
      >
        <Plus size={18} />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-overlay">
          {entries.map((e) => (
            <button
              key={e.key}
              onClick={() => choose(e)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink-secondary transition hover:bg-surface-muted hover:text-ink"
            >
              <span className="text-ink-subtle">{e.icon}</span>
              {e.label}
            </button>
          ))}
        </div>
      )}

      {taskOpen && (
        <AddTaskModal
          open
          onClose={() => setTaskOpen(false)}
          // The Task List loads its rows once; refresh it if that's where we are.
          onSaved={() => {
            if (pathname === "/task-list") window.location.reload();
          }}
        />
      )}
    </div>
  );
}
