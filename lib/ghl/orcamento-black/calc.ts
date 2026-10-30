// Orçamento da Black November (01 a 30/11/2026), calculado aqui e não no
// construtor do GHL: o Orçamento Automático 03 chama o webhook, que grava os
// campos e o texto pronto para a mensagem. Mesma regra de preço da Cami
// (precoComPromocao), com as faixas da promoção salva no Controle. Módulo puro.
import { FREE_SHIPPING_MIN_PARES } from "../ai-seller/config";
import { MIN_PARES } from "../ai-seller/pricing";
import { precoComPromocao, type Promocao } from "../ai-seller/vigentes";

/** As faixas da Black, iguais às do Controle: 5% a partir de 12, 7% de 36, 10% de 100 e 15% de 500, mais 5% no PIX. */
export const PROMO_BLACK_NOVEMBER: Promocao = {
  nome: "Black November",
  inicio: "2026-11-01T00:00:00-03:00",
  fim: "2026-11-30T23:59:00-03:00",
  descontoPct: 5,
  minPares: MIN_PARES,
  faixas: [
    { minPares: 36, descontoPct: 7 },
    { minPares: 100, descontoPct: 10 },
    { minPares: 500, descontoPct: 15 },
  ],
  texto: "",
};

const BONUS = [
  { min: 500, texto: "arte digital de divulgação + frete grátis + fotos de estúdio dos seus slides + takes de produção" },
  { min: 100, texto: "arte digital de divulgação + frete grátis + fotos de estúdio dos seus slides" },
  { min: FREE_SHIPPING_MIN_PARES, texto: "arte digital de divulgação + frete grátis" },
  { min: MIN_PARES, texto: "arte digital de divulgação" },
] as const;

/** Bônus da faixa, que se somam: arte, frete grátis (36+), fotos de estúdio (100+), takes de produção (500+). */
export function bonusDaFaixa(pares: number): string {
  return (BONUS.find((b) => pares >= b.min) ?? BONUS[BONUS.length - 1]).texto;
}

const NUMERO_BR = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "R$ 2.692,50". */
export function brl(valor: number): string {
  return `R$ ${NUMERO_BR.format(valor)}`;
}

const centavos = (valor: number) => Math.round(valor * 100);

export interface OrcamentoBlack {
  /** Pares do orçamento: o informado, ou 12 quando veio menos (o 02 já avisou o mínimo). */
  pares: number;
  parTabela: number;
  parCartao: number;
  parPix: number;
  pctCartao: number;
  pctPix: number;
  subtotalCheio: number;
  subtotalCartao: number;
  subtotalPix: number;
  freteGratis: boolean;
  /** 0 com frete grátis; null quando o 03 não gravou o frete. */
  frete: number | null;
  totalCheio: number;
  totalCartao: number;
  totalPix: number;
  bonus: string;
  /** Bloco da mensagem, em WhatsApp (*negrito*, ~riscado~). */
  texto: string;
}

/** Lê "Qntd Pares" como número inteiro positivo; null se não der. */
export function paresDoCampo(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor.replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** Lê o frete gravado pelo 03; null quando vazio ou inválido. */
export function freteDoCampo(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : typeof valor === "string" && valor.trim() ? Number(valor.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Orçamento Black para essa quantidade e esse frete. null sem quantidade válida. */
export function orcamentoBlack(paresInformados: number | null, freteInformado: number | null): OrcamentoBlack | null {
  if (paresInformados == null) return null;
  const pares = Math.max(MIN_PARES, paresInformados);
  const preco = precoComPromocao(pares, PROMO_BLACK_NOVEMBER);
  if (!preco) return null;

  const freteGratis = pares >= FREE_SHIPPING_MIN_PARES;
  const frete = freteGratis ? 0 : freteInformado;
  const comFrete = (subtotal: number) => (centavos(subtotal) + centavos(frete ?? 0)) / 100;

  const o = {
    pares,
    parTabela: preco.unitarioCheio,
    parCartao: preco.unitario,
    parPix: preco.pixUnitario,
    pctCartao: preco.descontoPct,
    pctPix: preco.pixDescontoPct,
    subtotalCheio: preco.subtotalCheio,
    subtotalCartao: preco.subtotal,
    subtotalPix: preco.pixSubtotal,
    freteGratis,
    frete,
    totalCheio: comFrete(preco.subtotalCheio),
    totalCartao: comFrete(preco.subtotal),
    totalPix: comFrete(preco.pixSubtotal),
    bonus: bonusDaFaixa(pares),
  };
  return { ...o, texto: textoDoOrcamento(o) };
}

function textoDoOrcamento(o: Omit<OrcamentoBlack, "texto">): string {
  const linhaFrete = o.freteGratis
    ? "🚚 Frete: *GRÁTIS*"
    : o.frete == null
      ? "🚚 Frete: a confirmar"
      : `🚚 Frete: ${brl(o.frete)}`;
  const semFrete = !o.freteGratis && o.frete == null ? " (sem o frete)" : "";
  return [
    `📦 Quantidade: ${o.pares} pares`,
    `💰 Valor do par: ~${brl(o.parTabela)}~ *${brl(o.parCartao)}* em até 6x sem juros (${o.pctCartao}% OFF)`,
    `⚡ No PIX: *${brl(o.parPix)}* o par (${o.pctPix}% OFF)`,
    linhaFrete,
    `💳 Total${semFrete}: ~${brl(o.totalCheio)}~ *${brl(o.totalCartao)}* em até 6x sem juros ou *${brl(o.totalPix)}* no PIX`,
    `🎁 Bônus da sua faixa: ${o.bonus}`,
  ].join("\n");
}
