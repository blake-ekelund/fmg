"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Sparkles } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { openSageConversation, SAGE_HISTORY_EVENT } from "@/components/HelpAssistant";

/**
 * "Recent chats" at the bottom of the sidebar: the signed-in user's latest Sage
 * conversations. Clicking one opens Sage on it. Refreshes whenever Sage saves
 * or deletes a chat. Renders nothing until there's history (or when the
 * sage_conversations migration isn't applied yet).
 */

type Item = { id: string; title: string };

const SHOWN = 5;

export default function SageRecentChats({ collapsed }: { collapsed: boolean }) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await supabaseBrowser().auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch("/api/help/conversations", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        const j = (await res.json().catch(() => null)) as { items?: Item[] } | null;
        if (!cancelled && res.ok) setItems((j?.items ?? []).slice(0, SHOWN));
      } catch {
        /* the list is a convenience — stay quiet on failure */
      }
    }
    void load();
    window.addEventListener(SAGE_HISTORY_EVENT, load);
    // Chats are private: drop the list the moment someone signs out, and load
    // the new person's own list when they sign in.
    const { data: auth } = supabaseBrowser().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setItems([]);
      else if (event === "SIGNED_IN") void load();
    });
    return () => {
      cancelled = true;
      window.removeEventListener(SAGE_HISTORY_EVENT, load);
      auth.subscription.unsubscribe();
    };
  }, []);

  if (!items.length) return null;

  // Collapsed rail: one icon that opens the latest chat.
  if (collapsed) {
    return (
      <div className="shrink-0 border-t border-white/8 px-2 pt-2">
        <button
          onClick={() => openSageConversation(items[0].id)}
          title={`Recent chat: ${items[0].title}`}
          aria-label="Open your most recent Sage chat"
          className="flex w-full justify-center rounded-lg py-2 text-white/45 transition-colors hover:bg-white/8 hover:text-white"
        >
          <Sparkles size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-white/8 px-2 pt-2">
      <div className="flex items-center gap-1.5 px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">
        <Sparkles size={11} /> Recent chats
      </div>
      <div className="space-y-px">
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => openSageConversation(c.id)}
            title={c.title}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-white/55 transition-colors hover:bg-white/8 hover:text-white"
          >
            <MessageSquare size={13} className="shrink-0" />
            <span className="truncate">{c.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
