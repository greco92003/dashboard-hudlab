import "server-only";

import { buildTranscriptParts } from "@/lib/ghl/sales-agent/agent";
import { simulatedArtChangeStatus, type Reference } from "./annex-shape";
import { MAX_AGENT_STEPS, personaName } from "./config";
import { escalationAvailability } from "./hours";
import { runAgentLoop } from "./loop";
import { buildContextText, buildSellerInstructions } from "./prompt";
import { dryRunActions, makeCallModel } from "./run";
import type { SellerSettings } from "./settings";
import { executeTool } from "./tools";
import { trimForSeller } from "./transcript";
import { avisosAtivos, contextoVigentes, promocaoAtiva } from "./vigentes";

// Sem trava de tempo do webhook: aqui ninguém espera resposta no WhatsApp.
const SIMULATION_DEADLINE_MS = 110_000;

export interface SimulatedReply {
  /** respondeu / nao_respondeu / escalou / erro */
  decisao: string;
  mensagens: string[];
  /** Motivo de não responder ou de passar para humano. */
  motivo: string | null;
  ferramentas: string[];
  tokens: number;
  erro: string | null;
}

const BR_DATE = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * A Cami responde a uma foto de conversa, em modo de teste: nada é enviado
 * nem gravado (só a cotação de frete é consultada de verdade). Responde "no
 * dia" da foto, para datas e prazos fazerem sentido, e o pedido de ajuste de
 * arte responde como em produção pela etapa da foto.
 */
export async function simulateReply(
  reference: Reference,
  anexo: readonly string[],
  settings: SellerSettings,
): Promise<SimulatedReply> {
  const persona = personaName();
  const at = Date.parse(reference.context.at);
  const availability = escalationAvailability(at, settings.shifts);
  // A simulação vale para hoje: usa a promoção e os avisos vigentes agora.
  const promocao = promocaoAtiva(settings.promocao, Date.now());
  const trimmed = trimForSeller(reference.messages);
  const transcriptParts = await buildTranscriptParts(trimmed.messages, {
    ownMessageIds: new Set(reference.messages.filter((m) => m.own).map((m) => m.id)),
    ownLabel: `VOCÊ (${persona})`,
  });
  const contextText = buildContextText({
    today: BR_DATE(reference.context.at),
    contactName: reference.context.contactName,
    pipelineName: reference.context.pipelineName,
    stageName: reference.context.stageName,
    crmPares: reference.context.crmPares,
    crmValor: reference.context.crmValor,
    omittedAutomated: trimmed.omittedAutomated,
    nowLabel: availability.nowLabel,
    escalation: { name: settings.escalationName, available: availability.available, returnsAt: availability.returnsAt },
    vigentes: contextoVigentes(promocao, avisosAtivos(settings.avisos, Date.now())),
  });

  const artChange = simulatedArtChangeStatus(reference.context.stageName);
  const actions = { ...dryRunActions(), requestArtChange: async () => artChange };
  const result = await runAgentLoop({
    initialInput: [{ role: "user", content: [{ type: "input_text", text: contextText }, ...transcriptParts] }],
    callModel: makeCallModel(buildSellerInstructions({ persona, escalationName: settings.escalationName, anexo })),
    executeTool: (call) => executeTool(call, actions, { promocao }),
    maxSteps: MAX_AGENT_STEPS,
    deadlineMs: Date.now() + SIMULATION_DEADLINE_MS,
  });

  const final = [...result.toolCalls].reverse().find((c) =>
    ["enviar_mensagens", "nao_responder", "escalar_para_humano"].includes(c.name),
  );
  const args = final ? parseArgs(final.arguments) : {};
  let mensagens: string[] = [];
  let motivo: string | null = null;
  if (final?.name === "enviar_mensagens") {
    mensagens = Array.isArray(args.mensagens) ? (args.mensagens as unknown[]).map(String) : [];
  } else if (final?.name === "escalar_para_humano") {
    mensagens = typeof args.mensagem_cliente === "string" && args.mensagem_cliente ? [args.mensagem_cliente] : [];
    motivo = [args.motivo, args.resumo].filter(Boolean).join(": ") || null;
  } else if (final?.name === "nao_responder") {
    motivo = typeof args.motivo === "string" ? args.motivo : null;
  }
  return {
    decisao: result.decision,
    mensagens,
    motivo,
    ferramentas: result.toolCalls.map((c) => c.name).filter((n) => n !== final?.name),
    tokens: result.usage.input_tokens + result.usage.output_tokens,
    erro: result.error,
  };
}
