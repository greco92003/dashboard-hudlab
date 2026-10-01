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
    cached.closing_date !== incoming.closing_date
  );
}
