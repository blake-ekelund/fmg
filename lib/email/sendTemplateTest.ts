/**
 * Send a template test email from a corner toast instead of a spinner the
 * user has to sit and watch. The caller saves the template first (so the
 * server renders what's on screen), then hands off here and moves on.
 *
 * POST /api/email/block-templates/{id}/test is one short request, so it is
 * fine for it to live in the browser: page changes don't interrupt it.
 * Client-only.
 */

import { supabase } from "@/lib/supabaseClient";
import { toast, updateToast } from "@/lib/toast";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function sendTemplateTest(opts: {
  templateId: string;
  to: string;
  /** Optional customer whose real data fills the merge fields. */
  customer?: { customer_type: "wholesale" | "d2c"; customer_ref: string; name?: string } | null;
}): void {
  const { templateId, to, customer } = opts;
  const t = toast({ tone: "working", title: "Sending test email…", body: `To ${to}. You can keep working.` });
  void (async () => {
    try {
      const res = await fetch(`/api/email/block-templates/${templateId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          to,
          ...(customer ? { customer_type: customer.customer_type, customer_ref: customer.customer_ref } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Send failed (${res.status}).`);
      const used = (json.usedCustomer as string | null) ?? customer?.name ?? null;
      updateToast(t, {
        tone: "success",
        title: "Test email sent",
        body: `To ${json.sentTo ?? to}${used ? ` using ${used}’s merge data` : ""}. Check your inbox.`,
      });
    } catch (e) {
      updateToast(t, {
        tone: "error",
        title: "Couldn't send the test email",
        body: e instanceof Error ? e.message : "Send failed.",
        sticky: true,
      });
    }
  })();
}
