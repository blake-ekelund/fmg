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
 * Substitute {{firstName}}, {{customerName}}, {{state}} placeholders.
 * Anything we don't recognize is left in place — safer than blanking it.
 */
export function applyMergeFields(
  template: string,
  vars: { firstName?: string | null; customerName?: string | null; state?: string | null },
): string {
  return template.replace(/\{\{\s*(firstName|customerName|state)\s*\}\}/g, (_m, key) => {
    if (key === "firstName") return vars.firstName ?? "";
    if (key === "customerName") return vars.customerName ?? "";
    if (key === "state") return vars.state ?? "";
    return _m;
  });
}

/** First word of a name; used as a best-effort {{firstName}} for B2B contacts. */
export function firstNameOf(fullName: string | null | undefined): string {
  if (!fullName) return "";
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}
