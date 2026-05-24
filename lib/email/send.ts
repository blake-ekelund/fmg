/**
 * Microsoft Graph mail sender.
 *
 * Uses the create-draft + send-draft pattern instead of /me/sendMail so we get
 * the message ID and conversationId back — both needed to record the message
 * in our DB and to thread replies later.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export type EmailRecipient = { address: string; name?: string };

export type SendEmailInput = {
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
};

export type SendEmailResult = {
  graphMessageId: string;
  internetMessageId: string | null;
  conversationId: string;
  sentAt: string;
  bodyPreview: string | null;
  fromAddress: string | null;
};

function toRecipientField(r: EmailRecipient) {
  return { emailAddress: { address: r.address, name: r.name } };
}

async function graphFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Create a draft, send it, return the IDs we need to thread replies.
 *
 * Why not /me/sendMail? That endpoint returns 202 with an empty body, so we
 * never see the conversationId — making it impossible to roll up the customer's
 * reply into the same thread.
 */
export async function sendEmail(
  accessToken: string,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const body =
    input.bodyHtml !== undefined
      ? { contentType: "HTML", content: input.bodyHtml }
      : { contentType: "Text", content: input.bodyText ?? "" };

  const draftBody = {
    subject: input.subject,
    body,
    toRecipients: input.to.map(toRecipientField),
    ccRecipients: (input.cc ?? []).map(toRecipientField),
    bccRecipients: (input.bcc ?? []).map(toRecipientField),
  };

  // 1) Create draft
  const draftRes = await graphFetch(accessToken, "/me/messages", {
    method: "POST",
    body: JSON.stringify(draftBody),
  });
  if (!draftRes.ok) {
    const text = await draftRes.text().catch(() => "");
    throw new Error(`Graph createDraft failed: ${draftRes.status} ${text.slice(0, 300)}`);
  }
  const draft = (await draftRes.json()) as {
    id: string;
    internetMessageId?: string;
    conversationId: string;
    bodyPreview?: string;
    from?: { emailAddress?: { address?: string } };
  };

  // 2) Send draft
  const sendRes = await graphFetch(accessToken, `/me/messages/${draft.id}/send`, {
    method: "POST",
  });
  if (!sendRes.ok) {
    const text = await sendRes.text().catch(() => "");
    // Try to clean up the orphan draft so the user's drafts folder doesn't fill up.
    await graphFetch(accessToken, `/me/messages/${draft.id}`, { method: "DELETE" }).catch(() => {});
    throw new Error(`Graph sendDraft failed: ${sendRes.status} ${text.slice(0, 300)}`);
  }

  return {
    graphMessageId: draft.id,
    internetMessageId: draft.internetMessageId ?? null,
    conversationId: draft.conversationId,
    sentAt: new Date().toISOString(),
    bodyPreview: draft.bodyPreview ?? null,
    fromAddress: draft.from?.emailAddress?.address ?? null,
  };
}

/**
 * Merge-field variables passed to applyMergeFields. All optional — missing
 * values render as an empty string. The list of supported tokens is intentionally
 * mirrored in the UI hints (ComposeEmailModal, EmailTemplatesPage) — if you
 * add a token here, surface it there too.
 */
export type MergeVars = {
  // Customer
  firstName?: string | null;
  customerName?: string | null;
  city?: string | null;
  state?: string | null;
  channel?: string | null;
  lifetimeRevenue?: number | null;
  lifetimeOrders?: number | null;
  lastOrderDate?: string | null;       // ISO date string
  daysSinceLastOrder?: number | null;

  // Sender (the rep doing the send)
  senderName?: string | null;
  senderFirstName?: string | null;
  senderEmail?: string | null;

  // Date / time (server-derived at send time)
  currentYear?: string | null;
  currentQuarter?: string | null;
};

const SUPPORTED_KEYS = [
  "firstName",
  "customerName",
  "city",
  "state",
  "channel",
  "lifetimeRevenue",
  "lifetimeOrders",
  "lastOrderDate",
  "daysSinceLastOrder",
  "senderName",
  "senderFirstName",
  "senderEmail",
  "currentYear",
  "currentQuarter",
] as const;

const MERGE_RE = new RegExp(`\\{\\{\\s*(${SUPPORTED_KEYS.join("|")})\\s*\\}\\}`, "g");

function formatCurrency(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Substitute merge-field placeholders. Unknown tokens are left in place
 * (safer than rendering an empty string for what might be a typo).
 */
export function applyMergeFields(template: string, vars: MergeVars): string {
  return template.replace(MERGE_RE, (_m, key) => {
    switch (key as (typeof SUPPORTED_KEYS)[number]) {
      case "firstName":
        return vars.firstName ?? "";
      case "customerName":
        return vars.customerName ?? "";
      case "city":
        return vars.city ?? "";
      case "state":
        return vars.state ?? "";
      case "channel":
        return vars.channel ?? "";
      case "lifetimeRevenue":
        return formatCurrency(vars.lifetimeRevenue ?? null);
      case "lifetimeOrders":
        return vars.lifetimeOrders != null ? String(vars.lifetimeOrders) : "";
      case "lastOrderDate":
        return formatDate(vars.lastOrderDate ?? null);
      case "daysSinceLastOrder":
        return vars.daysSinceLastOrder != null ? String(vars.daysSinceLastOrder) : "";
      case "senderName":
        return vars.senderName ?? "";
      case "senderFirstName":
        return vars.senderFirstName ?? "";
      case "senderEmail":
        return vars.senderEmail ?? "";
      case "currentYear":
        return vars.currentYear ?? "";
      case "currentQuarter":
        return vars.currentQuarter ?? "";
      default:
        return _m;
    }
  });
}

/** First word of a name; used as a best-effort {{firstName}} for B2B contacts. */
export function firstNameOf(fullName: string | null | undefined): string {
  if (!fullName) return "";
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

/** "Q1 2026" / "Q2 2026" / etc. for the current calendar quarter. */
export function currentQuarterLabel(d: Date = new Date()): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

/** Whole days between two ISO dates, or null if the source date is missing. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}
