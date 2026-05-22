/**
 * Send a reply to an existing thread via Microsoft Graph.
 *
 * Uses Graph's createReply → patch body → attach → send pattern so:
 *   - the new message inherits the original conversationId (threading)
 *   - we can put our own body content (createReply auto-quotes the original;
 *     we PATCH it back to the user's bare text)
 *   - attachments are added before send (each via POST /attachments)
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export type ReplyAttachment = {
  name: string;
  contentType: string;
  /** Raw base64 (no data:…;base64, prefix). */
  contentBytes: string;
};

export type ReplyResult = {
  graphMessageId: string;
  internetMessageId: string | null;
  conversationId: string;
  subject: string | null;
  bodyPreview: string | null;
  sentAt: string;
};

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

export async function sendReply(
  accessToken: string,
  targetMessageId: string,
  bodyText: string,
  attachments: ReplyAttachment[],
): Promise<ReplyResult> {
  // 1) Create the reply draft. Graph fills in To/Subject/conversationId from
  // the source message. The body comes back pre-populated with the quoted
  // original, which we'll overwrite below.
  const draftRes = await graphFetch(
    accessToken,
    `/me/messages/${encodeURIComponent(targetMessageId)}/createReply`,
    { method: "POST" },
  );
  if (!draftRes.ok) {
    const text = await draftRes.text().catch(() => "");
    throw new Error(`createReply failed: ${draftRes.status} ${text.slice(0, 300)}`);
  }
  const draft = (await draftRes.json()) as {
    id: string;
    subject?: string;
    conversationId: string;
    internetMessageId?: string;
    bodyPreview?: string;
  };

  // 2) Overwrite the body with the user's plain text.
  const patchRes = await graphFetch(
    accessToken,
    `/me/messages/${encodeURIComponent(draft.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        body: { contentType: "Text", content: bodyText },
      }),
    },
  );
  if (!patchRes.ok) {
    const text = await patchRes.text().catch(() => "");
    throw new Error(`patch draft body failed: ${patchRes.status} ${text.slice(0, 300)}`);
  }

  // 3) Add each attachment (inline, ≤3MB each).
  for (const att of attachments) {
    const attRes = await graphFetch(
      accessToken,
      `/me/messages/${encodeURIComponent(draft.id)}/attachments`,
      {
        method: "POST",
        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: att.name,
          contentType: att.contentType || "application/octet-stream",
          contentBytes: att.contentBytes,
        }),
      },
    );
    if (!attRes.ok) {
      const text = await attRes.text().catch(() => "");
      throw new Error(
        `attach "${att.name}" failed: ${attRes.status} ${text.slice(0, 300)}`,
      );
    }
  }

  // 4) Send the draft.
  const sendRes = await graphFetch(
    accessToken,
    `/me/messages/${encodeURIComponent(draft.id)}/send`,
    { method: "POST" },
  );
  if (!sendRes.ok) {
    const text = await sendRes.text().catch(() => "");
    // Best-effort cleanup of the orphan draft.
    await graphFetch(accessToken, `/me/messages/${encodeURIComponent(draft.id)}`, {
      method: "DELETE",
    }).catch(() => {});
    throw new Error(`send reply failed: ${sendRes.status} ${text.slice(0, 300)}`);
  }

  return {
    graphMessageId: draft.id,
    internetMessageId: draft.internetMessageId ?? null,
    conversationId: draft.conversationId,
    subject: draft.subject ?? null,
    bodyPreview: draft.bodyPreview ?? null,
    sentAt: new Date().toISOString(),
  };
}
