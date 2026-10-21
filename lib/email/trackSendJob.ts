/**
 * Follow an email send job from a corner toast, so whoever sent it can close
 * the dialog and keep working. Every send — queued Resend blasts, Outlook
 * customer emails and rep emails — is a server-side job by the time this runs;
 * the polling here is display only, so leaving the page or closing the tab
 * never stops the send.
 *
 *   trackSendJob({ jobId, subject: "Fall launch", total: 480 });
 *
 * Progress comes from GET /api/email/bulk-send/{id}; Cancel calls DELETE on the
 * same route. Client-only (module-level timers survive page changes).
 */

import { supabaseBrowser } from "@/lib/supabase/browser";
import { toast, updateToast } from "@/lib/toast";

type Progress = {
  status: "pending" | "in_progress" | "completed" | "cancelled" | "failed";
  total: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  failed_sample: Array<{ customer_name: string | null; customer_email: string; error_text: string | null }>;
};

const POLL_MS = 2500;
/** Consecutive poll failures before we stop watching (the send itself carries on). */
const MAX_POLL_ERRORS = 8;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function trackSendJob(opts: {
  jobId: string;
  subject: string;
  /** Recipients selected — shown until the first poll lands. */
  total: number;
  /** Test run: every copy goes to this address. */
  testEmail?: string | null;
}): void {
  const { jobId, total, testEmail } = opts;
  // Merge tags read as noise in a notice ("Hi {{firstName}}") — drop them.
  const clean = opts.subject.replace(/\s*\{\{[^}]*\}\}/g, "").replace(/[\s,;:–—-]+$/, "").trim();
  const what = clean ? `“${clean}”` : "your email";
  const verb = testEmail ? `Sending test copies of ${what}` : `Sending ${what}`;

  let stopped = false;
  let cancelling = false;
  let errors = 0;

  const cancel = {
    label: "Cancel",
    run: () => {
      cancelling = true;
      updateToast(t, { tone: "working", title: "Cancelling…", body: "Emails already sent stay sent.", action: undefined });
      void (async () => {
        try {
          await fetch(`/api/email/bulk-send/${jobId}`, { method: "DELETE", headers: await authHeader() });
        } catch {
          /* the next poll shows whether it took */
        }
      })();
    },
  };

  const t = toast({
    tone: "working",
    title: `${verb}…`,
    body: `Starting — ${plural(total, "recipient")}. You can keep working.`,
    action: cancel,
  });

  const finish = (p: Progress) => {
    stopped = true;
    const failNote =
      p.failed > 0
        ? ` ${plural(p.failed, "failed", "failed")}${p.failed_sample[0]?.error_text ? ` — e.g. ${p.failed_sample[0].error_text}` : ""}.`
        : "";
    const skipNote = p.skipped > 0 ? ` ${p.skipped} skipped (no email, unsubscribed or duplicate).` : "";
    if (p.status === "cancelled") {
      updateToast(t, {
        tone: "info",
        title: `Stopped sending ${what}`,
        body: `${plural(p.sent, "email")} went out before it was cancelled.${failNote}`,
        sticky: true,
        action: undefined,
      });
    } else if (p.failed > 0 || p.status === "failed") {
      updateToast(t, {
        tone: "error",
        title: `Sent ${p.sent} of ${p.total} — ${what}`,
        body: `${failNote.trim()}${skipNote}`,
        sticky: true,
        action: undefined,
      });
    } else {
      updateToast(t, {
        tone: "success",
        title: testEmail ? `Test copies of ${what} sent` : `Sent ${what}`,
        body: `${plural(p.sent, "email")} delivered${testEmail ? ` to ${testEmail}` : ""}.${skipNote}`,
        sticky: p.skipped > 0,
        action: undefined,
      });
    }
  };

  const tick = async () => {
    if (stopped) return;
    try {
      const res = await fetch(`/api/email/bulk-send/${jobId}`, { headers: await authHeader() });
      if (!res.ok) throw new Error(String(res.status));
      const p = (await res.json()) as Progress;
      errors = 0;
      if (p.status === "completed" || p.status === "cancelled" || p.status === "failed") {
        finish(p);
        return;
      }
      if (!cancelling) {
        const done = p.sent + p.failed;
        const goingOut = Math.max(0, p.total - p.skipped);
        updateToast(t, {
          tone: "working",
          title: `${verb}…`,
          body: `${done} of ${goingOut} sent${p.failed ? ` · ${p.failed} failed` : ""}. You can keep working.`,
          action: cancel,
        });
      }
    } catch {
      if (++errors >= MAX_POLL_ERRORS) {
        stopped = true;
        updateToast(t, {
          tone: "info",
          title: `Lost track of ${what}`,
          body: "The send is still running on the server — check Campaign Results for the outcome.",
          sticky: true,
          action: undefined,
        });
        return;
      }
    }
    if (!stopped) setTimeout(tick, POLL_MS);
  };

  setTimeout(tick, 1000);
}
