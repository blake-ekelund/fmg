import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { getAccessTokenForUser } from "@/lib/email/tokens";

export const runtime = "nodejs";

/**
 * POST /api/inventory/email-report
 *
 * Emails the inventory forecast CSV to the signed-in user, as an attachment.
 *
 * Exists because "Export" downloads a file, and a downloaded CSV on a phone is
 * effectively lost — no spreadsheet app, no obvious file location. Mailing it
 * puts the report somewhere the user can actually open it later, on a machine
 * where a CSV means something.
 *
 * The recipient is always the caller's own address, taken from their verified
 * session — never from the request body. That keeps this from being usable as
 * a way to mail arbitrary attachments to arbitrary people.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** Graph rejects simple (non-upload-session) attachments over ~3MB. */
const MAX_CSV_BYTES = 3 * 1024 * 1024;

type Body = {
  /** Raw CSV text, built client-side by the same code that powers Export. */
  csv?: string;
  /** Attachment filename. Sanitised below; a default is used if absent. */
  filename?: string;
  /** Human-readable summary of the filters the export was taken under. */
  scope?: string;
  rowCount?: number;
};

function graphFetch(accessToken: string, path: string, init: RequestInit = {}) {
  return fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/** Strip anything path-like or exotic — this string becomes a filename. */
function safeFilename(name: string | undefined): string {
  const fallback = `inventory_forecast_${new Date().toISOString().slice(0, 10)}.csv`;
  if (!name) return fallback;
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 100);
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned.toLowerCase().endsWith(".csv") ? cleaned : `${cleaned}.csv`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!user.email) {
    return NextResponse.json(
      { error: "Your account has no email address on file." },
      { status: 400 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const csv = body.csv;
  if (!csv || typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json({ error: "Nothing to export" }, { status: 400 });
  }

  const contentBytes = Buffer.from(csv, "utf8");
  if (contentBytes.byteLength > MAX_CSV_BYTES) {
    return NextResponse.json(
      { error: "That report is too large to email — use Export on desktop." },
      { status: 413 },
    );
  }

  let accessToken: string;
  try {
    ({ accessToken } = await getAccessTokenForUser(user.id));
  } catch (e) {
    // Almost always "no connected Outlook account" — say so plainly.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not reach your mailbox" },
      { status: 400 },
    );
  }

  const filename = safeFilename(body.filename);
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const scopeLine = body.scope ? `<p>Filters: ${escapeHtml(body.scope)}</p>` : "";
  const countLine =
    typeof body.rowCount === "number"
      ? `<p>${body.rowCount.toLocaleString("en-US")} product${body.rowCount === 1 ? "" : "s"}, with a 12-month projection per row.</p>`
      : "";

  const html =
    `<p>Your inventory forecast from ${escapeHtml(today)} is attached.</p>` +
    countLine +
    scopeLine +
    `<p style="color:#6b7b88;font-size:12px">Sent from the FMG portal.</p>`;

  try {
    // 1) Draft addressed to the caller.
    const draftRes = await graphFetch(accessToken, "/me/messages", {
      method: "POST",
      body: JSON.stringify({
        subject: `Inventory forecast — ${today}`,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: user.email } }],
      }),
    });
    if (!draftRes.ok) {
      const text = await draftRes.text().catch(() => "");
      throw new Error(`createDraft failed: ${draftRes.status} ${text.slice(0, 200)}`);
    }
    const draft = (await draftRes.json()) as { id: string };

    // 2) Attach the CSV.
    const attRes = await graphFetch(
      accessToken,
      `/me/messages/${encodeURIComponent(draft.id)}/attachments`,
      {
        method: "POST",
        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: filename,
          contentType: "text/csv",
          contentBytes: contentBytes.toString("base64"),
        }),
      },
    );
    if (!attRes.ok) {
      const text = await attRes.text().catch(() => "");
      throw new Error(`attach failed: ${attRes.status} ${text.slice(0, 200)}`);
    }

    // 3) Send.
    const sendRes = await graphFetch(
      accessToken,
      `/me/messages/${encodeURIComponent(draft.id)}/send`,
      { method: "POST" },
    );
    if (!sendRes.ok) {
      const text = await sendRes.text().catch(() => "");
      throw new Error(`send failed: ${sendRes.status} ${text.slice(0, 200)}`);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not send the report" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sentTo: user.email });
}
