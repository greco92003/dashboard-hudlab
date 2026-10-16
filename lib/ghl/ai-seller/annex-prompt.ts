// O pedido à IA que reescreve o anexo de atendimento. Módulo puro.
import { ANNEX_ESTADOS, MAX_ANNEX_ITEMS } from "./annex-shape";
import { FEEDBACK_ATALHOS } from "./feedback-shape";
import { JEITO_DE_ATENDER } from "./prompt";

export interface FeedbackForAnnex {
  id: string;
  autor: string;
  atalhos: string[];
  texto: string;
  urgente: boolean;
  /** Trecho do atendimento, já com quem falou e a hora. */
  trecho: string;
}

export const ANNEX_INSTRUCTIONS = `Você mantém o ANEXO DE ATENDIMENTO da Cami, a IA vendedora da Hud Lab (Chinelo Slide personalizado) no WhatsApp.

A Cami segue um "jeito de atender" fixo (abaixo). O anexo complementa essa base com aprendizados que vêm dos feedbacks do dono e da gestora sobre atendimentos reais. Toda revisão reescreve o anexo INTEIRO, juntando o anexo em vigor com os feedbacks novos, para ele continuar curto e sem itens repetidos.

${JEITO_DE_ATENDER}

Como reescrever:
1. Cada item é uma orientação geral e curta (até 2 frases), escrita para a Cami ("Quando..., faça..."). Sem nome de cliente, sem datas, sem citar o atendimento.
2. Não repita o que o jeito de atender já diz. Feedback que a base já cobre não vira item; item do anexo que ficou redundante com a base sai (removido).
3. Junte itens parecidos num só. No máximo ${MAX_ANNEX_ITEMS} itens ativos.
4. Estados:
   - novo: não existia no anexo;
   - ajustado: reescreve um item em vigor ("antes" = o texto em vigor, exato);
   - mantido: item em vigor sem mudança ("texto" = o texto em vigor, exato);
   - removido: item em vigor que sai ("antes" e "texto" = o texto em vigor, exato; "motivo" diz por quê).
   Todo item em vigor precisa aparecer como mantido, ajustado ou removido.
5. "Foi ótimo" mostra o que funcionou: só vira item se apontar um comportamento específico que a Cami poderia perder.
6. Preço, frete, desconto, prazos de produção e políticas comerciais NÃO entram no anexo (vivem no manual). Se um feedback aponta erro desse tipo, descreva em "paraOManual" o que precisa mudar, em uma frase.
7. "motivo": uma frase com o porquê da mudança, em português simples, citando o que o feedback pediu. "feedbackIds": os ids dos feedbacks que motivaram o item (vazio em mantido).
8. "resumo": uma frase sobre o que muda nesta revisão.
9. Feedback que não se aplica (confuso, sobre outra coisa) é ignorado; não invente aprendizado.`;

export const ANNEX_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["itens", "paraOManual", "resumo"],
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["texto", "estado", "antes", "motivo", "feedbackIds"],
        properties: {
          texto: { type: "string" },
          estado: { type: "string", enum: [...ANNEX_ESTADOS] },
          antes: { type: ["string", "null"] },
          motivo: { type: ["string", "null"] },
          feedbackIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    paraOManual: { type: "array", items: { type: "string" } },
    resumo: { type: "string" },
  },
} as const;

const atalhoLabel = (id: string) => FEEDBACK_ATALHOS.find((a) => a.id === id)?.label ?? id;

/** O texto que vai para a IA: anexo em vigor e feedbacks com o trecho do atendimento. */
export function buildAnnexInput(current: readonly string[], feedbacks: readonly FeedbackForAnnex[]): string {
  const anexo = current.length
    ? current.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "(vazio: ainda não há itens)";
  const lista = feedbacks
    .map((f) => {
      const cabecalho = [
        `Feedback ${f.id} (${f.autor}${f.urgente ? ", urgente" : ""})`,
        f.atalhos.length ? `Atalhos: ${f.atalhos.map(atalhoLabel).join(", ")}` : null,
        f.texto ? `Texto: ${f.texto}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return `${cabecalho}\nTrecho do atendimento:\n${f.trecho || "(não foi possível ler a conversa)"}`;
    })
    .join("\n\n---\n\n");
  return `ANEXO EM VIGOR:\n${anexo}\n\nFEEDBACKS DESTA REVISÃO:\n\n${lista}`;
}
