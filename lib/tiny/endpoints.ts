/**
 * Tiny/Olist API endpoints.
 *
 * V2 (token) → query-string based, PHP-style paths
 * V3 (OAuth2) → REST paths under /public-api/v3
 *
 * ⚠️  V3 paths are provisional – confirm against the official docs before going live.
 *    https://developers.tiny.com.br/
 */

// ---------------------------------------------------------------------------
// V2 – token-based (legacy / fallback)
// ---------------------------------------------------------------------------

export const TINY_BASE_URL =
  process.env.TINY_BASE_URL ?? "https://api.tiny.com.br/api2";

export const tinyEndpoints = {
  contasPagar: "/contas.pagar.pesquisa.php",
  contasReceber: "/contas.receber.pesquisa.php",
  categoriaContaPagar: "/categorias.php",
} as const;

// ---------------------------------------------------------------------------
// V3 – OAuth2 Bearer (preferred)
// ---------------------------------------------------------------------------

export const TINY_V3_BASE_URL = "https://api.tiny.com.br/public-api/v3";

/**
 * V3 REST endpoints.
 * ⚠️  Validate these paths against the official Tiny V3 documentation.
 *    If a path returns 404, check the official API reference and update here.
 */
export const tinyV3Endpoints = {
  contasPagar: "/contas-pagar",
  contasReceber: "/contas-receber",
  categoriaContaPagar: "/categorias",
} as const;

// ---------------------------------------------------------------------------
// Shared key type (both maps share the same keys)
// ---------------------------------------------------------------------------

export type TinyEndpointKey = keyof typeof tinyEndpoints;
