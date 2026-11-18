/**
 * Escolha da transportadora para a ficha do pedido, a partir da cotação do
 * dashboard (lib/freight/quote, a mesma da Cami vendedora). Módulo puro.
 *
 * - Frete pago pela empresa: a mais barata, e o valor dela vira o frete pago
 *   pela Hud (decisão do usuário em 18/11).
 * - Frete pago pelo cliente: o valor já foi combinado na conversa; a
 *   transportadora é a cotação que bate com esse valor, ou a mais barata, com
 *   aviso, quando nenhuma bate (a tabela pode ter mudado desde o orçamento).
 */

export interface OpcaoDeFrete {
  transportadora: string;
  total: number;
}

export interface EscolhaDeFrete {
  transportadora: string | null;
  /** Só quando a empresa paga: vai em "Valor do frete pago Hud Lab". */
  valorHud: number | null;
  aviso: string | null;
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Diferença aceita entre o frete combinado e a cotação de hoje: R$ 1 ou 3%. */
export function freteBate(cotado: number, combinado: number): boolean {
  return Math.abs(cotado - combinado) <= Math.max(1, combinado * 0.03);
}

export function escolherFrete(
  opcoes: OpcaoDeFrete[],
  condicao: string | null,
  valorCliente: number | null,
): EscolhaDeFrete {
  const ordenadas = [...opcoes].filter((o) => Number.isFinite(o.total) && o.total > 0).sort((a, b) => a.total - b.total);
  const maisBarata = ordenadas[0];
  if (!maisBarata) return { transportadora: null, valorHud: null, aviso: "A cotação não trouxe nenhuma transportadora para esse destino." };

  if (condicao && /empresa/i.test(condicao)) {
    return { transportadora: maisBarata.transportadora, valorHud: Math.round(maisBarata.total * 100) / 100, aviso: null };
  }

  if (valorCliente !== null && valorCliente > 0) {
    const igual = ordenadas.find((o) => freteBate(o.total, valorCliente));
    if (igual) return { transportadora: igual.transportadora, valorHud: null, aviso: null };
    return {
      transportadora: maisBarata.transportadora,
      valorHud: null,
      aviso: `O frete combinado (${moeda(valorCliente)}) não bate com a cotação de hoje; a mais barata é ${maisBarata.transportadora}, ${moeda(maisBarata.total)}. Confira a transportadora.`,
    };
  }
  return { transportadora: maisBarata.transportadora, valorHud: null, aviso: null };
}
