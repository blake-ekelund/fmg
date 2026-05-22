/**
 * Microsoft Graph subscriptions for new-mail notifications.
 *
 * We subscribe to "me/mailFolders/Inbox/messages" with changeType=created.
 * That gives us a notification each time a new message lands in the user's
 * inbox — which is what we want for capturing replies from customers.
 *
 * Graph subscriptions on /messages max out at ~4230 minutes (~70 hours), so
 * we set ours to 24 hours and renew via cron every 6 hours.
 */

import { randomBytes } from "crypto";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const RESOURCE = "me/mailFolders/Inbox/messages";
const LIFETIME_HOURS = 24;

export type Subscription = {
  id: string;
  expirationDateTime: string;
  clientState: string;
  resource: string;
  notificationUrl: string;
};

function notificationUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${appUrl.replace(/\/$/, "")}/api/email/webhook`;
}

function inHours(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function generateClientState(): string {
  return randomBytes(24).toString("base64url");
}

export async function createSubscription(
  accessToken: string,
  clientState: string,
): Promise<Subscription> {
  const body = {
    changeType: "created",
    notificationUrl: notificationUrl(),
    resource: RESOURCE,
    expirationDateTime: inHours(LIFETIME_HOURS),
    clientState,
  };
  const res = await fetch(`${GRAPH_BASE}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph createSubscription failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as Subscription;
}

export async function renewSubscription(
  accessToken: string,
  subscriptionId: string,
): Promise<Subscription> {
  const res = await fetch(`${GRAPH_BASE}/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expirationDateTime: inHours(LIFETIME_HOURS) }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph renewSubscription failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as Subscription;
}

export async function deleteSubscription(
  accessToken: string,
  subscriptionId: string,
): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/subscriptions/${subscriptionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph deleteSubscription failed: ${res.status} ${text.slice(0, 300)}`);
  }
}

/**
 * Fetch a single message by Graph id with the fields we record.
 * Used by the webhook handler to expand resourceData notifications into real
 * messages we can store.
 */
export async function fetchMessage(
  accessToken: string,
  messageId: string,
): Promise<Record<string, unknown>> {
  const fields = [
    "id",
    "internetMessageId",
    "conversationId",
    "from",
    "toRecipients",
    "ccRecipients",
    "bccRecipients",
    "subject",
    "bodyPreview",
    "body",
    "hasAttachments",
    "isRead",
    "sentDateTime",
    "receivedDateTime",
  ].join(",");
  const res = await fetch(
    `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}?$select=${fields}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph getMessage failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}
