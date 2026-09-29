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
import { isGhlWonDeal } from "@/lib/ghl/pipelines";
import {
  buildTranscriptParts,
  todayBRDateString,
} from "@/lib/ghl/sales-agent/agent";
import {
  AGENT_DEADLINE_MS,
  AI_ESCALATED_TAG,
  AI_SELLER_MODEL,
  AI_TAG,
  escalationUserId,
  escalationUserName,
  MAX_AGENT_STEPS,
  MODEL_CALL_TIMEOUT_MS,
  personaName,
} from "./config";
import { decideRun, hasUnseenInbound } from "./decide";
import {
  addContactTags,
  assignContact,
  fetchRecentWhatsAppMessages,
  moveOpportunityForward,
  moveOpportunityToArtChange,
  quoteFreightForPares,
  removeContactTags,
  sendWhatsAppMessage,
  writeBudgetChain,
} from "./ghl-actions";
import { runAgentLoop, type CallModel, type LoopResult } from "./loop";
import { buildContextText, buildSellerInstructions } from "./prompt";
import {
  acquireRunLock,
  finishRun,
  hasRecentEscalation,
  insertRun,
  loadAiHistory,
  type AiSellerRunInsert,
} from "./runs-store";
import { executeTool, TOOL_DEFINITIONS } from "./tools";
import type { EscalationReason, RunDecision, SellerActions } from "./types";

// Cliente próprio: timeout curto e sem retentativa do SDK (o loop repete uma
// vez), para a rodada caber no tempo do webhook e ainda sobrar para escalar.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
  timeout: MODEL_CALL_TIMEOUT_MS,
  maxRetries: 0,
});

/** Escalonamento registrado há menos que isso: o fallback não escala de novo. */
const RECENT_ESCALATION_MS = 10 * 60 * 1000;

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

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function findCurrentOpportunity(contactId: string): Promise<GhlOpportunity | null> {
  const opportunities = await searchGhlOpportunitiesByContact(contactId);
  const open = opportunities.filter(
    (o) =>
      (o.status ?? "open") === "open" &&
      // Venda fechada (ex.: na Serigrafia) não é negociação da IA.
      !isGhlWonDeal(o.pipelineId, o.pipelineStageId, o.status, o.monetaryValue),
  );
  open.sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
  return open[0] ?? null;
}

interface RunContext {
  contactId: string;
  startedAt: number;
  /** Linha da trava; null se a trava não foi obtida (a gravação vira insert). */
  runId: string | null;
}

/**
 * Gravação final da rodada, com uma segunda tentativa: sem os ids enviados, a
 * próxima rodada não sabe que a IA já respondeu. Nunca lança.
 */
async function saveRun(
  ctx: RunContext,
  row: Partial<AiSellerRunInsert> & { decision: RunDecision },
): Promise<void> {
  const full: AiSellerRunInsert = {
    contact_id: ctx.contactId,
    opportunity_id: null,
    triggered_at: new Date(ctx.startedAt).toISOString(),
    escalation_reason: null,
    tool_calls: [],
    sent_message_ids: [],
    model: null,
    usage: null,
    error: null,
    ...row,
    latency_ms: Date.now() - ctx.startedAt,
  };
  const write = () => {
    if (!ctx.runId) return insertRun(full);
    const { contact_id: _contact, triggered_at: _triggered, ...update } = full;
    return finishRun(ctx.runId, update);
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await write();
      return;
    } catch (error) {
      console.error("IA vendedora: falha ao gravar a rodada", {
        contactId: ctx.contactId,
        decision: row.decision,
        attempt,
        error,
      });
    }
  }
}

function realActions(
  contactId: string,
  opportunityId: string,
  snapshot?: { conversationId: string | null; seenMessageIds: ReadonlySet<string> },
): SellerActions {
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
    async hasNewClientMessage() {
      if (!snapshot?.conversationId) return false;
      try {
        const recent = await fetchRecentWhatsAppMessages(snapshot.conversationId);
        return hasUnseenInbound(recent, snapshot.seenMessageIds);
      } catch (err) {
        // Sem conseguir reler, envia: resposta possivelmente defasada é melhor
        // que cliente sem resposta, e a rodada da mensagem nova ainda responde.
        console.error("IA vendedora: falha ao reler a conversa antes do envio", err);
        return false;
      }
    },
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
    async hasNewClientMessage() {
      return false;
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
 * Ponto de entrada público. Numa rodada real, a primeira coisa é a trava por
 * contato (uma rodada por vez; a segunda chamada de uma rajada pula) e toda
 * saída grava o fim na linha da trava.
 *
 * "O cliente nunca fica sem resposta em silêncio": falha lançada fora do loop
 * do agente cai no catch e, se der para confirmar que o contato ainda é da IA
 * e não foi escalado há pouco, escala para humano; senão só registra o erro.
 */
export async function respondToContact(
  contactId: string,
  options: { dryRun?: boolean } = {},
): Promise<RespondResult> {
  const dryRun = options.dryRun === true;
  const ctx: RunContext = { contactId, startedAt: Date.now(), runId: null };

  try {
    if (!dryRun) {
      ctx.runId = await acquireRunLock(contactId, ctx.startedAt);
      if (!ctx.runId) {
        await saveRun(ctx, { decision: "pulou:em_andamento" });
        return { decision: "pulou:em_andamento", dryRun, sentMessageIds: [] };
      }
    }
    return await respondToContactUnsafe(ctx, dryRun);
  } catch (err) {
    if (dryRun) throw err;

    const error = describe(err);
    console.error("IA vendedora: falha fora do loop do agente", { contactId, error });

    let isStillAi = false;
    try {
      const [contact, recentlyEscalated] = await Promise.all([
        fetchGhlContactById(contactId),
        hasRecentEscalation(contactId, Date.now() - RECENT_ESCALATION_MS),
      ]);
      isStillAi = (contact.tags ?? []).includes(AI_TAG) && !recentlyEscalated;
      if (!isStillAi) {
        console.warn("IA vendedora: fallback não escala (contato fora da IA ou escalado há pouco)", { contactId });
      }
    } catch (checkErr) {
      console.error("IA vendedora: fallback não confirmou que o contato é da IA; não escala", checkErr);
    }

    let sentMessageIds: string[] = [];
    if (isStillAi) {
      try {
        sentMessageIds = await realActions(contactId, "").escalate({
          motivo: "falha_tecnica",
          resumo: error,
          mensagemCliente: handoffMessage(),
        });
      } catch (escalateErr) {
        console.error("IA vendedora: falha também ao escalar fora do loop", escalateErr);
      }
    }

    await saveRun(ctx, {
      decision: "erro",
      escalation_reason: isStillAi ? "falha_tecnica" : null,
      sent_message_ids: sentMessageIds,
      error,
    });

    return { decision: "erro", dryRun: false, sentMessageIds, error };
  }
}

async function respondToContactUnsafe(
  ctx: RunContext,
  dryRun: boolean,
): Promise<RespondResult> {
  const { contactId, startedAt } = ctx;
  const [contact, transcript, history, opportunity] = await Promise.all([
    fetchGhlContactById(contactId),
    getNegotiationTranscript(contactId),
    loadAiHistory(contactId, startedAt),
    findCurrentOpportunity(contactId),
  ]);

  const record = async (row: Partial<AiSellerRunInsert> & { decision: RunDecision }) => {
    if (dryRun) return;
    await saveRun(ctx, { opportunity_id: opportunity?.id ?? null, ...row });
  };

  if (!dryRun) {
    const decision = decideRun({
      now: startedAt,
      hasAiTag: (contact.tags ?? []).includes(AI_TAG),
      messages: transcript.messages,
      aiSentMessageIds: history.sentMessageIds,
      aiSentAtRunStart: history.sentAtRunStart,
      aiSendsLastHour: history.sendsLastHour,
      aiSessionStartedAt: history.sessionStartedAt,
    });

    if (decision.kind === "skip") {
      await record({ decision: decision.decision });
      return { decision: decision.decision, dryRun, sentMessageIds: [] };
    }

    // Humano = saída com userId (ver isHumanSellerMessage); saída sem userId não
    // chega aqui, então não há caso de "humano" duvidoso a escalar.
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
      const finalDecision: RunDecision = decision.kind === "limit" ? "pulou:limite" : "erro";
      // try próprio: se cair no catch externo, o fallback escalaria de novo.
      let sent: string[] = [];
      let escalateError: string | null = null;
      try {
        sent = await realActions(contactId, opportunity?.id ?? "").escalate({
          motivo,
          resumo,
          mensagemCliente: handoffMessage(),
        });
      } catch (err) {
        escalateError = `falha ao escalar: ${describe(err)}`;
        console.error("IA vendedora: falha ao escalar", { contactId, motivo, err });
      }
      const errors = [decision.kind === "limit" ? null : resumo, escalateError].filter(Boolean);
      await record({
        decision: finalDecision,
        escalation_reason: motivo,
        sent_message_ids: sent,
        error: errors.length ? errors.join(" | ") : null,
      });
      return { decision: finalDecision, dryRun, sentMessageIds: sent };
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

  const actions = dryRun
    ? dryRunActions()
    : realActions(contactId, opportunity.id, {
        conversationId: transcript.conversationId,
        seenMessageIds: new Set(transcript.messages.map((m) => m.id)),
      });
  const result = await runAgentLoop({
    initialInput: [
      { role: "user", content: [{ type: "input_text", text: contextText }, ...transcriptParts] },
    ],
    callModel: makeCallModel(
      buildSellerInstructions({ persona, escalationName: escalationUserName() }),
    ),
    executeTool: (call) => executeTool(call, actions),
    maxSteps: MAX_AGENT_STEPS,
    deadlineMs: startedAt + AGENT_DEADLINE_MS,
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
