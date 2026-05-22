/**
 * Thin Microsoft Graph client for OAuth + the Graph endpoints we use.
 *
 * Intentionally avoids the @azure/msal-node + @microsoft/microsoft-graph-client
 * SDKs — direct fetch keeps the bundle small and the surface area transparent.
 */

const TOKEN_HOST = "https://login.microsoftonline.com";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const GRAPH_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.Send",
  "Mail.ReadWrite",
];

type EnvConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  appUrl: string;
};

function env(): EnvConfig {
  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Microsoft env vars not set (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET)",
    );
  }
  return { tenantId, clientId, clientSecret, appUrl };
}

function redirectUri(): string {
  return `${env().appUrl.replace(/\/$/, "")}/api/auth/microsoft/callback`;
}

export function buildAuthUrl(state: string): string {
  const { tenantId, clientId } = env();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: GRAPH_SCOPES.join(" "),
    state,
    // prompt=select_account lets the user pick which Microsoft account if they
    // have multiple signed in. Drop to "consent" if you ever need to force the
    // consent screen during development.
    prompt: "select_account",
  });
  return `${TOKEN_HOST}/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const { tenantId } = env();
  const res = await fetch(`${TOKEN_HOST}/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Token endpoint returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const err = json as { error?: string; error_description?: string };
    throw new Error(
      `Token endpoint error: ${err.error ?? res.status} — ${err.error_description ?? text.slice(0, 200)}`,
    );
  }
  return json as TokenResponse;
}

export function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = env();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
    scope: GRAPH_SCOPES.join(" "),
  });
  return postToken(body);
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = env();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: GRAPH_SCOPES.join(" "),
  });
  return postToken(body);
}

export type GraphMe = {
  id: string;
  displayName: string | null;
  mail: string | null;
  userPrincipalName: string | null;
};

export async function getMe(accessToken: string): Promise<GraphMe> {
  const res = await fetch(`${GRAPH_BASE}/me?$select=id,displayName,mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Graph /me failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as GraphMe;
}
