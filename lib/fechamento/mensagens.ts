// Mensagens do fechamento que a Schay cola na conversa do GHL: arte aprovada
// (grade de cada modelo), orçamento final e confirmação do pedido. É o formato
// que ela já usava, padronizado para a Cami conseguir montar a ficha do pedido
// a partir da conversa. Preços e frete vêm do mesmo cálculo do orçamento
// automático da Black (orcamentoBlack), para os números nunca divergirem.
// Módulo puro: sem rede, testado em tests/fechamento-mensagens.test.mjs.
import { brl, orcamentoBlack, type OrcamentoBlack } from "../ghl/orcamento-black/calc";
import { MIN_PARES } from "../ghl/ai-seller/pricing";

export const GRADE_ADULTO = ["34/35", "36/37", "38/39", "40/41", "42/43", "44/45"] as const;
export const GRADE_INFANTIL = ["28/29", "30/31", "32/33"] as const;
export const PEDIDO_MINIMO = MIN_PARES;
export const CHAVE_PIX = ["Chave Pix (CNPJ): 28.757.684/0001-90", "LOJA HUD / MASK HUD · Sicredi"] as const;

export type FormaDePagamento = "pix" | "cartao" | "pix5050";

export const FORMAS: Record<FormaDePagamento, { titulo: string; curto: string }> = {
  pix: { titulo: "1. Pix à vista", curto: "Pix à vista" },
  cartao: { titulo: "2. Cartão em até 6x sem juros", curto: "Cartão 6x" },
  pix5050: { titulo: "3. Em 2x no Pix sem juros (50% + 50%)", curto: "Pix 50/50" },
};

export interface ModeloDaGrade {
  nome: string;
  adulto: Record<string, number>;
  infantil: Record<string, number>;
}

export interface DadosDoPedido {
  pares: number;
  /** Frete da cotação; ignorado a partir de 36 pares (frete grátis). */
  frete: number | null;
  forma: FormaDePagamento;
  evento: string;
  obs: string;
}

const centavos = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

const quantidade = (q: unknown) => {
  const n = Math.trunc(Number(q));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function totalDoModelo(m: ModeloDaGrade): number {
  return [...Object.values(m.adulto), ...Object.values(m.infantil)].reduce((s, q) => s + quantidade(q), 0);
}

export function totalDaGrade(modelos: ModeloDaGrade[]): number {
  return modelos.reduce((s, m) => s + totalDoModelo(m), 0);
}

function linhasDaGrade(m: ModeloDaGrade): string[] {
  const linhas = GRADE_ADULTO.filter((t) => quantidade(m.adulto[t]) > 0).map((t) => `${t} - ${quantidade(m.adulto[t])}`);
  const infantil = GRADE_INFANTIL.filter((t) => quantidade(m.infantil[t]) > 0).map(
    (t) => `${t} - ${quantidade(m.infantil[t])}`,
  );
  if (infantil.length) linhas.push("Infantil:", ...infantil);
  return linhas;
}

/**
 * "*ARTE APROVADA*" com a grade (um modelo) ou "*ARTES APROVADAS*" com um bloco
 * por modelo, na ordem das artes. Null sem nenhuma quantidade preenchida.
 */
export function mensagemArteAprovada(dados: Pick<DadosDoPedido, "evento" | "obs">, modelos: ModeloDaGrade[]): string | null {
  const usados = modelos.map((m, i) => ({ m, i })).filter(({ m }) => totalDoModelo(m) > 0);
  if (usados.length === 0) return null;
  const linhas: string[] = [];
  if (usados.length === 1) {
    linhas.push("*ARTE APROVADA*", "", "*GRADE DE NUMERAÇÕES*", ...linhasDaGrade(usados[0].m));
  } else {
    linhas.push("*ARTES APROVADAS*");
    for (const { m, i } of usados) linhas.push("", `*${m.nome.trim() || `MODELO ${i + 1}`}*`, ...linhasDaGrade(m));
  }
  linhas.push("", `TOTAL: ${usados.reduce((s, { m }) => s + totalDoModelo(m), 0)} PARES`);
  if (dados.evento.trim()) linhas.push(`Evento: ${dados.evento.trim()}`);
  if (dados.obs.trim()) linhas.push(`Obs.: ${dados.obs.trim()}`);
  return linhas.join("\n");
}

/** Preços da Black para o pedido; null abaixo do mínimo de 12 pares. */
export function precosDoPedido(dados: Pick<DadosDoPedido, "pares" | "frete">): OrcamentoBlack | null {
  if (!Number.isFinite(dados.pares) || dados.pares < PEDIDO_MINIMO) return null;
  return orcamentoBlack(Math.trunc(dados.pares), dados.frete);
}

export function precoDaForma(o: OrcamentoBlack, forma: FormaDePagamento): number {
  // O Pix 50/50 usa o preço do cartão.
  return forma === "pix" ? o.parPix : o.parCartao;
}

const freteDe = (o: OrcamentoBlack) => (o.freteGratis ? 0 : (o.frete ?? 0));

export const ESTADOS: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe",
  TO: "Tocantins",
};

/**
 * Frete estimado pelo estado, a mesma tabela que o robô de orçamento do GHL
 * (Orçamento Automático 03) grava de 12 a 35 pares: RS R$ 59, SC e PR R$ 89 e
 * os demais R$ 119. Conferida em 23/11/2026 nos contatos desde 01/10. Se o robô
 * mudar a tabela, mudar aqui também. Null para sigla desconhecida.
 */
export function freteEstimadoPorEstado(uf: string): number | null {
  const sigla = uf.trim().toUpperCase();
  if (!ESTADOS[sigla]) return null;
  if (sigla === "RS") return 59;
  if (sigla === "SC" || sigla === "PR") return 89;
  return 119;
}

/**
 * Orçamento final com as três opções numeradas; o cliente responde com o número.
 * Com `estimativaUf`, o frete veio da tabela por estado e a mensagem avisa que
 * o valor exato sai pelo CEP.
 */
export function mensagemOrcamentoFinal(o: OrcamentoBlack, opcoes: { estimativaUf?: string | null } = {}): string {
  const frete = freteDe(o);
  const rotulo = o.freteGratis ? "Total" : "Total com frete";
  const estado = opcoes.estimativaUf ? ESTADOS[opcoes.estimativaUf.trim().toUpperCase()] : undefined;
  const linhasDoFrete = o.freteGratis
    ? ["*Frete: GRÁTIS*", ""]
    : [
        `*Frete: ${brl(frete)}*`,
        ...(estado ? [`Estimativa para ${estado}; o valor exato sai pelo seu CEP.`] : []),
        "Os totais abaixo já incluem o frete.",
        "",
      ];
  const linhas = [
    `*Seu orçamento: ${o.pares} pares*`,
    "",
    "*Preço normal*",
    `${brl(o.parTabela)} o par`,
    `Total dos pares sem desconto: ${brl(o.subtotalCheio)}`,
    "",
    "🖤 *Com o desconto da Black November*",
    "",
    ...linhasDoFrete,
  ];
  for (const forma of ["pix", "cartao", "pix5050"] as const) {
    const preco = precoDaForma(o, forma);
    linhas.push(`*${FORMAS[forma].titulo}*`, `${brl(preco)} o par`, `${rotulo}: ${brl(centavos(o.pares * preco + frete))}`, "");
  }
  linhas.push("E qual seria a forma de pagamento?");
  return linhas.join("\n");
}

export interface Confirmacao {
  texto: string;
  /** Preço do par que vai na ficha. */
  precoDoPar: number;
  /** Valor do negócio no GHL: pares × preço do par, sem o frete. */
  valorDosPares: number;
  total: number;
}

/** Confirmação só com a opção escolhida, com o próximo passo do pagamento. */
export function mensagemConfirmacao(o: OrcamentoBlack, forma: FormaDePagamento): Confirmacao {
  const frete = freteDe(o);
  const preco = precoDaForma(o, forma);
  const valorDosPares = centavos(o.pares * preco);
  const total = centavos(valorDosPares + frete);
  const linhas = [
    `*Pedido confirmado: ${o.pares} pares*`,
    "",
    `*${FORMAS[forma].titulo}*`,
    `${brl(preco)} o par`,
    o.freteGratis ? "Frete: GRÁTIS" : `Frete: ${brl(frete)}`,
    `${o.freteGratis ? "Total" : "Total com frete"}: ${brl(total)}`,
  ];
  if (forma === "cartao") {
    linhas.push(
      `Em até 6x de ${brl(centavos(total / 6))} sem juros`,
      "",
      "Já te envio o link de pagamento aqui. Só me envia o comprovante, por favor.",
    );
  } else if (forma === "pix5050") {
    const primeira = centavos(total / 2);
    linhas.push(
      "",
      `1ª parte (50%), para liberar a produção: ${brl(primeira)}`,
      `2ª parte (50%), antes do envio: ${brl(centavos(total - primeira))}`,
      "",
      ...CHAVE_PIX,
      "",
      "Só me envia o comprovante da 1ª parte aqui, por favor.",
    );
  } else {
    linhas.push("", ...CHAVE_PIX, "", "Só me envia o comprovante aqui, por favor.");
  }
  return { texto: linhas.join("\n"), precoDoPar: preco, valorDosPares, total };
}

/** Lê "59,00", "59.00" ou "R$ 1.059,38"; null quando vazio ou inválido. */
export function lerValor(texto: string): number | null {
  const limpo = texto.trim().replace(/[^\d,.-]/g, "");
  if (!limpo) return null;
  const n = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
