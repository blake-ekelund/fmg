import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import {
  currentQuarterLabel,
  firstNameOf,
  sendEmail,
} from "@/lib/email/send";
import { publicOriginFromRequest } from "@/lib/email/origin";
import { buildTrackedHtmlBody } from "@/lib/email/tracking";
import { parseEmailAddresses } from "@/lib/email/addresses";

export const runtime = "nodejs";
// Vercel Pro caps serverless functions at ~300s. With concurrency 5 below,
// the full ~80-rep roster fits comfortably inside that.
export const maxDuration = 300;

// Mirror /api/email/send: a small pool keeps us well under Graph throttling.
const SEND_CONCURRENCY = 5;

type RepRecipient = {
  name: string;
  email: string;
  agency?: string | null;
  territory?: string | null;
  city?: string | null;
  state?: string | null;
};

type SendRepsBody = {
  recipients: RepRecipient[];
  subject_template: string;
  body_template: string;
  /** Optional CC applied to every recipient's copy. */
  cc?: string;
};

/**
 * Rep-specific merge fields. Kept separate from the customer merge in
 * lib/email/send.ts because reps carry agency/territory context, not
 * lifetime-revenue/order metrics.
 */
type RepMergeVars = {
  firstName: string;
  repName: string;
  agency: string;
  territory: string;
  city: string;
  state: string;
  senderName: string;
  senderFirstName: string;
  senderEmail: string;
  currentYear: string;
  currentQuarter: string;
};

const REP_KEYS = [
  "firstName",
  "repName",
  "agency",
  "territory",
  "city",
  "state",
  "senderName",
  "senderFirstName",
  "senderEmail",
  "currentYear",
  "currentQuarter",
] as const;

const REP_MERGE_RE = new RegExp(`\\{\\{\\s*(${REP_KEYS.join("|")})\\s*\\}\\}`, "g");

function applyRepMerge(template: string, vars: RepMergeVars): string {
  return template.replace(REP_MERGE_RE, (_m, key: (typeof REP_KEYS)[number]) => vars[key] ?? "");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/email/send-reps
 * Sends one individual email per selected sales rep (not a group blast — each
 * rep gets their own copy and can't see the others). Because reps aren't
 * customers, we don't thread these into the inbox; we just send + report.
 */
export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: SendRepsBody;
  try {
    body = (await request.json()) as SendRepsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.subject_template?.trim()) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }
  if (!body.body_template?.trim()) {
    return NextResponse.json({ error: "Body is required" }, { status: 400 });
  }
  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    return NextResponse.json({ error: "Pick at least one rep" }, { status: 400 });
  }
  if (body.recipients.length > 500) {
    return NextResponse.json(
      { error: `Too many recipients (got ${body.recipients.length}, max 500).` },
      { status: 400 },
    );
  }

  const ccList = parseEmailAddresses(body.cc ?? null);
  if (ccList.length > 20) {
    return NextResponse.json(
      { error: `Too many Cc addresses (got ${ccList.length}, max 20).` },
      { status: 400 },
    );
  }
  const ccRecipients = ccList.map((address) => ({ address }));

  // Mint an access token for the sender.
  let accessToken: string;
  let senderEmail: string;
  let senderDisplayName: string | null;
  try {
    const t = await getAccessTokenForUser(user.id);
    accessToken = t.accessToken;
    senderEmail = t.account.email;
    senderDisplayName = t.account.display_name;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const senderVars = {
    senderName: senderDisplayName ?? "",
    senderFirstName: firstNameOf(senderDisplayName),
    senderEmail,
    currentYear: String(new Date().getFullYear()),
    currentQuarter: currentQuarterLabel(),
  };

  const origin = publicOriginFromRequest(request);
  let sentCount = 0;
  let failedCount = 0;
  const failures: string[] = [];

  const sendOne = async (r: RepRecipient): Promise<void> => {
    const email = (r.email ?? "").trim();
    if (!email || !EMAIL_RE.test(email)) {
      failedCount++;
      failures.push(`${r.name || email || "unknown"} — no valid email`);
      return;
    }

    const vars: RepMergeVars = {
      firstName: firstNameOf(r.name),
      repName: r.name ?? "",
      agency: r.agency ?? "",
      territory: r.territory ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      ...senderVars,
    };
    const subject = applyRepMerge(body.subject_template, vars);
    const bodyContent = applyRepMerge(body.body_template, vars);

    const messageId = randomUUID();
    const tracked = buildTrackedHtmlBody({ plainText: bodyContent, origin, messageId });

    try {
      await sendEmail(accessToken, {
        subject,
        bodyHtml: tracked.html,
        to: [{ address: email, name: r.name || undefined }],
        cc: ccRecipients.length > 0 ? ccRecipients : undefined,
      });
      sentCount++;
    } catch (e) {
      failedCount++;
      failures.push(`${r.name || email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  await runWithConcurrency(body.recipients, SEND_CONCURRENCY, sendOne);

  return NextResponse.json({
    sent: sentCount,
    failed: failedCount,
    total: body.recipients.length,
    failures: failures.slice(0, 25),
  });
}

/**
 * Run an async worker against an array with bounded concurrency. Each worker
 * pulls the next index from a shared cursor so slow sends don't block the pool.
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const next = async (): Promise<void> => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        await worker(items[i]);
      } catch {
        /* worker records its own errors */
      }
    }
  };
  const pool = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(pool);
}
