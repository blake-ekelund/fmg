"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * A page's title + one-sentence description live in the top bar, not in the
 * page body — the body used to repeat the title the bar already showed, and
 * the description ate a row of space above every table.
 *
 * Pages publish theirs by rendering <PageMeta title="…" description="…" />
 * (renders nothing; works from server components too). Pages that don't fall
 * back to the nav label in TopBar.
 */

type Meta = { title?: string; description?: string; owner: symbol };

const Ctx = createContext<{
  meta: Meta | null;
  setMeta: (m: Meta | null | ((prev: Meta | null) => Meta | null)) => void;
} | null>(null);

export function PageMetaProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const value = useMemo(() => ({ meta, setMeta }), [meta]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** What the top bar renders: the current page's published title/description. */
export function usePageMetaValue(): { title?: string; description?: string } {
  const meta = useContext(Ctx)?.meta;
  return { title: meta?.title, description: meta?.description };
}

export default function PageMeta({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  const setMeta = useContext(Ctx)?.setMeta;
  const [owner] = useState(() => Symbol("page-meta"));

  useEffect(() => {
    if (!setMeta) return;
    setMeta({ title, description, owner });
  }, [setMeta, title, description, owner]);

  // Clear on unmount — but only if a newer page hasn't already claimed the bar.
  useEffect(() => {
    if (!setMeta) return;
    return () => setMeta((prev) => (prev?.owner === owner ? null : prev));
  }, [setMeta, owner]);

  return null;
}
