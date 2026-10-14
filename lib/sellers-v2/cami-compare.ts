import "server-only";

import OpenAI from "openai";
import type { AuditorResult } from "@/lib/ghl/sales-agent/agent";
import { loadActiveRules, type Reference } from "@/lib/ghl/ai-seller/rules";
import type { SnapshotMessage } from "@/lib/ghl/ai-seller/rules-shape";
import { loadSellerSettings } from "@/lib/ghl/ai-seller/settings";
import { simulateReply } from "@/lib/ghl/ai-seller/simulate";
import type { Mission } from "./missions";
import { pickTurnForComparison, type TrainingTurn } from "./cami-compare-shape";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
const PICK_MODEL = "gpt-5.6-terra";

export interface CamiComparison {
  /** Mensagem do cliente que os dois responderam. */
  cliente: string;
  vendedor: string;
  cami: { decisao: string; mensagens: string[]; motivo: string | null };
  /** Por que esse momento foi escolhido (do avaliador). */
  porque: string | null;
  erro?: string;
}

/**
 * Qual resposta do vendedor custou mais pontos? Pergunta curta à IA com a
 * conversa numerada e as falhas da avaliação. Sem resposta válida, fica a
 * primeira resposta do vendedor depois de uma objeção (a última do cliente).
 */
async function pickWeakestSellerTurn(
  turns: TrainingTurn[],
  evaluation: AuditorResult,
): Promise<{ indice: number; porque: string | null }> {
  const sellerIdx = turns.map((t, i) => (t.role === "user" ? i : -1)).filter((i) => i > 0);
  const fallback = { indice: sellerIdx[sellerIdx.length - 1] ?? -1, porque: null };
  try {
    const numbered = turns
      .map((t, i) => `[${i}] ${t.role === "user" ? "VENDEDOR" : "CLIENTE"}: ${t.content}`)
      .join("\n");
    const falhas = (evaluation.report.falhas ?? []).join("\n- ");
    const response = await openai.responses.create({
      model: PICK_MODEL,
      instructions:
        "Você revisa um treino de vendas. Escolha a ÚNICA mensagem do VENDEDOR que mais custou pontos, considerando as falhas apontadas. Responda só com o número dela e uma frase curta do porquê.",
      input: `Conversa:\n${numbered}\n\nFalhas da avaliação:\n- ${falhas || "(nenhuma listada)"}`,
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "turno",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: { indice: { type: "integer" }, porque: { type: "string" } },
            required: ["indice", "porque"],
          },
        },
      },
      max_output_tokens: 400,
      store: false,
    });
    const parsed = JSON.parse(response.output_text) as { indice: number; porque: string };
    return sellerIdx.includes(parsed.indice) ? { indice: parsed.indice, porque: parsed.porque || null } : fallback;
  } catch (err) {
    console.error("Você × Cami: escolha do turno falhou; usando a última resposta", err);
    return fallback;
  }
}

/**
 * "Você × Cami": no momento em que o vendedor perdeu mais pontos, o que a Cami
 * responderia à mesma mensagem do cliente. Modo de teste: nada é enviado.
 */
export async function compareWithCami(
  transcript: TrainingTurn[],
  evaluation: AuditorResult,
  mission: Mission | null,
): Promise<CamiComparison | { erro: string }> {
  const picked = await pickWeakestSellerTurn(transcript, evaluation);
  const cut = pickTurnForComparison(transcript, picked.indice);
  if (!cut) return { erro: "A conversa não teve resposta do vendedor para comparar." };

  const messages: SnapshotMessage[] = cut.history.map((t, i) => ({
    id: t.id ?? `treino-${i}`,
    direction: t.role === "assistant" ? "inbound" : "outbound",
    body: t.content,
    dateAdded: t.timestamp ?? new Date().toISOString(),
    // Fala do vendedor do treino conta como alguém do time (VENDEDOR), não como a Cami.
    userId: t.role === "user" ? "vendedor-treino" : null,
    attachments: [],
    isAutomated: false,
    own: false,
  }));
  const reference: Reference = {
    id: "treino",
    nome: mission?.titulo ?? "Treino",
    boaResposta: null,
    contactId: "treino",
    messages,
    context: {
      contactName: null,
      pipelineName: "Atendimento",
      stageName: "Negociação",
      crmPares: null,
      crmValor: null,
      at: messages[messages.length - 1].dateAdded,
    },
    createdAt: new Date().toISOString(),
  };

  try {
    const [rules, settings] = await Promise.all([loadActiveRules(), loadSellerSettings()]);
    const reply = await simulateReply(reference, rules, settings);
    return {
      cliente: cut.cliente,
      vendedor: cut.vendedor,
      cami: { decisao: reply.decisao, mensagens: reply.mensagens, motivo: reply.motivo },
      porque: picked.porque,
    };
  } catch (err) {
    console.error("Você × Cami: simulação falhou", err);
    return { erro: "A Cami não conseguiu responder agora. Tente abrir o resultado de novo mais tarde." };
  }
}
