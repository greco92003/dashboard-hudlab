/**
 * Tiny/Olist HTTP client.
 *
 * Automatically picks the right auth strategy:
 *   1. V3 OAuth2 Bearer token (preferred) – when TINY_REFRESH_TOKEN is set
 *   2. V2 query-string token (fallback)    – when TINY_TOKEN is set
 */

import {
  TINY_BASE_URL,
  TINY_V3_BASE_URL,
  tinyEndpoints,
  tinyV3Endpoints,
  TinyEndpointKey,
} from "./endpoints";
import { getAuthMode, tinyV2BaseParams, tinyV3AuthHeaders } from "./auth";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TinyClientOptions = {
  params?: Record<string, string>;
  skipRetry?: boolean;
};

export async function tinyGet<T = unknown>(
  endpointKey: TinyEndpointKey,
  options: TinyClientOptions = {},
): Promise<T> {
  const mode = getAuthMode();

  if (mode === "none") {
    throw new Error(
      "[Tiny] Nenhuma credencial configurada. Adicione TINY_TOKEN (V2) ou complete o fluxo OAuth2 (V3) para usar o Dashboard Financeiro.",
    );
  }

  const attempts = options.skipRetry ? 1 : MAX_RETRIES + 1;
  let lastError: Error = new Error("Unknown error");

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      let url: string;
      let fetchOptions: RequestInit;

      if (mode === "v3-oauth") {
        // V3 – Bearer token, REST endpoints
        const path = tinyV3Endpoints[endpointKey];
        const qp = new URLSearchParams(options.params ?? {});
        url = `${TINY_V3_BASE_URL}${path}${qp.size ? `?${qp.toString()}` : ""}`;
        fetchOptions = {
          headers: await tinyV3AuthHeaders(),
          next: { revalidate: 60 },
        };
      } else {
        // V2 – token in query string
        const path = tinyEndpoints[endpointKey];
        const qp = new URLSearchParams({
          ...tinyV2BaseParams(),
          ...(options.params ?? {}),
        });
        url = `${TINY_BASE_URL}${path}?${qp.toString()}`;
        fetchOptions = { next: { revalidate: 60 } };
      }

      const res = await fetch(url, fetchOptions);

      if (res.status === 429) {
        await sleep(RETRY_DELAY_MS * 4);
        continue;
      }

      if (!res.ok) {
        throw new Error(
          `[TinyClient] ${endpointKey} → HTTP ${res.status}: ${res.statusText}`,
        );
      }

      const json = await res.json();

      // V2 wraps errors in retorno.status_processamento
      if (mode === "v2-token") {
        const retorno = (json as Record<string, unknown>)?.retorno as Record<
          string,
          unknown
        >;
        if (retorno?.status_processamento === "3") {
          const msg =
            (retorno?.registros as Record<string, unknown>)?.registro ??
            "Tiny API error";
          throw new Error(
            `[TinyClient] ${endpointKey} → ${JSON.stringify(msg)}`,
          );
        }
      }

      return json as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < attempts - 1) await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
}
