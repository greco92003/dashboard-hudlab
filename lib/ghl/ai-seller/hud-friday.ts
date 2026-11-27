// Hud Friday (sex 27/11/2026) na Cami. Módulo puro.
//
// A oferta foi para a base pelo disparo de quinta (tag campanha_blackhudfriday_enviado).
// Para esses contatos: na quinta a Cami sabe que amanhã tem Hud Friday e não antecipa o
// preço; na sexta o orçamento sai com a Hud Friday no lugar da Black November. Para os
// outros (tráfego novo) nada muda (decisão de 25/11).
import { PROMO_HUD_FRIDAY } from "../orcamento-black/calc";
import { vigencia, type Promocao } from "./vigentes";

export const TAG_HUD_FRIDAY_RECEBEU = "campanha_blackhudfriday_enviado";

/** Recebeu o disparo da Hud Friday. */
export function recebeuHudFriday(tags: readonly string[] | null | undefined): boolean {
  return (tags ?? []).includes(TAG_HUD_FRIDAY_RECEBEU);
}

/** Faixa que o contato tocou no disparo ("12 a 99" / "100 ou mais"), ou null. */
export function faixaHudFriday(tags: readonly string[] | null | undefined): string | null {
  const t = tags ?? [];
  if (t.includes("hudfriday_100mais")) return "100 pares ou mais";
  if (t.includes("hudfriday_ate99")) return "12 a 99 pares";
  return null;
}

/** Promoção do orçamento para esse contato agora: a Hud Friday na sexta para quem recebeu; senão a do Controle. */
export function promocaoDoContato(
  promoControle: Promocao | null,
  tags: readonly string[] | null | undefined,
  nowMs: number,
): Promocao | null {
  if (recebeuHudFriday(tags) && vigencia(PROMO_HUD_FRIDAY, nowMs) === "ativa") return PROMO_HUD_FRIDAY;
  return promoControle;
}

/** Linha extra do contexto da Cami, só para quem recebeu o disparo, na quinta e na sexta. Vazio fora disso. */
export function contextoHudFriday(tags: readonly string[] | null | undefined, nowMs: number): string {
  if (!recebeuHudFriday(tags)) return "";
  const fase = vigencia(PROMO_HUD_FRIDAY, nowMs);
  if (fase === "encerrada") return "";
  const faixa = faixaHudFriday(tags);
  const condicao =
    "20% de desconto no PIX e 15% no cartão em até 6x, em qualquer faixa de quantidade a partir do pedido mínimo de 12 pares, só para pedido fechado na sexta até 23:59";
  // "Qualquer quantidade" fez cliente pedir 10 pares (27/11): a Cami fala em faixa e lembra o mínimo.
  const minimo =
    " Diga \"qualquer faixa de quantidade\", nunca \"qualquer quantidade\". Se o cliente quiser menos de 12 pares, explique com gentileza que a Hud Friday vale em todas as faixas, mas o pedido mínimo é de 12 pares, e ofereça fechar 12.";
  if (fase === "agendada") {
    return `\n\nHud Friday (só para este cliente, que recebeu a campanha da base): amanhã, sexta 27/11, ${condicao}.${
      faixa ? ` Ele já tocou em "${faixa}" e vai receber aqui o preço da faixa dele na sexta, a partir das 8h.` : ""
    } Hoje vale a condição normal (Black November). Se ele perguntar da Hud Friday ou disser que vai esperar, confirme a condição e que amanhã a partir das 8h ele recebe o preço aqui. Não calcule nem grave orçamento com a Hud Friday antes de sexta.${minimo}`;
  }
  return `\n\nHud Friday HOJE (só para este cliente, que recebeu a campanha da base): ${condicao}. Ela substitui a Black November para ele hoje: a ferramenta atualizar_orcamento já calcula com a Hud Friday (15% no valor dos pares e mais 5% no PIX, 20% no total); cite os valores que ela devolver. Reforce que vale só hoje, até meia-noite, e só com o pedido fechado hoje.${minimo}`;
}
