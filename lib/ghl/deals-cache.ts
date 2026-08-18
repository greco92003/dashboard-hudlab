import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  getGhlDeals,
  getGhlWonDeals,
  type GhlMappedDeal,
} from "@/lib/ghl/api";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";

const UPSERT_BATCH_SIZE = 500;

export type GhlSyncSource = "manual" | "cron" | "webhook";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return createClient(url, getSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function toDealsCacheRow(
  deal: GhlMappedDeal,
  source: GhlSyncSource,
  requestId: string,
) {
  return {
    deal_id: deal.deal_id,
    source_system: "ghl",
    source_id: deal.deal_id,
    title: deal.title,
    value: deal.value,
    currency: deal.currency || "BRL",
    status: deal.status,
    stage_id: deal.stage_id,
    pipeline_id: deal.pipeline_id,
    stage_title: deal.stage_title,
    closing_date: deal.closing_date,
    created_date: deal.created_date,
    custom_field_value: deal.custom_field_value,
    custom_field_id: deal.custom_field_id,
    estado: deal.estado,
    "quantidade-de-pares": deal["quantidade-de-pares"],
    vendedor: deal.vendedor,
    designer: deal.designer,
    "utm-source": deal["utm-source"],
    "utm-medium": deal["utm-medium"],
    contact_id: deal.contact_id,
    organization_id: deal.organization_id,
    api_updated_at: deal.api_updated_at,
    segmento_de_negocio: deal.segmento_de_negocio,
    intencao_de_compra: deal.intencao_de_compra,
    data_embarque: deal.data_embarque,
    assigned_to: deal.assigned_to,
    provider_payload: deal,
    last_synced_at: new Date().toISOString(),
    sync_status: "synced",
    last_change_source: source,
    last_request_id: requestId,
  };
}

export async function upsertGhlDeals(
  deals: GhlMappedDeal[],
  source: GhlSyncSource,
  requestId: string,
) {
  const supabase = createServiceClient();
  let upserted = 0;

  for (let index = 0; index < deals.length; index += UPSERT_BATCH_SIZE) {
    const rows = deals
      .slice(index, index + UPSERT_BATCH_SIZE)
      .map((deal) => toDealsCacheRow(deal, source, requestId));
    const { error } = await supabase.from("deals_cache").upsert(rows, {
      onConflict: "deal_id",
      ignoreDuplicates: false,
    });
    if (error) throw new Error(`GHL cache upsert failed: ${error.message}`);
    upserted += rows.length;
  }

  return upserted;
}

async function removeStaleGhlDeals(liveDeals: GhlMappedDeal[]) {
  const supabase = createServiceClient();
  const cachedIds: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("deals_cache")
      .select("deal_id")
      .eq("source_system", "ghl")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`GHL stale read failed: ${error.message}`);
    const batch = data || [];
    cachedIds.push(...batch.map((row) => row.deal_id));
    if (batch.length < pageSize) break;
  }

  const liveIds = new Set(liveDeals.map((deal) => deal.deal_id));
  const staleIds = cachedIds.filter((dealId) => !liveIds.has(dealId));
  const staleRatio = cachedIds.length > 0 ? staleIds.length / cachedIds.length : 0;
  const largeDeleteApproved = process.env.GHL_ALLOW_LARGE_STALE_DELETE === "true";

  // A complete snapshot is required by the caller. This second circuit
  // breaker protects production if the provider ever reports a plausible but
  // catastrophically smaller total. Large cleanup must be explicitly opted in.
  if (
    !largeDeleteApproved &&
    staleIds.length > 100 &&
    staleRatio > 0.1
  ) {
    throw new Error(
      `GHL stale cleanup blocked: would delete ${staleIds.length}/${cachedIds.length} cached opportunities`,
    );
  }
  for (let index = 0; index < staleIds.length; index += 100) {
    const { error } = await supabase
      .from("deals_cache")
      .delete()
      .eq("source_system", "ghl")
      .in("deal_id", staleIds.slice(index, index + 100));
    if (error) throw new Error(`GHL stale cleanup failed: ${error.message}`);
  }
  return staleIds.length;
}

export async function syncAllGhlDeals(options?: {
  source?: Exclude<GhlSyncSource, "webhook">;
  requestId?: string;
}) {
  const startedAt = Date.now();
  const source = options?.source || "manual";
  const requestId = options?.requestId || crypto.randomUUID();
  const result = await getGhlDeals(true);
  if (!result.snapshotComplete || result.deals.length !== result.totalOpportunities) {
    throw new Error("Refusing to reconcile an incomplete GHL snapshot");
  }
  const upserted = await upsertGhlDeals(result.deals, source, requestId);
  const removed = await removeStaleGhlDeals(result.deals);

  const wonDeals = result.deals.filter(
    (deal) => deal.status?.toLowerCase() === "won",
  );
  const wonValue =
    wonDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0) / 100;

  return {
    requestId,
    source,
    fetchedAt: result.fetchedAt,
    totalOpportunities: result.totalOpportunities,
    pages: result.pages,
    duplicates: result.duplicates,
    snapshotComplete: result.snapshotComplete,
    upserted,
    removed,
    wonDeals: wonDeals.length,
    wonValue: Math.round(wonValue * 100) / 100,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Frequent, non-destructive reconciliation for sales. It never removes rows;
 * the daily complete sync remains responsible for verified stale cleanup.
 */
export async function syncWonGhlDeals(options?: {
  source?: Exclude<GhlSyncSource, "webhook">;
  requestId?: string;
}) {
  const startedAt = Date.now();
  const source = options?.source || "cron";
  const requestId = options?.requestId || crypto.randomUUID();
  const result = await getGhlWonDeals();
  if (!result.snapshotComplete || result.deals.length !== result.totalOpportunities) {
    throw new Error("Refusing to upsert an incomplete GHL won snapshot");
  }
  const upserted = await upsertGhlDeals(result.deals, source, requestId);
  const wonValue =
    result.deals.reduce((sum, deal) => sum + Number(deal.value || 0), 0) / 100;
  return {
    requestId,
    source,
    fetchedAt: result.fetchedAt,
    wonDeals: result.totalOpportunities,
    wonValue: Math.round(wonValue * 100) / 100,
    upserted,
    removed: 0,
    pages: result.pages,
    duplicates: result.duplicates,
    snapshotComplete: result.snapshotComplete,
    durationMs: Date.now() - startedAt,
  };
}
