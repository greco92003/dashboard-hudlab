import type { FunctionTool } from "openai/resources/responses/responses";
import {
  AI_MOVABLE_STAGES,
  LARGE_ORDER_PARES,
  MODEL_ESCALATION_REASONS,
  type AiMovableStage,
  type ModelEscalationReason,
} from "./config";
import {
  hasFreeShipping,
  MIN_PARES,
  roundMoney,
  subtotalForPares,
  unitPriceForPares,
} from "./pricing";
import type { FunctionCall, SellerActions, ToolExecution } from "./types";

function objectSchema(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export const TOOL_DEFINITIONS: FunctionTool[] = [
  {
    type: "function",
    name: "enviar_mensagens",
    description:
      "Envia sua resposta ao cliente no WhatsApp: de 1 a 3 mensagens curtas, em sequência. Encerra a rodada.",
    strict: true,
    parameters: objectSchema({
      mensagens: { type: "array", items: { type: "string" } },
    }),
  },
  {
    type: "function",
    name: "nao_responder",
    description:
      "Encerra a rodada sem enviar nada, quando nenhuma resposta cabe (despedida já encerrada, 'ok' final, mensagem que não era para a Hud Lab, spam).",
    strict: true,
    parameters: objectSchema({ motivo: { type: "string" } }),
  },
  {
    type: "function",
    name: "escalar_para_humano",
    description:
      "Passa o atendimento para uma pessoa do time e encerra a rodada. Obrigatório nos casos listados nas instruções.",
    strict: true,
    parameters: objectSchema({
      motivo: { type: "string", enum: [...MODEL_ESCALATION_REASONS] },
      resumo: {
        type: "string",
        description:
          "Resumo da negociação e do motivo, para a pessoa que vai assumir.",
      },
      mensagem_cliente: {
        type: "string",
        description:
          "Mensagem curta avisando o cliente que alguém do time continua o atendimento por aqui.",
      },
    }),
  },
  {
    type: "function",
    name: "atualizar_orcamento",
    description:
      "Calcula preço (tabela do manual) e frete, grava o orçamento no CRM e devolve os valores. Use sempre que o cliente definir ou mudar a quantidade de pares, ou pedir o valor com frete.",
    strict: true,
    parameters: objectSchema({
      pares: { type: "integer" },
      cep: {
        type: ["string", "null"],
        description: "CEP de entrega, se o cliente informou; null se não.",
      },
    }),
  },
  {
    type: "function",
    name: "solicitar_ajuste_arte",
    description:
      "Manda um pedido de ajuste da arte para o time de design (Fábrica de Mockups, etapa Alteração).",
    strict: true,
    parameters: objectSchema({
      resumo_ajuste: {
        type: "string",
        description: "Tudo o que o cliente pediu para mudar, numa frase clara.",
      },
    }),
  },
  {
    type: "function",
    name: "mover_etapa",
    description:
      "Move a oportunidade para frente no pipeline Atendimento. Nunca volta etapa.",
    strict: true,
    parameters: objectSchema({
      etapa: { type: "string", enum: [...AI_MOVABLE_STAGES] },
    }),
  },
];

export const TERMINAL_TOOLS: ReadonlySet<string> = new Set([
  "enviar_mensagens",
  "nao_responder",
  "escalar_para_humano",
]);

function ok(output: unknown): ToolExecution {
  return { output: JSON.stringify(output), terminal: false, sentMessageIds: [] };
}

function erro(mensagem: string): ToolExecution {
  return ok({ erro: mensagem });
}

function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function executeTool(
  call: FunctionCall,
  actions: SellerActions,
): Promise<ToolExecution> {
  const args = parseArgs(call.arguments);
  if (!args) return erro("argumentos inválidos");

  switch (call.name) {
    case "enviar_mensagens": {
      const mensagens = (Array.isArray(args.mensagens) ? args.mensagens : [])
        .filter((m): m is string => typeof m === "string")
        .map((m) => m.trim())
        .filter(Boolean)
        .slice(0, 3);
      if (mensagens.length === 0) return erro("nenhuma mensagem com texto");
      // A resposta foi escrita sem ver a mensagem nova; a chamada disparada
      // por ela responde tudo junto.
      if (await actions.hasNewClientMessage()) {
        return {
          output: JSON.stringify({ ok: false, motivo: "cliente escreveu de novo" }),
          terminal: true,
          sentMessageIds: [],
          decision: "pulou:mensagem_nova",
        };
      }
      const ids = await actions.sendMessages(mensagens);
      return {
        output: JSON.stringify({ ok: true, enviadas: ids.length }),
        terminal: true,
        sentMessageIds: ids,
        decision: "respondeu",
      };
    }

    case "nao_responder":
      return {
        output: JSON.stringify({ ok: true }),
        terminal: true,
        sentMessageIds: [],
        decision: "nao_respondeu",
      };

    case "escalar_para_humano": {
      const motivo = (MODEL_ESCALATION_REASONS as readonly string[]).includes(
        String(args.motivo),
      )
        ? (args.motivo as ModelEscalationReason)
        : "outro";
      const ids = await actions.escalate({
        motivo,
        resumo: String(args.resumo ?? ""),
        mensagemCliente: String(args.mensagem_cliente ?? ""),
      });
      return {
        output: JSON.stringify({ ok: true }),
        terminal: true,
        sentMessageIds: ids,
        decision: "escalou",
        escalationReason: motivo,
      };
    }

    case "atualizar_orcamento": {
      const pares = Number(args.pares);
      if (!Number.isInteger(pares)) return erro("pares precisa ser um número inteiro");
      if (pares >= LARGE_ORDER_PARES) {
        return ok({
          erro: "pedido_grande",
          instrucao: `Pedidos de ${LARGE_ORDER_PARES} pares ou mais vão para uma pessoa do time: use escalar_para_humano com motivo pedido_grande.`,
        });
      }
      const unitario = unitPriceForPares(pares);
      const subtotal = subtotalForPares(pares);
      if (unitario == null || subtotal == null) {
        return ok({ erro: "abaixo_do_minimo", minimo: MIN_PARES });
      }
      const cep = typeof args.cep === "string" && args.cep.trim() ? args.cep.trim() : null;
      const freteGratis = hasFreeShipping(pares);
      const frete = freteGratis
        ? 0
        : cep
          ? await actions.quoteFreight({ cep, pares, valorNf: subtotal })
          : null;
      await actions.writeBudget({ pares, unitario, subtotal, frete });
      return ok({
        pares,
        valor_unitario: unitario,
        subtotal,
        frete,
        frete_gratis: freteGratis,
        total: frete == null ? null : roundMoney(subtotal + frete),
        observacao:
          frete == null
            ? cep
              ? "Não foi possível cotar o frete para esse CEP; diga que vai confirmar o valor do frete."
              : "Frete ainda não calculado: peça o CEP de entrega."
            : null,
      });
    }

    case "solicitar_ajuste_arte": {
      const resumo = String(args.resumo_ajuste ?? "").trim();
      if (!resumo) return erro("resumo_ajuste vazio");
      const status = await actions.requestArtChange(resumo);
      return ok({
        status,
        instrucao:
          "Avise o cliente que o time de design faz o ajuste em até 24h úteis e que a nova arte chega por aqui.",
      });
    }

    case "mover_etapa": {
      const etapa = String(args.etapa);
      if (!(AI_MOVABLE_STAGES as readonly string[]).includes(etapa)) {
        return erro(`etapa não permitida: ${etapa}`);
      }
      const status = await actions.moveStage(etapa as AiMovableStage);
      return ok({ status });
    }

    default:
      return erro(`ferramenta desconhecida: ${call.name}`);
  }
}
