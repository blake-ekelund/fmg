"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { PageBlock } from "@/lib/site/pageBlocks";
import type { SiteBrand } from "@/lib/site/registry";

/** A saved widget as the editor holds it (see app/api/site-widgets). */
export type SiteWidget = {
  id: string;
  name: string;
  /** Draft content (the widget id doubles as the block id here). */
  draft: PageBlock | null;
  published: PageBlock | null;
  updatedAt: string;
  usedOn: { slug: string; label: string }[];
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

/**
 * The store's saved widgets: load, create, edit (draft autosave, 1.2s idle
 * per widget), rename, delete. `onSaved` fires after a draft save so the
 * editor can reload its canvas.
 */
export function useWidgets(brand: SiteBrand, onSaved: () => void) {
  const [widgets, setWidgets] = useState<SiteWidget[]>([]);
  const [notReady, setNotReady] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, PageBlock>());
  const onSavedRef = useRef(onSaved);
  // Widgets with a pending edit that should reload the canvas once saved.
  const loud = useRef(new Set<string>());
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const base = `/api/site-widgets/${brand}`;

  const reload = useCallback(async () => {
    try {
      const res = await call<{ widgets: SiteWidget[]; notReady?: boolean; hint?: string }>(base, "GET");
      setWidgets(res.widgets);
      setNotReady(res.notReady ? (res.hint ?? "Widgets aren't set up yet.") : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load widgets.");
    }
  }, [base]);

  useEffect(() => {
    let alive = true;
    call<{ widgets: SiteWidget[]; notReady?: boolean; hint?: string }>(base, "GET")
      .then((res) => {
        if (!alive) return;
        setWidgets(res.widgets);
        setNotReady(res.notReady ? (res.hint ?? "Widgets aren't set up yet.") : null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't load widgets."));
    return () => {
      alive = false;
    };
  }, [base]);

  const saveDraft = useCallback(
    async (id: string) => {
      const block = pending.current.get(id);
      if (!block) return;
      pending.current.delete(id);
      const reload = loud.current.delete(id);
      try {
        await call(`${base}/${id}`, "PUT", { block });
        if (reload) onSavedRef.current();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Widget save failed.");
      }
    },
    [base],
  );

  /** Edit a widget's draft content (autosaved). `quiet`: typed on the
   *  canvas itself, so the save doesn't reload it. */
  const updateDraft = useCallback(
    (id: string, block: PageBlock, quiet = false) => {
      setWidgets((list) => list.map((w) => (w.id === id ? { ...w, draft: block } : w)));
      pending.current.set(id, block);
      if (!quiet) loud.current.add(id);
      clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        setTimeout(() => saveDraft(id), 1200),
      );
    },
    [saveDraft],
  );

  /** Save every pending widget edit now (before a publish). */
  const flush = useCallback(async () => {
    const ids = [...pending.current.keys()];
    for (const id of ids) {
      clearTimeout(timers.current.get(id));
      await saveDraft(id);
    }
  }, [saveDraft]);

  // Leaving the editor: save what's pending.
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const [id, timer] of t) {
        clearTimeout(timer);
        void saveDraft(id);
      }
    };
  }, [saveDraft]);

  const create = useCallback(
    async (name: string, block: PageBlock): Promise<SiteWidget | null> => {
      try {
        const res = await call<{ widget: SiteWidget }>(base, "POST", { name, block });
        setWidgets((list) => [...list, res.widget].sort((a, b) => a.name.localeCompare(b.name)));
        return res.widget;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the widget.");
        return null;
      }
    },
    [base],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      setWidgets((list) => list.map((w) => (w.id === id ? { ...w, name } : w)));
      try {
        await call(`${base}/${id}`, "PUT", { name });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Rename failed.");
      }
    },
    [base],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await call(`${base}/${id}`, "DELETE");
        setWidgets((list) => list.filter((w) => w.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed.");
      }
    },
    [base],
  );

  return { widgets, notReady, error, setError, reload, updateDraft, flush, create, rename, remove };
}
