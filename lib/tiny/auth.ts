/**
 * Tiny/Olist – Authentication helpers
 *
 * Strategy (in priority order):
 *  1. V3 OAuth2 – Authorization Code flow (preferred)
 *     Requires TINY_CLIENT_ID + TINY_CLIENT_SECRET
 *     Refresh token is persisted in Supabase system_config table (key: tiny_refresh_token)
 *     Falls back to TINY_REFRESH_TOKEN env var if Supabase has no token
 *  2. V2 – Simple token (TINY_TOKEN) – legacy fallback
 *
 * Token lifecycle:
 *  - Access token expires in ~4 hours (cached in memory)
 *  - Refresh token expires after 24 hours of inactivity (Tiny's Keycloak config)
 *  - A cron job (/api/cron/refresh-tiny-token) runs every 6 hours to keep it alive
 *  - Each time the refresh token is used, the new one is saved back to Supabase
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TINY_OAUTH_BASE =
  "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect";

const SUPABASE_TOKEN_KEY = "tiny_refresh_token";

// ---------------------------------------------------------------------------
// In-memory access-token cache (per server process)
// ---------------------------------------------------------------------------

let _v3Cache: { accessToken: string; expiresAt: number } | null = null;

// ---------------------------------------------------------------------------
// Supabase token persistence helpers
// ---------------------------------------------------------------------------

/** Saves the refresh token to the system_config table in Supabase. */
export async function saveRefreshTokenToSupabase(
  refreshToken: string,
): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return;

    await fetch(`${supabaseUrl}/rest/v1/system_config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        key: SUPABASE_TOKEN_KEY,
        value: refreshToken,
        description:
          "Tiny ERP OAuth2 refresh token (auto-renovado pelo sistema)",
      }),
    });
  } catch {
    // Non-fatal – log only
    console.warn("[Tiny] Could not save refresh token to Supabase");
  }
}

/** Reads the refresh token from system_config (most up-to-date) or env var fallback. */
async function loadRefreshTokenFromSupabase(): Promise<string | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return null;

    const res = await fetch(
      `${supabaseUrl}/rest/v1/system_config?key=eq.${SUPABASE_TOKEN_KEY}&select=value`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        cache: "no-store",
      },
    );

    if (!res.ok) return null;
    const rows = await res.json();
    return (rows as { value: string }[])[0]?.value ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// V3 – OAuth2 Authorization Code helpers
// ---------------------------------------------------------------------------

/** True when V3 client credentials are present (refresh token may be in Supabase). */
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
 * Requests offline_access so the refresh token survives idle periods.
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
    scope: "openid offline_access",
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
 * Returns a valid access token.
 * Priority for the refresh token:
 *   1. Supabase system_config (always the most recent after any refresh)
 *   2. TINY_REFRESH_TOKEN env var (initial seed / local dev fallback)
 * After each successful refresh the new refresh token is saved back to Supabase.
 * Result is cached in memory until 60 s before expiry.
 */
export async function getTinyV3AccessToken(): Promise<string> {
  const now = Date.now();

  if (_v3Cache && _v3Cache.expiresAt > now + 60_000) {
    return _v3Cache.accessToken;
  }

  const clientId = process.env.TINY_CLIENT_ID;
  const clientSecret = process.env.TINY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "[Tiny] OAuth não configurado. Acesse /financial-dashboard e clique em 'Conectar Tiny' para autorizar.",
    );
  }

  // Supabase has the latest rotated token; env var is the initial seed fallback
  const refreshToken =
    (await loadRefreshTokenFromSupabase()) ?? process.env.TINY_REFRESH_TOKEN;

  if (!refreshToken) {
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
    // Token expirado ou inválido → força re-autenticação
    _v3Cache = null;
    throw new Error(
      `[Tiny] Token expirado. Acesse /financial-dashboard e clique em 'Conectar Tiny' para re-autorizar. (${data.error_description ?? res.statusText})`,
    );
  }

  // Persist the new (rotated) refresh token so the next call uses it
  if (data.refresh_token) {
    await saveRefreshTokenToSupabase(data.refresh_token);
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
