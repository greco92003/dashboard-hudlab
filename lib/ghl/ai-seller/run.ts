import "server-only";

import OpenAI from "openai";
import type {
  ResponseFunctionToolCall,
  ResponseInput,
} from "openai/resources/responses/responses";
import {
  fetchGhlContactById,
  fetchGhlPipelines,
  searchGhlOpportunitiesByContact,
  type GhlOpportunity,
} from "@/lib/ghl/api";
import {
  getNegotiationTranscript,
  getQtyParesForOpportunity,
} from "@/lib/ghl/negotiation-conversations";
import { createContactNote } from "@/lib/ghl/mockup-instructions/ghl-client";
import {
  buildTranscriptParts,
  todayBRDateString,
} from "@/lib/ghl/sales-agent/agent";
import {
  AI_ESCALATED_TAG,
  AI_SELLER_MODEL,
  AI_TAG,
  escalationUserId,
  escalationUserName,
  MAX_AGENT_STEPS,
  personaName,
} from "./config";
import { decideRun } from "./decide";
import {
  addContactTags,
  assignContact,
  moveOpportunityForward,
  moveOpportunityToArtChange,
  quoteFreightForPares,
  removeContactTags,
  sendWhatsAppMessage,
  writeBudgetChain,
} from "./ghl-actions";
import { runAgentLoop, type CallModel, type LoopResult } from "./loop";
import { buildContextText, buildSellerInstructions } from "./prompt";
import { insertRun, loadAiHistory, type AiSellerRunInsert } from "./runs-store";
import { executeTool, TOOL_DEFINITIONS } from "./tools";
import type { EscalationReason, RunDecision, SellerActions } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

export interface RespondResult {
  decision: RunDecision;
  dryRun: boolean;
  sentMessageIds: string[];
  toolCalls?: LoopResult["toolCalls"];
  error?: string | null;
}

function handoffMessage(): string {
  return `Vou pedir pra ${escalationUserName()} continuar seu atendimento por aqui, tá bom? 😊`;
}

async function findCurrentOpportunity(contactId: string): Promise<GhlOpportunity | null> {
  const opportunities = await searchGhlOpportunitiesByContact(contactId);
  const open = opportunities.filter((o) => (o.status ?? "open") === "open");
  open.sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
  return open[0] ?? null;
}

function realActions(contactId: string, opportunityId: string): SellerActions {
  const persona = personaName();
  return {
    async sendMessages(messages) {
      const ids: string[] = [];
      for (const [index, message] of messages.entries()) {
        if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
        ids.push(await sendWhatsAppMessage(contactId, message));
      }
      return ids;
    },
    async escalate({ motivo, resumo, mensagemCliente }) {
      const ids: string[] = [];
      const text = mensagemCliente.trim() || handoffMessage();
      try {
        ids.push(await sendWhatsAppMessage(contactId, text));
      } catch (err) {
        console.error("IA vendedora: falha ao avisar o cliente na passagem", err);
      }
      await removeContactTags(contactId, [AI_TAG]);
      await addContactTags(contactId, [AI_ESCALATED_TAG]);
      await assignContact(contactId, escalationUserId());
      await createContactNote({
        contactId,
        title: `IA ${persona} passou o atendimento — ${motivo}`,
        body: `Motivo: ${motivo}\n\n${resumo}`,
      });
      return ids;
    },
    quoteFreight: (input) => quoteFreightForPares(input),
    writeBudget: (input) => writeBudgetChain({ contactId, opportunityId, ...input }),
    async requestArtChange(resumo) {
      const status = await moveOpportunityToArtChange(opportunityId);
      await createContactNote({
        contactId,
        title: `Pedido de ajuste de arte (IA ${persona})`,
        body: resumo,
      });
      return status;
    },
    moveStage: (etapa) => moveOpportunityForward(opportunityId, etapa),
  };
}

/** Sem efeito colateral: só a cotação de frete (leitura) é real. */
function dryRunActions(): SellerActions {
  let counter = 0;
  const fakeId = () => `dry-${++counter}`;
  return {
    async sendMessages(messages) {
      return messages.map(() => fakeId());
    },
    async escalate() {
      return [fakeId()];
    },
    quoteFreight: (input) => quoteFreightForPares(input),
    async writeBudget() {},
    async requestArtChange() {
      return "movido";
    },
    async moveStage() {
      return "movido";
    },
  };
}

function makeCallModel(instructions: string): CallModel {
  return async (input) => {
    const response = await openai.responses.create({
      model: AI_SELLER_MODEL,
      instructions,
      input: input as ResponseInput,
      tools: TOOL_DEFINITIONS,
      tool_choice: "required",
      parallel_tool_calls: false,
      reasoning: { effort: "medium" },
      store: false,
      include: ["reasoning.encrypted_content"],
      max_output_tokens: 6000,
    });
    const functionCalls = response.output
      .filter((item): item is ResponseFunctionToolCall => item.type === "function_call")
      .map((item) => ({ call_id: item.call_id, name: item.name, arguments: item.arguments }));
    return {
      outputItems: response.output,
      functionCalls,
      usage: response.usage
        ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
        : null,
    };
  };
}

/**
 * Ponto de entrada público. "O cliente nunca fica sem resposta em silêncio":
 * qualquer falha lançada por respondToContactUnsafe fora do loop do agente
 * (busca inicial, pipelines, montagem do contexto, ramo humano_assumiu etc.)
 * cai aqui e, em produção, tenta escalar para humano e registrar a rodada
 * como erro em vez de deixar a rota estourar um 500 silencioso.
 */
export async function respondToContact(
  contactId: string,
  options: { dryRun?: boolean } = {},
): Promise<RespondResult> {
  const dryRun = options.dryRun === true;
  const startedAt = Date.now();

  try {
    return await respondToContactUnsafe(contactId, dryRun, startedAt);
  } catch (err) {
    if (dryRun) throw err;

    const error = err instanceof Error ? err.message : String(err);
    console.error("IA vendedora: falha fora do loop do agente", { contactId, error });

    let sentMessageIds: string[] = [];
    try {
      sentMessageIds = await realActions(contactId, "").escalate({
        motivo: "falha_tecnica",
        resumo: error,
        mensagemCliente: handoffMessage(),
      });
    } catch (escalateErr) {
      console.error("IA vendedora: falha também ao escalar fora do loop", escalateErr);
    }

    try {
      await insertRun({
        contact_id: contactId,
        opportunity_id: null,
        triggered_at: new Date(startedAt).toISOString(),
        decision: "erro",
        escalation_reason: "falha_tecnica",
        tool_calls: [],
        sent_message_ids: sentMessageIds,
        model: null,
        usage: null,
        latency_ms: Date.now() - startedAt,
        error,
      });
    } catch (insertErr) {
      console.error("IA vendedora: falha ao gravar a rodada de erro fora do loop", insertErr);
    }

    return { decision: "erro", dryRun: false, sentMessageIds, error };
  }
}

async function respondToContactUnsafe(
  contactId: string,
  dryRun: boolean,
  startedAt: number,
): Promise<RespondResult> {
  const [contact, transcript, history, opportunity] = await Promise.all([
    fetchGhlContactById(contactId),
    getNegotiationTranscript(contactId),
    loadAiHistory(contactId, startedAt),
    findCurrentOpportunity(contactId),
  ]);

  const base: Omit<AiSellerRunInsert, "decision"> = {
    contact_id: contactId,
    opportunity_id: opportunity?.id ?? null,
    triggered_at: new Date(startedAt).toISOString(),
    escalation_reason: null,
    tool_calls: [],
    sent_message_ids: [],
    model: null,
    usage: null,
    latency_ms: 0,
    error: null,
  };
  const record = async (row: Partial<AiSellerRunInsert> & { decision: RunDecision }) => {
    if (dryRun) return;
    try {
      await insertRun({ ...base, ...row, latency_ms: Date.now() - startedAt });
    } catch (error) {
      console.error("IA vendedora: falha ao gravar a rodada", { contactId, decision: row.decision, error });
    }
  };

  if (!dryRun) {
    const decision = decideRun({
      now: startedAt,
      hasAiTag: (contact.tags ?? []).includes(AI_TAG),
      messages: transcript.messages,
      aiSentMessageIds: history.sentMessageIds,
      aiSendsLastHour: history.sendsLastHour,
      aiFirstRunAt: history.firstRunAt,
    });

    if (decision.kind === "skip") {
      await record({ decision: decision.decision });
      return { decision: decision.decision, dryRun, sentMessageIds: [] };
    }

    if (decision.kind === "human_took_over") {
      await removeContactTags(contactId, [AI_TAG]);
      await createContactNote({
        contactId,
        title: `IA ${personaName()} saiu da conversa`,
        body: "Uma pessoa do time respondeu o cliente depois que a IA assumiu; a IA não responde mais este contato.",
      });
      await record({ decision: "humano_assumiu" });
      return { decision: "humano_assumiu", dryRun, sentMessageIds: [] };
    }

    if (decision.kind === "limit" || !opportunity) {
      const motivo: EscalationReason = decision.kind === "limit" ? "limite_mensagens" : "sem_oportunidade";
      const resumo =
        decision.kind === "limit"
          ? "A IA atingiu o limite de mensagens por hora com este contato (proteção contra loop)."
          : "Nenhuma oportunidade aberta encontrada para o contato.";
      const actions = realActions(contactId, opportunity?.id ?? "");
      const sent = await actions.escalate({ motivo, resumo, mensagemCliente: handoffMessage() });
      await record({
        decision: decision.kind === "limit" ? "pulou:limite" : "erro",
        escalation_reason: motivo,
        sent_message_ids: sent,
        error: decision.kind === "limit" ? null : resumo,
      });
      return { decision: decision.kind === "limit" ? "pulou:limite" : "erro", dryRun, sentMessageIds: sent };
    }
  }

  if (!opportunity) {
    return { decision: "erro", dryRun, sentMessageIds: [], error: "sem oportunidade aberta" };
  }

  const persona = personaName();
  const pipelines = await fetchGhlPipelines();
  const pipeline = pipelines.find((p) => p.id === opportunity.pipelineId) ?? null;
  const stage = pipeline?.stages?.find((s) => s.id === opportunity.pipelineStageId) ?? null;

  const transcriptParts = await buildTranscriptParts(transcript.messages, {
    ownMessageIds: history.sentMessageIds,
    ownLabel: `VOCÊ (${persona})`,
  });
  const contextText = buildContextText({
    today: todayBRDateString(),
    contactName: contact.firstName ?? contact.contactName ?? null,
    pipelineName: pipeline?.name ?? null,
    stageName: stage?.name ?? null,
    crmPares: await getQtyParesForOpportunity(opportunity),
    crmValor: opportunity.monetaryValue,
  });

  const actions = dryRun ? dryRunActions() : realActions(contactId, opportunity.id);
  const result = await runAgentLoop({
    initialInput: [
      { role: "user", content: [{ type: "input_text", text: contextText }, ...transcriptParts] },
    ],
    callModel: makeCallModel(
      buildSellerInstructions({ persona, escalationName: escalationUserName() }),
    ),
    executeTool: (call) => executeTool(call, actions),
    maxSteps: MAX_AGENT_STEPS,
  });

  let decision: RunDecision = result.decision;
  let escalationReason: EscalationReason | null = result.escalationReason;
  const sentMessageIds = [...result.sentMessageIds];

  if (result.decision === "erro") {
    escalationReason = "falha_tecnica";
    try {
      sentMessageIds.push(
        ...(await actions.escalate({
          motivo: "falha_tecnica",
          resumo: result.error ?? "falha técnica sem detalhe",
          mensagemCliente: handoffMessage(),
        })),
      );
    } catch (err) {
      console.error("IA vendedora: falha também ao escalar", err);
    }
    decision = "erro";
  }

  await record({
    decision,
    escalation_reason: escalationReason,
    tool_calls: result.toolCalls,
    sent_message_ids: sentMessageIds,
    model: AI_SELLER_MODEL,
    usage: result.usage,
    error: result.error,
  });

  return { decision, dryRun, sentMessageIds, toolCalls: result.toolCalls, error: result.error };
}
