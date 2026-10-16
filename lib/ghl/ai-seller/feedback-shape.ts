// Feedback por atendimento e a conversa como aparece no dashboard. Módulo puro.
import type { NegotiationMessage } from "@/lib/ghl/negotiation-conversations";

export const FEEDBACK_ATALHOS = [
  { id: "redundante", label: "Redundante" },
  { id: "longa", label: "Longa demais" },
  { id: "tom", label: "Tom" },
  { id: "devia_passar", label: "Devia passar para o time" },
  { id: "info_errada", label: "Informação errada" },
  { id: "foi_otimo", label: "Foi ótimo" },
] as const;
export type FeedbackAtalho = (typeof FEEDBACK_ATALHOS)[number]["id"];

export const FEEDBACK_MAX_CHARS = 2000;
const MAX_MARCADAS = 30;

export interface FeedbackInput {
  texto: string;
  atalhos: FeedbackAtalho[];
  mensagens: string[];
  urgente: boolean;
}

/** O que chega do dashboard → feedback válido, ou a explicação do que falta. */
export function validateFeedbackInput(body: unknown): { ok: true; value: FeedbackInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Corpo inválido" };
  const b = body as Record<string, unknown>;
  const texto = typeof b.texto === "string" ? b.texto.trim() : "";
  if (texto.length > FEEDBACK_MAX_CHARS) {
    return { ok: false, error: `Feedback longo demais (até ${FEEDBACK_MAX_CHARS} caracteres)` };
  }
  const ids = new Set<string>(FEEDBACK_ATALHOS.map((a) => a.id));
  const atalhos = (Array.isArray(b.atalhos) ? b.atalhos : []).filter(
    (a): a is FeedbackAtalho => typeof a === "string" && ids.has(a),
  );
  if (texto.length < 3 && atalhos.length === 0) {
    return { ok: false, error: "Escreva o que aconteceu ou escolha um atalho" };
  }
  const mensagens = (Array.isArray(b.mensagens) ? b.mensagens : [])
    .filter((m): m is string => typeof m === "string" && m.length > 0 && m.length <= 64)
    .slice(0, MAX_MARCADAS);
  return {
    ok: true,
    value: { texto, atalhos: [...new Set(atalhos)], mensagens: [...new Set(mensagens)], urgente: b.urgente === true },
  };
}

export type Quem = "cliente" | "cami" | "time" | "robo";

export interface MensagemView {
  id: string;
  quem: Quem;
  texto: string;
  at: string;
  anexos: string[];
}

export type ConversaItem =
  | { tipo: "mensagem"; mensagem: MensagemView }
  /** Sequência de mensagens automáticas (robô, campanhas), recolhida na tela. */
  | { tipo: "robo"; mensagens: MensagemView[] };

/** A partir de quantas mensagens automáticas seguidas o bloco aparece recolhido. */
const ROBO_RECOLHE = 3;

/**
 * A conversa do WhatsApp como aparece no dashboard: quem falou cada
 * mensagem (a Cami pelos ids que ela enviou; o robô pelas automações; o time
 * pelo usuário do GHL) e as sequências longas do robô recolhidas.
 */
export function buildConversationView(
  messages: readonly NegotiationMessage[],
  camiMessageIds: ReadonlySet<string>,
): ConversaItem[] {
  const views: MensagemView[] = messages.map((m) => ({
    id: m.id,
    quem:
      m.direction === "inbound"
        ? "cliente"
        : camiMessageIds.has(m.id)
          ? "cami"
          : m.isAutomated || !m.userId
            ? "robo"
            : "time",
    texto: m.body ?? "",
    at: m.dateAdded,
    anexos: m.attachments ?? [],
  }));

  const out: ConversaItem[] = [];
  let robo: MensagemView[] = [];
  const flush = () => {
    if (robo.length >= ROBO_RECOLHE) out.push({ tipo: "robo", mensagens: robo });
    else for (const m of robo) out.push({ tipo: "mensagem", mensagem: m });
    robo = [];
  };
  for (const v of views) {
    if (v.quem === "robo") {
      robo.push(v);
      continue;
    }
    flush();
    out.push({ tipo: "mensagem", mensagem: v });
  }
  flush();
  return out;
}

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Data ("dd/mm") da próxima revisão semanal: segunda às 8h30 de Brasília.
 * Na segunda antes das 8h30 é a do próprio dia.
 */
export function nextReviewLabel(nowMs: number): string {
  const local = new Date(nowMs - BRT_OFFSET_MS);
  const weekday = local.getUTCDay();
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  let days = (8 - weekday) % 7;
  if (days === 0 && minutes >= 8 * 60 + 30) days = 7;
  const target = new Date(local.getTime() + days * DAY_MS);
  return `${String(target.getUTCDate()).padStart(2, "0")}/${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
}
