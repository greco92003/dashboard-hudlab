// lib/ghl/sales-agent/copiloto-runner.ts
//
// Shared "generate + persist a Copiloto insight" logic, used by both the
// on-demand "Gerar Insight" click (app/api/sellers-v2/negotiation-insight)
// and the morning batch cron (app/api/cron/refresh-negotiation-priorities).
// Kept as its own module rather than duplicated in each route, since both
// callers need the exact same live-context resolution (fresh stage/value
// from GHL, not the daily-synced cache) for the report to be trustworthy.
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { fetchOpportunityById } from "@/lib/ghl/api";
import {
  getVendedorForOpportunity,
  getQtyParesForOpportunity,
  computeResponseGapStats,
  type NegotiationTranscript,
} from "@/lib/ghl/negotiation-conversations";
import { runCopiloto, type CopilotoReport } from "./agent";
import { MANUAL_VERSION } from "./manual";

export interface NegotiationOpportunityRef {
  id: string;
  contactId: string;
  stageName: string | null;
  monetaryValue: number | null;
  raw: unknown;
}

export interface GeneratedCopilotoInsight {
  report: CopilotoReport;
  messageCount: number;
  lastMessageAt: string | null;
}

/**
 * Runs the Copiloto for one opportunity's already-fetched transcript and
 * persists the result. `requestedBy` is the user id for an on-demand click,
 * or null for the automated morning batch.
 */
export async function generateCopilotoInsight(
  opportunity: NegotiationOpportunityRef,
  transcript: NegotiationTranscript,
  requestedBy: string | null,
): Promise<GeneratedCopilotoInsight> {
  const serviceClient = await createSupabaseServerForSync();

  // ghl_opportunities is only refreshed once a day (sync-ghl-daily cron),
  // so stage/value/custom fields there can be stale — fetch the opportunity
  // live from GHL so the context handed to the LLM matches the current CRM
  // state. Falls back to the cached row if the live call fails (e.g.
  // transient GHL error) rather than blocking the insight.
  const liveOpportunity = await fetchOpportunityById(opportunity.id).catch((err) => {
    console.error(
      "Failed to fetch live opportunity, falling back to cached data:",
      err,
    );
    return null;
  });

  const fieldsSource = liveOpportunity ?? opportunity.raw;
  const [vendedor, qtyPares] = await Promise.all([
    getVendedorForOpportunity(fieldsSource),
    getQtyParesForOpportunity(fieldsSource),
  ]);

  let etapaCrm = opportunity.stageName;
  let valorNegociacao = opportunity.monetaryValue;
  if (liveOpportunity) {
    valorNegociacao = liveOpportunity.monetaryValue ?? valorNegociacao;
    if (liveOpportunity.pipelineStageId) {
      const { data: stageRow } = await serviceClient
        .from("dim_pipeline_stages")
        .select("stage_name")
        .eq("stage_id", liveOpportunity.pipelineStageId)
        .maybeSingle();
      if (stageRow?.stage_name) etapaCrm = stageRow.stage_name;
    }
  }

  const report = await runCopiloto(
    transcript.messages,
    computeResponseGapStats(transcript.messages),
    { vendedor, etapaCrm, valorNegociacao, qtyPares },
  );

  const lastMessageAt =
    transcript.messages[transcript.messages.length - 1]?.dateAdded ?? null;

  const { error: insertError } = await serviceClient
    .from("ghl_negotiation_insights")
    .insert({
      opportunity_id: opportunity.id,
      contact_id: opportunity.contactId,
      vendedor,
      report,
      manual_version: MANUAL_VERSION,
      message_count: transcript.messages.length,
      last_message_at: lastMessageAt,
      requested_by: requestedBy,
    });

  if (insertError) {
    console.error("Failed to save negotiation insight:", insertError);
    // Still return the insight even if persistence failed — don't block the
    // coaching value (on-demand caller) on a logging failure.
  }

  return { report, messageCount: transcript.messages.length, lastMessageAt };
}
