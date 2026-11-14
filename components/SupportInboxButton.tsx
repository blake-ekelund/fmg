"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Headphones, X } from "lucide-react";
import clsx from "clsx";
import { useUser } from "@/components/UserContext";
import { getAllowedPaths } from "@/components/navConfig";
import { supabaseBrowser } from "@/lib/supabase/browser";
import BodyPortal from "@/components/BodyPortal";

/**
 * Top-bar shortcut to Customer Service (the Sassy + NI storefront chat board).
 *
 * The badge is the number of OUTSTANDING customer items: chats the AI sent to
 * a human plus chats a person is helping with. It turns amber while anything
 * is waiting for someone to take it.
 *
 * It is also the alert: when the AI hands a NEW chat to a person, every signed-in
 * user who can open the inbox gets a toast (bottom right), whatever page they're
 * on. The same chat also sits at the top of the notification bell until someone
 * takes it. Hidden for roles that can't open the inbox.
 */

const HREF = "/storefronts/conversations";
const POLL_MS = 30_000;

type Escalation = {
  id: string;
  store: string | null;
  subject: string | null;
  name: string | null;
  email: string | null;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function SupportInboxButton() {
  const { profile } = useUser();
  const pathname = usePathname();
  const [outstanding, setOutstanding] = useState(0);
  const [needsHuman, setNeedsHuman] = useState(0);
  const [toast, setToast] = useState<Escalation | null>(null);
  // The newest waiting ticket at the last poll. The first poll only sets it,
  // so loading a page never alerts for chats that were already waiting.
  const lastSeen = useRef<string | null | undefined>(undefined);

  const allowed = useMemo(
    () => new Set(getAllowedPaths(profile?.access ?? null)).has(HREF),
    [profile?.access],
  );

  useEffect(() => {
    if (!allowed) return;
    let stopped = false;
    async function tick() {
      try {
        const res = await fetch("/api/support/conversations/count", {
          headers: await authHeader(),
          cache: "no-store",
        });
        if (!res.ok || stopped) return;
        const json = (await res.json()) as {
          outstanding?: number;
          needsHuman?: number;
          latestEscalation?: Escalation | null;
        };
        if (stopped) return;
        setOutstanding(json.outstanding ?? 0);
        setNeedsHuman(json.needsHuman ?? 0);

        const latest = json.latestEscalation ?? null;
        if (lastSeen.current !== undefined && latest && latest.id !== lastSeen.current) {
          setToast(latest);
        }
        lastSeen.current = latest?.id ?? null;
      } catch {
        // a missed poll just keeps the last count
      }
    }
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // Re-check on navigation too, so the badge follows what you just did.
  }, [allowed, pathname]);

  // Toasts step aside on their own; the bell keeps the item until it's taken.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 15_000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!allowed) return null;

  const active = pathname === HREF;
  return (
    <>
      <Link
        href={HREF}
        title={
          outstanding > 0
            ? `Customer Service: ${outstanding} outstanding (${needsHuman} waiting for someone)`
            : "Customer Service"
        }
        aria-label={outstanding > 0 ? `Customer Service, ${outstanding} outstanding` : "Customer Service"}
        className={clsx(
          "relative flex h-8 w-8 items-center justify-center rounded-lg transition",
          active
            ? "bg-surface-muted text-ink"
            : "text-ink-muted hover:bg-surface-muted hover:text-ink",
        )}
      >
        <Headphones size={17} />
        {outstanding > 0 && (
          <span
            className={clsx(
              "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-surface",
              needsHuman > 0 ? "bg-amber-500" : "bg-accent-600",
            )}
          >
            {outstanding > 9 ? "9+" : outstanding}
          </span>
        )}
      </Link>

      {toast ? (
        <BodyPortal>
          <div
            role="alert"
            className="fixed bottom-5 right-5 z-[80] w-80 rounded-xl border border-amber-200 bg-white p-3.5 shadow-overlay"
          >
            <div className="flex items-start gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
                <Headphones size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  A customer needs help · {toast.store === "ni" ? "NI" : "Sassy"}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">
                  {[toast.name || toast.email, toast.subject].filter(Boolean).join(" · ") ||
                    "The AI handed a chat to a person."}
                </p>
                <Link
                  href={`${HREF}?open=${toast.id}`}
                  onClick={() => setToast(null)}
                  className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline"
                >
                  Open the chat →
                </Link>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                aria-label="Dismiss"
                className="text-ink-subtle hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </BodyPortal>
      ) : null}
    </>
  );
}
