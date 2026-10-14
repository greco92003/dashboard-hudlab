import "server-only";

import { fetchGhlContactById, fetchOpportunityById, updateGhlOpportunity } from "@/lib/ghl/api";
import {
  getNegotiationTranscript,
  getQtyParesForOpportunity,
} from "@/lib/ghl/negotiation-conversations";
import {
  AI_ESCALATED_TAG,
  AI_TAG,
  AI_VENDEDOR_NAME,
  VENDEDOR_FIELD_ID,
} from "./config";
import { decideAssignment, type AssignDecision } from "./decide";
import { addContactTags } from "./ghl-actions";
import { findCurrentOpportunity } from "./run";

export interface AssignResult {
  decision: AssignDecision;
  opportunityId: string | null;
  pares: number | null;
  dryRun: boolean;
}

/**
 * Chamado pelo workflow "IA Vendedora | Entrada" quando a amostra digital é
 * entregue. Se o cliente é da Cami: tag ia-atendimento (a partir daí o
 * workflow "Responder" chama a Cami a cada mensagem) e Vendedor = CAMI na
 * oportunidade. dryRun só decide.
 */
export async function assignToSeller(
  contactId: string,
  options: { opportunityId?: string | null; dryRun?: boolean } = {},
): Promise<AssignResult> {
  const dryRun = options.dryRun === true;
  const [contact, opportunity, transcript] = await Promise.all([
    fetchGhlContactById(contactId),
    options.opportunityId
      ? fetchOpportunityById(options.opportunityId)
      : findCurrentOpportunity(contactId),
    getNegotiationTranscript(contactId),
  ]);
  const pares = opportunity ? await getQtyParesForOpportunity(opportunity) : null;

  const decision = decideAssignment({
    now: Date.now(),
    tags: contact.tags ?? [],
    aiTag: AI_TAG,
    escalatedTag: AI_ESCALATED_TAG,
    pipelineId: opportunity?.pipelineId ?? null,
    pares,
    messages: transcript.messages,
  });

  if (decision.assign && !dryRun && opportunity) {
    await updateGhlOpportunity(opportunity.id, {
      customFields: [{ id: VENDEDOR_FIELD_ID, fieldValue: AI_VENDEDOR_NAME }],
    });
    // Tag por último: é ela que liga a Cami no workflow "Responder".
    await addContactTags(contactId, [AI_TAG]);
  }

  console.info("IA vendedora: entrada", {
    contactId,
    opportunityId: opportunity?.id ?? null,
    pares,
    decision,
    dryRun,
  });
  return { decision, opportunityId: opportunity?.id ?? null, pares, dryRun };
}
