import { isDeepStrictEqual } from "node:util";
import type { GhlMappedDeal } from "./api";

export interface CachedWonDeal {
  deal_id: string;
  provider_payload: GhlMappedDeal | null;
  status: string | null;
  value: number | string | null;
  stage_id: string | null;
  pipeline_id: string | null;
  closing_date: string | null;
}

/** Tempo que o webhook tem para entregar uma mudança antes de o sync assumir. */
export const WEBHOOK_GRACE_MS = 10 * 60 * 1_000;

/** deals_cache.value é numeric(18,2): acima disso o lote inteiro é recusado. */
const MAX_STORABLE_VALUE = 1e16;

export function isStorableDealValue(value: number) {
  return Number.isFinite(value) && Math.abs(value) < MAX_STORABLE_VALUE;
}

export function isWithinWebhookGrace(
  incoming: Pick<GhlMappedDeal, "api_updated_at">,
  nowMs: number,
) {
  const updatedAt = Date.parse(incoming.api_updated_at ?? "");
  return Number.isFinite(updatedAt) && nowMs - updatedAt < WEBHOOK_GRACE_MS;
}

/**
 * Mudança que o webhook deveria ter gravado e não gravou. Payload e
 * fechamento ficam de fora: diferem por detalhe de mapeamento e pelas
 * exceções manuais (deals_closing_date_overrides), sem culpa do webhook.
 */
export function webhookMissedWonDeal(
  incoming: GhlMappedDeal,
  cached: CachedWonDeal | undefined,
) {
  if (!cached) return true;
  return (
    cached.status !== incoming.status ||
    Number(cached.value) !== incoming.value ||
    cached.stage_id !== incoming.stage_id ||
    cached.pipeline_id !== incoming.pipeline_id
  );
}

export function shouldUpdateWonDeal(
  incoming: GhlMappedDeal,
  cached: CachedWonDeal | undefined,
): boolean {
  if (!cached) return true;
  return (
    !isDeepStrictEqual(cached.provider_payload, incoming) ||
    cached.status !== incoming.status ||
    Number(cached.value) !== incoming.value ||
    cached.stage_id !== incoming.stage_id ||
    cached.pipeline_id !== incoming.pipeline_id ||
    // PostgREST serializes the timestamptz column at UTC midnight while the
    // GHL payload carries the same closing day as YYYY-MM-DD.
    (cached.closing_date?.slice(0, 10) ?? null) !== incoming.closing_date
  );
}
