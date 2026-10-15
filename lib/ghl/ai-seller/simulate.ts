import "server-only";

import { buildTranscriptParts } from "@/lib/ghl/sales-agent/agent";
import { MAX_AGENT_STEPS, personaName } from "./config";
import { escalationAvailability } from "./hours";
import { runAgentLoop } from "./loop";
import { buildContextText, buildSellerInstructions } from "./prompt";
import { MAX_REFERENCES_PER_TEST, simulatedArtChangeStatus, validateRuleText } from "./rules-shape";
import { getReferences, listReferences, loadActiveRules, RuleError, type Reference } from "./rules";
import { dryRunActions, makeCallModel } from "./run";
import { loadSellerSettings, type SellerSettings } from "./settings";
import { executeTool } from "./tools";
import { trimForSeller } from "./transcript";

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
 * A Cami responde a uma referência guardada, em modo de teste: nada é
 * enviado nem gravado (só a cotação de frete é consultada de verdade).
 * Responde "no dia" da foto, para datas e prazos fazerem sentido.
 */
export async function simulateReply(
  reference: Reference,
  rules: readonly string[],
  settings: SellerSettings,
): Promise<SimulatedReply> {
  const persona = personaName();
  const at = Date.parse(reference.context.at);
  const availability = escalationAvailability(at, settings.shifts);
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
  });

  const artChange = simulatedArtChangeStatus(reference.context.stageName);
  const actions = { ...dryRunActions(), requestArtChange: async () => artChange };
  const result = await runAgentLoop({
    initialInput: [{ role: "user", content: [{ type: "input_text", text: contextText }, ...transcriptParts] }],
    callModel: makeCallModel(buildSellerInstructions({ persona, escalationName: settings.escalationName, rules })),
    executeTool: (call) => executeTool(call, actions),
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

export interface RuleTestItem {
  referenceId: string;
  nome: string;
  boaResposta: string | null;
  /** Última mensagem do cliente: a que a Cami responde. */
  cliente: string;
  atual: SimulatedReply;
  comRegra: SimulatedReply;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const failed = (err: unknown): SimulatedReply => ({
  decisao: "erro",
  mensagens: [],
  motivo: null,
  ferramentas: [],
  tokens: 0,
  erro: err instanceof Error ? err.message : String(err),
});

/**
 * "Testar antes de ligar": cada referência respondida duas vezes, com as
 * regras ligadas hoje e com a regra candidata. Editando uma regra que já está
 * ligada, `replaceRuleText` é o texto atual dela (sai do "com a regra").
 */
export async function testRule(input: {
  texto: unknown;
  referenceIds?: string[];
  replaceRuleText?: string | null;
}): Promise<RuleTestItem[]> {
  const valid = validateRuleText(input.texto);
  if (!valid.ok) throw new RuleError(valid.error);

  const [current, settings, references] = await Promise.all([
    loadActiveRules(),
    loadSellerSettings(),
    input.referenceIds?.length ? getReferences(input.referenceIds) : listReferences(),
  ]);
  if (references.length === 0) {
    throw new RuleError("Guarde pelo menos uma conversa de referência para testar a regra");
  }
  const chosen = references.slice(0, MAX_REFERENCES_PER_TEST);
  const withRule = [...current.filter((r) => r !== input.replaceRuleText), valid.texto];

  return mapWithConcurrency(chosen, 3, async (reference) => {
    const [atual, comRegra] = await Promise.all([
      simulateReply(reference, current, settings).catch(failed),
      simulateReply(reference, withRule, settings).catch(failed),
    ]);
    const lastClient = [...reference.messages].reverse().find((m) => m.direction === "inbound");
    return {
      referenceId: reference.id,
      nome: reference.nome,
      boaResposta: reference.boaResposta,
      cliente: lastClient?.body || "(mensagem sem texto)",
      atual,
      comRegra,
    };
  });
}
