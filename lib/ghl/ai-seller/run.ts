import "server-only";

import OpenAI from "openai";
import type {
  ResponseFunctionToolCall,
  ResponseInput,
} from "openai/resources/responses/responses";
import { fetchGhlContactById, fetchGhlPipelines } from "@/lib/ghl/api";
import {
  findPhoneConversationId,
  getNegotiationTranscript,
  getQtyParesForOpportunity,
} from "@/lib/ghl/negotiation-conversations";
import { createContactNote } from "@/lib/ghl/mockup-instructions/ghl-client";
import {
  buildTranscriptParts,
  todayBRDateString,
} from "@/lib/ghl/sales-agent/agent";
import {
  AGENT_DEADLINE_MS,
  AI_ESCALATED_TAG,
  AI_SELLER_MODEL,
  AI_TAG,
  CLIENT_PAUSE_MS,
  escalationUserId,
  LOCK_RETRY_MS,
  LOCK_WAIT_MS,
  MAX_AGENT_STEPS,
  MODEL_CALL_TIMEOUT_MS,
  personaName,
} from "./config";
import { decideRun, hasUnseenInbound, mustEscalateSwallowedCall } from "./decide";
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
import { notifyHandoffNow } from "./alerts-send";
import { escalationAvailability } from "./hours";
import { isImageTooLargeError, withLowDetailImages } from "./images";
import { findCurrentOpportunity } from "./opportunity";
import { loadActiveRules } from "./rules";
import { runAgentLoop, type CallModel, type LoopResult } from "./loop";
import { buildContextText, buildSellerInstructions } from "./prompt";
import {
  acquireRunLock,
  finishRun,
  hasRecentEscalation,
  hasSwallowedCallSince,
  insertHandoff,
  insertRun,
  loadAiHistory,
  type AiSellerRunInsert,
} from "./runs-store";
import { loadSellerSettings, type SellerSettings } from "./settings";
import { executeTool, TOOL_DEFINITIONS } from "./tools";
import { trimForSeller } from "./transcript";
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
  usage?: LoopResult["usage"];
  error?: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Espera o cliente parar de escrever: retrato das mensagens recentes, pausa de
 * CLIENT_PAUSE_MS, e de novo. Mensagem nova do cliente no meio = esta chamada
 * desiste, porque a chamada da mensagem nova responde tudo. Sem conseguir ler
 * a conversa, segue: resposta é melhor que silêncio.
 */
async function clientKeptWriting(contactId: string): Promise<boolean> {
  let conversationId: string | null = null;
  let seen: Set<string> | null = null;
  try {
    conversationId = await findPhoneConversationId(contactId);
    if (conversationId) {
      seen = new Set((await fetchRecentWhatsAppMessages(conversationId)).map((m) => m.id));
    }
  } catch (err) {
    console.error("IA vendedora: falha ao ler a conversa antes da espera", { contactId, err });
  }
  await sleep(CLIENT_PAUSE_MS);
  if (!conversationId || !seen) return false;
  try {
    return hasUnseenInbound(await fetchRecentWhatsAppMessages(conversationId), seen);
  } catch (err) {
    console.error("IA vendedora: falha ao reler a conversa depois da espera", { contactId, err });
    return false;
  }
}

/**
 * Trava por contato, esperando a rodada anterior terminar: o cliente que
 * escreve enquanto a Cami pensa ganha resposta da chamada seguinte, em vez de
 * a chamada desistir e a conversa ir para humano. Devolve o id da trava e o
 * início da rodada, ou null se a outra rodada passou de LOCK_WAIT_MS.
 */
async function acquireRunLockWaiting(
  contactId: string,
): Promise<{ runId: string; startedAt: number } | null> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const startedAt = Date.now();
    const runId = await acquireRunLock(contactId, startedAt);
    if (runId) return { runId, startedAt };
    if (Date.now() + LOCK_RETRY_MS > deadline) return null;
    await sleep(LOCK_RETRY_MS);
  }
}

/**
 * Aviso de passagem quando a IA não escreveu o seu (fallbacks): diz quando a
 * pessoa volta, fora do horário. Sem pronome: o Controle pode apontar as
 * passagens para qualquer pessoa do time.
 */
function handoffMessage(settings: SellerSettings): string {
  const name = settings.escalationName;
  const { available, returnsAt } = escalationAvailability(Date.now(), settings.shifts);
  if (available || !returnsAt) {
    return `Vou pedir pra ${name} continuar seu atendimento por aqui, tá bom? 😊`;
  }
  return `Vou pedir pra ${name} continuar seu atendimento por aqui, com retorno ${returnsAt}, tá bom? 😊`;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export { findCurrentOpportunity };

interface RunContext {
  contactId: string;
  startedAt: number;
  /** Linha da trava; null se a trava não foi obtida (a gravação vira insert). */
  runId: string | null;
  /** Chegada do webhook. */
  receivedAt: number;
  /** Primeira mensagem enviada ao cliente nesta rodada. */
  repliedAt: number | null;
  settings: SellerSettings;
  /** Primeiro nome do cliente, para o aviso de passagem (lido no início da rodada). */
  contactName: string | null;
}

/** Quem recebe as passagens: o do Controle, senão a variável de ambiente. */
function escalationTarget(settings: SellerSettings): string {
  return settings.escalationUserId ?? escalationUserId();
}

/**
 * Registro da passagem para a CAMI Intelligence e aviso a quem recebe: na
 * hora, se está no turno; senão o cron avisa no início do turno seguinte.
 * Falha não interrompe a passagem.
 */
async function recordHandoff(ctx: RunContext, row: Parameters<typeof insertHandoff>[0]): Promise<void> {
  let id: string;
  try {
    id = await insertHandoff(row);
  } catch (err) {
    console.error("IA vendedora: passagem não registrada", { contactId: row.contact_id, err });
    return;
  }
  if (escalationAvailability(Date.now(), ctx.settings.shifts).available) {
    await notifyHandoffNow({ id, ...row }, ctx.contactName);
  }
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
    received_at: new Date(ctx.receivedAt).toISOString(),
    replied_at: ctx.repliedAt == null ? null : new Date(ctx.repliedAt).toISOString(),
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
  ctx: RunContext,
  opportunityId: string,
  snapshot?: { conversationId: string | null; seenMessageIds: ReadonlySet<string> },
): SellerActions {
  const { contactId, settings } = ctx;
  const persona = personaName();
  const send = async (message: string) => {
    const id = await sendWhatsAppMessage(contactId, message);
    ctx.repliedAt ??= Date.now();
    return id;
  };
  return {
    async sendMessages(messages) {
      const ids: string[] = [];
      for (const [index, message] of messages.entries()) {
        if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
        ids.push(await send(message));
      }
      return ids;
    },
    async escalate({ motivo, resumo, mensagemCliente }) {
      const ids: string[] = [];
      const text = mensagemCliente.trim() || handoffMessage(settings);
      try {
        ids.push(await send(text));
      } catch (err) {
        console.error("IA vendedora: falha ao avisar o cliente na passagem", err);
      }
      const toUserId = escalationTarget(settings);
      await removeContactTags(contactId, [AI_TAG]);
      await addContactTags(contactId, [AI_ESCALATED_TAG]);
      await assignContact(contactId, toUserId);
      await createContactNote({
        contactId,
        title: `IA ${persona} passou o atendimento — ${motivo}`,
        body: `Motivo: ${motivo}\n\n${resumo}`,
      });
      await recordHandoff(ctx, {
        contact_id: contactId,
        opportunity_id: opportunityId || null,
        motivo,
        resumo,
        to_user_id: toUserId,
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
export function dryRunActions(): SellerActions {
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

export function makeCallModel(instructions: string): CallModel {
  const create = (input: unknown[]) =>
    openai.responses.create({
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
  return async (input) => {
    let response: Awaited<ReturnType<typeof create>>;
    try {
      response = await create(input);
    } catch (err) {
      // Imagem grande demais para o modelo: refaz com as imagens em baixa resolução (ver images.ts).
      const lowered = isImageTooLargeError(err) ? withLowDetailImages(input) : null;
      if (!lowered) throw err;
      console.warn("IA vendedora: imagem grande demais; refazendo em baixa resolução", describe(err));
      response = await create(lowered);
    }
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
  options: { dryRun?: boolean; receivedAt?: number } = {},
): Promise<RespondResult> {
  const dryRun = options.dryRun === true;
  const receivedAt = options.receivedAt ?? Date.now();
  const ctx: RunContext = {
    contactId,
    startedAt: receivedAt,
    runId: null,
    receivedAt,
    repliedAt: null,
    settings: await loadSellerSettings(),
    contactName: null,
  };

  try {
    if (!dryRun) {
      if (await clientKeptWriting(contactId)) {
        await saveRun(ctx, { decision: "pulou:aguardando_cliente" });
        return { decision: "pulou:aguardando_cliente", dryRun, sentMessageIds: [] };
      }
      const lock = await acquireRunLockWaiting(contactId);
      if (!lock) {
        ctx.startedAt = Date.now();
        await saveRun(ctx, { decision: "pulou:em_andamento" });
        return { decision: "pulou:em_andamento", dryRun, sentMessageIds: [] };
      }
      // A rodada começa quando lê a conversa (depois da espera): é o que
      // decideRun compara com a última mensagem do cliente.
      ctx.runId = lock.runId;
      ctx.startedAt = lock.startedAt;
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
        sentMessageIds = await realActions(ctx, "").escalate({
          motivo: "falha_tecnica",
          resumo: error,
          mensagemCliente: handoffMessage(ctx.settings),
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

  ctx.contactName = contact.firstName ?? contact.contactName ?? null;
  const lastClientMessage = [...transcript.messages].reverse().find((m) => m.direction === "inbound");
  const record = async (row: Partial<AiSellerRunInsert> & { decision: RunDecision }) => {
    if (dryRun) return;
    await saveRun(ctx, {
      opportunity_id: opportunity?.id ?? null,
      client_message_at: lastClientMessage?.dateAdded ?? null,
      ...row,
    });
  };
  const { settings } = ctx;

  if (!dryRun) {
    const decision = decideRun({
      now: startedAt,
      hasAiTag: (contact.tags ?? []).includes(AI_TAG),
      messages: transcript.messages,
      aiSentMessageIds: history.sentMessageIds,
      aiSentAtRunStart: history.sentAtRunStart,
      aiSendsLastHour: history.sendsLastHour,
      aiRepliesLastHour: history.repliesLastHour,
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

    // Desligada pelo Controle: o cliente vai para humano sem mensagem da IA.
    if (settings.estado === "desligada") {
      const toUserId = escalationTarget(settings);
      await removeContactTags(contactId, [AI_TAG]);
      await addContactTags(contactId, [AI_ESCALATED_TAG]);
      await assignContact(contactId, toUserId);
      await createContactNote({
        contactId,
        title: `IA ${personaName()} desligada`,
        body: "A IA foi desligada no Controle da CAMI Intelligence; o cliente escreveu e ficou com o time, sem mensagem da IA.",
      });
      await recordHandoff(ctx, {
        contact_id: contactId,
        opportunity_id: opportunity?.id ?? null,
        motivo: "cami_desligada",
        resumo: null,
        to_user_id: toUserId,
      });
      await record({ decision: "pulou:desligada", escalation_reason: "cami_desligada" });
      return { decision: "pulou:desligada", dryRun, sentMessageIds: [] };
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
        sent = await realActions(ctx, opportunity?.id ?? "").escalate({
          motivo,
          resumo,
          mensagemCliente: handoffMessage(settings),
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

  const availability = escalationAvailability(Date.now(), settings.shifts);
  const trimmed = trimForSeller(transcript.messages);
  const transcriptParts = await buildTranscriptParts(trimmed.messages, {
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
    omittedAutomated: trimmed.omittedAutomated,
    nowLabel: availability.nowLabel,
    escalation: {
      name: settings.escalationName,
      available: availability.available,
      returnsAt: availability.returnsAt,
    },
  });

  const actions = dryRun
    ? dryRunActions()
    : realActions(ctx, opportunity.id, {
        conversationId: transcript.conversationId,
        seenMessageIds: new Set(transcript.messages.map((m) => m.id)),
      });
  const result = await runAgentLoop({
    initialInput: [
      { role: "user", content: [{ type: "input_text", text: contextText }, ...transcriptParts] },
    ],
    callModel: makeCallModel(
      buildSellerInstructions({ persona, escalationName: settings.escalationName, rules: await loadActiveRules() }),
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
          mensagemCliente: handoffMessage(settings),
        })),
      );
    } catch (err) {
      console.error("IA vendedora: falha também ao escalar", err);
    }
    decision = "erro";
  }

  // Webhook da mensagem nova engolido pela trava durante esta rodada não volta:
  // se o cliente escreveu algo que esta rodada não respondeu, escala.
  if (!dryRun && (decision === "pulou:mensagem_nova" || decision === "nao_respondeu")) {
    try {
      const swallowedCall = await hasSwallowedCallSince(contactId, startedAt);
      const unseenInbound =
        swallowedCall && decision === "nao_respondeu" ? await actions.hasNewClientMessage() : true;
      if (mustEscalateSwallowedCall({ decision, swallowedCall, hasUnseenInbound: unseenInbound })) {
        sentMessageIds.push(
          ...(await actions.escalate({
            motivo: "falha_tecnica",
            resumo:
              "O cliente escreveu enquanto a IA ainda processava a rodada anterior e a mensagem nova ficou sem resposta.",
            mensagemCliente: handoffMessage(settings),
          })),
        );
        decision = "escalou";
        escalationReason = "falha_tecnica";
      }
    } catch (err) {
      console.error("IA vendedora: falha ao cobrir chamada engolida pela trava", { contactId, err });
    }
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

  return {
    decision,
    dryRun,
    sentMessageIds,
    toolCalls: result.toolCalls,
    usage: result.usage,
    error: result.error,
  };
}
