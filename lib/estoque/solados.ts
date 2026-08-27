/**
 * Estoque de solados — necessidade de produção (GHL) × saldo (Tiny).
 *
 * Cada modelo de um pedido tem uma grade (pares por numeração) e uma cor de
 * solado, e **um par consome exatamente um solado** — confirmado na estrutura
 * de produção do Tiny, onde `SOLA SLIDE - {COR} {NUMERAÇÃO}` entra com
 * quantidade 1.
 *
 * O Tiny baixa o solado no **faturamento**. Então tudo que já foi vendido e
 * ainda não faturou continua inteiro no saldo do Tiny e precisa ser descontado
 * para se saber o que sobra de verdade — inclusive o que já foi produzido e
 * está esperando nota. É por isso que a janela abaixo vai de "Pagamento
 * Confirmado" até a última etapa antes do Fiscal, e não para na produção.
 *
 * Não há netting nem exceção: todo pedido da janela conta uma vez. Se o
 * faturamento voltar a acontecer antes (por exemplo no cadastro do ERP), esta
 * conta passa a contar em dobro — o ponto da baixa e o fim desta janela têm de
 * andar juntos.
 *
 * Este arquivo é puro de propósito: quem fala com GHL e Tiny é
 * `solados-source.ts`. Assim a regra de negócio fica testável sem rede.
 */

export const SOLADO_CORES = ["Preto", "Branco"] as const;
export type SoladoCor = (typeof SOLADO_CORES)[number];

export const NUMERACOES_ADULTO = [
  "34/35",
  "36/37",
  "38/39",
  "40/41",
  "42/43",
  "44/45",
] as const;

export const NUMERACOES_INFANTIL = ["28/29", "30/31", "32/33"] as const;

export type SoladoPublico = "adulto" | "infantil";

/**
 * Etapas do pipeline Atendimento que ainda não faturaram.
 *
 * Começa depois de "Conferir Pgto/Completar Dados" — lá a grade ainda está
 * sendo preenchida e o dado não é confiável. Termina em "Aprovar Financeiro
 * Pedido Total", a última antes do Fiscal: da nota em diante o Tiny já baixou.
 */
export const SOLADO_STAGE_TITLES_ATENDIMENTO = [
  "Pagamento Confirmado",
  "Cadastro ERP",
  "Cadastro Contas a Receber",
  "Criar Arquivos Serigrafia",
  "Impressão de Fotolitos",
  "Produção de Amostras",
  "Produção de Pedidos",
  // Produzidos, solado já consumido, nota ainda não emitida.
  "Expedição",
  "Cobrar Saldo",
  "Aprovar Financeiro Pedido Total",
];

/** Mesmo corte no pipeline Representantes, que fatura em "Fiscal/Cobrança". */
export const SOLADO_STAGE_TITLES_REPRESENTANTES = [
  "Aprovar pedido com banco",
  "Cadastro de pedido",
  "Produção",
  "Expedição",
];

/**
 * Parâmetros da política de estoque. Ficam aqui, e não no Tiny, porque o mínimo
 * é recalculado a cada leitura conforme o consumo muda — travar no ERP daria um
 * número que envelhece em silêncio.
 */
export type SoladoParametros = {
  /** Dias ÚTEIS de consumo que o estoque mínimo deve cobrir. */
  diasUteisCobertura: number;
  /** Nenhum tamanho × cor pode ficar abaixo disso, mesmo sem demanda. */
  travaPorSku: number;
  /** Pedido mínimo por numeração junto ao fornecedor; acima disso é livre. */
  lotePorNumeracao: number;
  /** Dias úteis por mês, para converter o consumo mensal em consumo diário. */
  diasUteisPorMes: number;
  /**
   * Peso máximo de um único pedido na curva de numeração e cor.
   *
   * Sem isso um pedido grande reescreve a política inteira: o MANYCHAT, com 500
   * pares pretos, era 30% da amostra e movia o split de cor em 7 pontos — e
   * quase saiu branco, mudou na última hora.
   */
  tetoInfluenciaPedido: number;
  /** Consumo médio mensal em pares, do histórico de embarques. */
  consumoMensalMedio: number;
};

export const SOLADO_PARAMETROS_PADRAO: SoladoParametros = {
  diasUteisCobertura: 15,
  travaPorSku: 20,
  lotePorNumeracao: 40,
  diasUteisPorMes: 21,
  tetoInfluenciaPedido: 0.1,
  consumoMensalMedio: 0,
};

/**
 * ⚠️  LISTA TEMPORÁRIA — APAGAR QUANDO ESVAZIAR.
 *
 * Até 26/08/2026 o Tiny baixava o solado no cadastro do ERP. Estes pedidos
 * foram lançados sob aquela regra: o solado deles JÁ saiu do saldo do Tiny e,
 * por decisão do time, não será baixado de novo no faturamento. Contá-los como
 * necessidade os descontaria duas vezes — a tela pediria 783 pares a mais.
 *
 * Pedido criado a partir de 27/08/2026 só baixa no faturamento e NÃO entra
 * aqui. Conforme estes forem faturados eles saem da janela sozinhos, e a tela
 * mostra quantos ainda restam. **Quando chegar a zero, apague esta constante e
 * o filtro em `montarResumo`.**
 */
export const NEGOCIOS_BAIXADOS_NO_CADASTRO_ERP = new Set([
  "9OzuuXrCpJpQMMufRnsV", // 1927 — Ariana - MENINAS SOLTAS
  "kYQQ5OwmdUSyW1cwBLkc", // 1929 — Daniela - AG
  "UDVtyWHXLU8f25rPPpEa", // 1930 — MANYCHAT
  "WU0f0KUi2161GfwK6dgg", // 1933 — GUILHERME - VESTORETO
  "gwj55Bpeao4m9myfYANk", // 1935 — Renato - F&P
  "rXTjtvyLaYqFjpqlGjxO", // 1938 — Thiago - FERRUCIO SIX
  "WEPvC3OvsDlkIpOE0Hn1", // 1940 — Angélica - BJJ FIGHT
  "0ntdOAysW4q52aL0rgVT", // 1942 — André - PERSONETY
  "MNZBV613wJ7ShydtJz8A", // 1949 — Bjorn Ben
  "lcyrwzScXqlk3yqZLfFq", // 1950 — Jose - Home Fight
  "Z74yFx6flRHjrCzUeVss", // 1951 — Zipper Uniformes
  "XQHkNdHZxxQ5UONoaGzv", // 1952 — Marimar - DIVAS
  "VDgdh5IAkxJUSnZjBN5m", // 1953 — Daiane - VOLKSWAGEN
  "xMhWx1lU5riOcjtLidQE", // 1954 — Juliane - Closet
  "LOA1YNs7BZNbkyuNwYnu", // 1955 — Carolaini - Team Everaldo
  "4Lb4J3xYvSPXnLZT9Ht3", // 1957 — Eliane - FÉ
  "N4tanKE8qOMMUqeVnenb", // 1958 — Renato - Zero2
  "BD5id7SwBv3zIX7v13Ix", // 1959 — Marcio - RFT
  "KkIy56STTMoZoMZiWmBk", // 1960 — Claudemir Luis - Renuv
  "fKC1ZesB4YPGCD811Kuy", // 1962 — Gustavo - OLIMPO
  "tw1bOju7RrVAja3KuNd7", // 1964 — Norton - Dripz Vulcano
  "UigOdHfvGRn2FPjtsMLy", // 1965 — Dr. Araken - Rioa
  "gInI0AP9by0C5B6b54wz", // 1966 — Leandro - Siriú
  "eKZl3btAukquUtMryky7", // 1970 — Bárbara - Cext
  "ZSJhTgr5L0VSlcrRw269", // 1972 — Dennyson Davilla - DENNYSOM
  "wb1Tcna4ImnT7dIRgWSD", // 1973 — Henrique - CNG
  "7KWZaxqbLki11GMyjeAW", // 1974 — Carolina Menezes - Quintal 542
  "8OholN63l2Ge9Bz2ZymN", // 1975 — Bia - Bateria Cilada
]);

/** Um modelo de um pedido: a grade e a cor de solado escolhida. */
export type SoladoItemDemanda = {
  cor: SoladoCor;
  numeracao: string;
  pares: number;
};

export type SoladoNegocio = {
  dealId: string;
  nome: string;
  pipeline: string;
  etapa: string;
  dataEmbarque: string | null;
  itens: SoladoItemDemanda[];
  /** Modelos com grade preenchida mas sem cor de solado definida. */
  paresSemSolado: number;
};

export type SoladoSkuTiny = {
  produtoId: number;
  descricao: string;
  cor: SoladoCor;
  numeracao: string;
  saldo: number;
};

export type SoladoLinha = {
  cor: SoladoCor;
  numeracao: string;
  publico: SoladoPublico;
  produtoId: number | null;
  /** Saldo do Tiny. Negativo significa solado já vendido que não existe. */
  saldo: number | null;
  saldoNegativo: boolean;
  /** Pares em ordens de compra emitidas e ainda não recebidas. */
  aCaminho: number;
  /** Fatia da cobertura que a curva de demanda destina a este SKU. */
  curva: number;
  /** `max(trava, curva)` — o estoque mínimo desta linha. */
  minimo: number;
  /** `true` quando a trava levantou o mínimo acima do que a curva pedia. */
  minimoTravado: boolean;
  /** Pares vendidos e ainda não faturados — o Tiny ainda não os descontou. */
  necessidade: number;
  /** `saldo + aCaminho - necessidade`. `null` sem o SKU no Tiny. */
  projetado: number | null;
  /** Quanto comprar para chegar ao mínimo, respeitando o lote do fornecedor. */
  sugestaoCompra: number | null;
  /** `true` quando o lote mínimo levantou a compra acima do necessário. */
  compraArredondadaAoLote: boolean;
};

export type SoladoResumo = {
  linhas: SoladoLinha[];
  negocios: SoladoNegocio[];
  paresSemSolado: number;
  skusNaoEncontrados: string[];
  totalNecessidade: number;
  totalSugestaoCompra: number;
  totalACaminho: number;
  /** Soma dos mínimos, já com a trava aplicada. */
  totalMinimo: number;
  /** Pares que a cobertura sozinha pediria, antes da trava. */
  coberturaEmPares: number;
  parametros: SoladoParametros;
  /**
   * Pedidos da janela que ficaram de fora por já terem baixado no cadastro do
   * ERP. Existe para a exceção não apodrecer em silêncio: quando zerar,
   * `NEGOCIOS_BAIXADOS_NO_CADASTRO_ERP` deve ser apagada.
   */
  legadosForaDaConta: number;
};

const CHAVE = (cor: string, numeracao: string) => `${cor}|${numeracao}`;

/**
 * Lê `SOLA SLIDE - BRANCO 40/41`. O espaçamento varia entre os cadastros
 * (alguns têm espaço duplo), então a comparação é feita sobre o texto
 * normalizado em vez de exigir o formato exato.
 */
export function parseSoladoDescricao(
  descricao: string | null | undefined,
): { cor: SoladoCor; numeracao: string } | null {
  if (!descricao) return null;
  const limpo = descricao.replace(/\s+/g, " ").trim().toUpperCase();
  const match = /^SOLA SLIDE - (BRANCO|PRETO) (\d{2}\/\d{2})$/.exec(limpo);
  if (!match) return null;
  return {
    cor: match[1] === "PRETO" ? "Preto" : "Branco",
    numeracao: match[2],
  };
}

export function publicoDaNumeracao(numeracao: string): SoladoPublico {
  return (NUMERACOES_INFANTIL as readonly string[]).includes(numeracao)
    ? "infantil"
    : "adulto";
}

/** Todas as combinações cor × numeração, em ordem crescente de numeração. */
export function combinacoesSolado(): Array<{
  cor: SoladoCor;
  numeracao: string;
  publico: SoladoPublico;
}> {
  const combos: Array<{
    cor: SoladoCor;
    numeracao: string;
    publico: SoladoPublico;
  }> = [];
  for (const cor of SOLADO_CORES) {
    for (const numeracao of NUMERACOES_INFANTIL) {
      combos.push({ cor, numeracao, publico: "infantil" });
    }
    for (const numeracao of NUMERACOES_ADULTO) {
      combos.push({ cor, numeracao, publico: "adulto" });
    }
  }
  return combos;
}

/**
 * Peso de cada SKU na demanda, com o peso de cada PEDIDO limitado ao teto.
 *
 * O pedido que passa do teto é reduzido inteiro, proporcionalmente — assim ele
 * perde influência sem distorcer a grade interna dele.
 */
export function curvaDeDemanda(
  negocios: SoladoNegocio[],
  tetoInfluencia: number,
): Map<string, number> {
  const totalPorNegocio = negocios.map((negocio) =>
    negocio.itens.reduce((total, item) => total + item.pares, 0),
  );
  const totalGeral = totalPorNegocio.reduce((a, b) => a + b, 0);
  const limite = totalGeral * tetoInfluencia;

  const curva = new Map<string, number>();
  negocios.forEach((negocio, indice) => {
    const totalNegocio = totalPorNegocio[indice];
    if (!totalNegocio) return;
    const fator = totalNegocio > limite ? limite / totalNegocio : 1;
    for (const item of negocio.itens) {
      const chave = CHAVE(item.cor, item.numeracao);
      curva.set(chave, (curva.get(chave) ?? 0) + item.pares * fator);
    }
  });
  return curva;
}

export function montarResumo(input: {
  negocios: SoladoNegocio[];
  skus: SoladoSkuTiny[];
  aCaminho?: SoladoItemDemanda[];
  parametros: SoladoParametros;
}): SoladoResumo {
  const p = input.parametros;
  const skuPorChave = new Map(
    input.skus.map((sku) => [CHAVE(sku.cor, sku.numeracao), sku]),
  );
  const necessidade = new Map<string, number>();
  const aCaminho = new Map<string, number>();

  // Exceção temporária: ver NEGOCIOS_BAIXADOS_NO_CADASTRO_ERP.
  const negocios = input.negocios.filter(
    (negocio) => !NEGOCIOS_BAIXADOS_NO_CADASTRO_ERP.has(negocio.dealId),
  );
  const legadosForaDaConta = input.negocios.length - negocios.length;

  for (const negocio of negocios) {
    for (const item of negocio.itens) {
      const chave = CHAVE(item.cor, item.numeracao);
      necessidade.set(chave, (necessidade.get(chave) ?? 0) + item.pares);
    }
  }
  for (const item of input.aCaminho ?? []) {
    const chave = CHAVE(item.cor, item.numeracao);
    aCaminho.set(chave, (aCaminho.get(chave) ?? 0) + item.pares);
  }

  // A curva sai da demanda que o dashboard enxerga hoje; o histórico mensal
  // ainda está sendo acumulado. Por isso a trava e o override existem.
  const curva = curvaDeDemanda(negocios, p.tetoInfluenciaPedido);
  const somaCurva = [...curva.values()].reduce((a, b) => a + b, 0);
  const coberturaEmPares = Math.round(
    (p.consumoMensalMedio / p.diasUteisPorMes) * p.diasUteisCobertura,
  );

  const linhas = combinacoesSolado().map(({ cor, numeracao, publico }) => {
    const chave = CHAVE(cor, numeracao);
    const sku = skuPorChave.get(chave);
    const necessidadeLinha = necessidade.get(chave) ?? 0;
    const aCaminhoLinha = aCaminho.get(chave) ?? 0;
    const saldo = sku?.saldo ?? null;

    const fatia = somaCurva > 0 ? (curva.get(chave) ?? 0) / somaCurva : 0;
    const curvaPares = Math.round(fatia * coberturaEmPares);
    const minimo = Math.max(p.travaPorSku, curvaPares);

    const projetado =
      saldo === null ? null : saldo + aCaminhoLinha - necessidadeLinha;
    const falta = projetado === null ? null : minimo - projetado;
    const sugestaoCompra =
      falta === null || falta <= 0
        ? falta === null
          ? null
          : 0
        : Math.max(p.lotePorNumeracao, falta);

    return {
      cor,
      numeracao,
      publico,
      produtoId: sku?.produtoId ?? null,
      saldo,
      saldoNegativo: saldo !== null && saldo < 0,
      aCaminho: aCaminhoLinha,
      curva: curvaPares,
      minimo,
      minimoTravado: curvaPares < p.travaPorSku,
      necessidade: necessidadeLinha,
      projetado,
      sugestaoCompra,
      compraArredondadaAoLote:
        falta !== null && falta > 0 && falta < p.lotePorNumeracao,
    };
  });

  // Combinação com demanda mas sem SKU no Tiny é erro de cadastro, não zero:
  // aparece na tela em vez de sumir na conta.
  const skusNaoEncontrados = linhas
    .filter((linha) => linha.produtoId === null && linha.necessidade > 0)
    .map((linha) => `SOLA SLIDE - ${linha.cor.toUpperCase()} ${linha.numeracao}`);

  return {
    linhas,
    negocios,
    paresSemSolado: negocios.reduce(
      (total, negocio) => total + negocio.paresSemSolado,
      0,
    ),
    skusNaoEncontrados,
    totalNecessidade: linhas.reduce((total, l) => total + l.necessidade, 0),
    totalSugestaoCompra: linhas.reduce(
      (total, l) => total + (l.sugestaoCompra ?? 0),
      0,
    ),
    totalACaminho: linhas.reduce((total, l) => total + l.aCaminho, 0),
    totalMinimo: linhas.reduce((total, l) => total + l.minimo, 0),
    coberturaEmPares,
    parametros: p,
    legadosForaDaConta,
  };
}
