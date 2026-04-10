/**
 * Tiny/Olist – Authentication helpers
 *
 * Strategy (in priority order):
 *  1. V3 OAuth2 – Authorization Code flow (preferred)
 *     Requires TINY_CLIENT_ID + TINY_CLIENT_SECRET + TINY_REFRESH_TOKEN
 *  2. V2 – Simple token (TINY_TOKEN) – legacy fallback
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TINY_OAUTH_BASE =
  "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect";

// ---------------------------------------------------------------------------
// In-memory access-token cache (per server process)
// ---------------------------------------------------------------------------

let _v3Cache: { accessToken: string; expiresAt: number } | null = null;

// ---------------------------------------------------------------------------
// V3 – OAuth2 Authorization Code helpers
// ---------------------------------------------------------------------------

/** True when all V3 OAuth env vars are present. */
export function hasOAuthCredentials(): boolean {
  return !!(
    process.env.TINY_CLIENT_ID &&
    process.env.TINY_CLIENT_SECRET &&
    process.env.TINY_REFRESH_TOKEN
  );
}

/** True when only V3 client creds (but no refresh token) are present. */
export function hasClientCredentials(): boolean {
  return !!(process.env.TINY_CLIENT_ID && process.env.TINY_CLIENT_SECRET);
}

/**
 * Returns the URL the user should visit to authorize the app.
 * After authorization Tiny will redirect to TINY_REDIRECT_URI with ?code=...
 */
export function buildOAuthAuthorizationUrl(): string {
  const clientId = process.env.TINY_CLIENT_ID;
  const redirectUri = process.env.TINY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error(
      "[Tiny] TINY_CLIENT_ID and TINY_REDIRECT_URI must be set to start OAuth flow.",
    );
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid",
  });

  return `${TINY_OAUTH_BASE}/auth?${params.toString()}`;
}

/**
 * Exchanges an authorization code for access + refresh tokens.
 * Call this in the OAuth callback route.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const clientId = process.env.TINY_CLIENT_ID!;
  const clientSecret = process.env.TINY_CLIENT_SECRET!;
  const redirectUri = process.env.TINY_REDIRECT_URI!;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${TINY_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `[Tiny OAuth] Code exchange failed: ${data.error_description ?? res.statusText}`,
    );
  }

  return data;
}

/**
 * Returns a valid access token using the stored refresh token.
 * Caches the result in memory until 30 s before expiry.
 */
export async function getTinyV3AccessToken(): Promise<string> {
  const now = Date.now();

  if (_v3Cache && _v3Cache.expiresAt > now + 30_000) {
    return _v3Cache.accessToken;
  }

  const clientId = process.env.TINY_CLIENT_ID;
  const clientSecret = process.env.TINY_CLIENT_SECRET;
  const refreshToken = process.env.TINY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "[Tiny] OAuth não configurado. Acesse /financial-dashboard e clique em 'Conectar Tiny' para autorizar.",
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${TINY_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `[Tiny] Falha ao renovar token: ${data.error_description ?? res.statusText}`,
    );
  }

  _v3Cache = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  };

  return _v3Cache.accessToken;
}

/** Authorization header for Tiny V3 API calls. */
export async function tinyV3AuthHeaders(): Promise<Record<string, string>> {
  const token = await getTinyV3AccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// V2 – Simple token (legacy fallback)
// ---------------------------------------------------------------------------

export function getTinyV2Token(): string {
  const token = process.env.TINY_TOKEN;
  if (!token) {
    throw new Error(
      "[Tiny] TINY_TOKEN não configurado. Use OAuth2 (TINY_CLIENT_ID + TINY_CLIENT_SECRET) ou adicione TINY_TOKEN no .env.local.",
    );
  }
  return token;
}

export function tinyV2BaseParams(): Record<string, string> {
  return { token: getTinyV2Token(), formato: "JSON" };
}

// ---------------------------------------------------------------------------
// Helper: which auth mode is active?
// ---------------------------------------------------------------------------

export function getAuthMode(): "v3-oauth" | "v2-token" | "none" {
  // CLIENT_ID + CLIENT_SECRET presentes → modo V3 OAuth.
  // TINY_REFRESH_TOKEN pode ainda não existir (autorização pendente);
  // getTinyV3AccessToken() lançará "OAuth não configurado" nesse caso,
  // que a página detecta para mostrar o botão "Conectar Tiny".
  if (hasClientCredentials()) return "v3-oauth";
  if (process.env.TINY_TOKEN) return "v2-token";
  return "none";
}
