/**
 * Rascunho da ficha do pedido pela Cami: regras puras (sem rede), testáveis.
 *
 * A Cami lê a conversa do fechamento (mensagem "ARTE(S) APROVADA(S)" com a
 * grade de cada modelo, orçamento final numerado, escolha do cliente,
 * comprovante) e as imagens das artes aprovadas, cuja legenda traz a cor da
 * sola. O agente devolve o que achou; aqui isso vira o formato da ficha, com
 * as conferências de soma e de valor que o formulário do cadastro também faz.
 * Nada daqui grava no GHL: quem salva é o vendedor, depois de conferir.
 */

export const GRADE_ADULTO = ["34/35", "36/37", "38/39", "40/41", "42/43", "44/45"] as const;
export const GRADE_INFANTIL = ["28/29", "30/31", "32/33"] as const;
export const FORMAS_PAGAMENTO = [
  "Pix à vista",
  "Pix 50/50",
  "Cartão de Crédito",
  "Boleto 30/60/90",
  "Boleto 30/60",
  "Boleto 30",
] as const;
export const CONDICOES_FRETE = [
  "Frete Pago pelo Cliente",
  "Frete Pago pela Empresa (Frete Grátis)",
] as const;
export const TIPOS_PEDIDO = ["Pedido", "Evento", "Amostra", "Reposição"] as const;
export const BANDEIRAS = ["Mastercard", "Visa", "Ello", "American Express"] as const;
export const SOLADOS = ["Preto", "Branco"] as const;

const DESCONHECIDO = "desconhecido";
const DIA_MS = 86_400_000;

export interface MensagemConversa {
  id: string;
  messageType: string;
  direction: "inbound" | "outbound";
  body: string;
  dateAdded: string;
  source: string | null;
  attachments: string[];
}

/**
 * Janela da conversa que interessa ao fechamento. Termina 3 dias depois do
 * "Status do Pedido: Pagamento Aprovado" (comprovante e ajustes que chegam
 * logo depois), ou agora, quando ainda não houve aprovação. Começa um dia
 * antes da criação da oportunidade, sem passar de 40 dias antes do fim:
 * cliente antigo que voltou não traz as negociações de meses atrás.
 */
export function recortarConversa(
  mensagens: MensagemConversa[],
  opcoes: { criadaEm: string | null; agora?: Date },
): MensagemConversa[] {
  const ordenadas = mensagens
    .filter((m) => !m.messageType.startsWith("TYPE_ACTIVITY"))
    .sort((a, b) => Date.parse(a.dateAdded) - Date.parse(b.dateAdded));
  const aprovacao = [...ordenadas]
    .reverse()
    .find((m) => /status do pedido:\s*pagamento aprovado/i.test(m.body));
  const fim = aprovacao
    ? Date.parse(aprovacao.dateAdded) + 3 * DIA_MS
    : (opcoes.agora ?? new Date()).getTime();
  const criada = opcoes.criadaEm ? Date.parse(opcoes.criadaEm) - DIA_MS : Number.NaN;
  const inicio = Math.max(Number.isFinite(criada) ? criada : 0, fim - 40 * DIA_MS);
  return ordenadas
    .filter((m) => {
      const t = Date.parse(m.dateAdded);
      return t >= inicio && t <= fim;
    })
    .slice(-300);
}

// ---------------------------------------------------------------------------
// Resposta do agente (JSON estrito)
// ---------------------------------------------------------------------------

export interface ItemGrade {
  tamanho: string;
  quantidade: number;
}

export interface ModeloAgente {
  descricao: string;
  arte_ref: string;
  legenda_cor_sola: string;
  solado: "Preto" | "Branco" | "colorido" | "desconhecido";
  cor_pintura_solado: string;
  tipo_personalizacao: string;
  grade_adulto: ItemGrade[];
  grade_infantil: ItemGrade[];
  origem_grade: string;
}

export interface RespostaAgente {
  modelos: ModeloAgente[];
  total_pares_declarado: number | null;
  pagamento: { forma: string; valor_unitario: number | null; origem: string };
  frete: { condicao: string; valor_cliente: number | null; origem: string };
  comprovante_refs: string[];
  cartao: { bandeira: string; parcelas: number | null; data_venda: string };
  tipo_pedido: { valor: string; origem: string };
  data_evento: string;
  observacoes: string[];
  duvidas: string[];
}

const texto = { type: "string" } as const;
const itemGrade = (tamanhos: readonly string[]) => ({
  type: "object",
  additionalProperties: false,
  required: ["tamanho", "quantidade"],
  properties: {
    tamanho: { type: "string", enum: [...tamanhos] },
    quantidade: { type: "integer" },
  },
});

export const ESQUEMA_RESPOSTA = {
  type: "object",
  additionalProperties: false,
  required: [
    "modelos",
    "total_pares_declarado",
    "pagamento",
    "frete",
    "comprovante_refs",
    "cartao",
    "tipo_pedido",
    "data_evento",
    "observacoes",
    "duvidas",
  ],
  properties: {
    modelos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "descricao",
          "arte_ref",
          "legenda_cor_sola",
          "solado",
          "cor_pintura_solado",
          "tipo_personalizacao",
          "grade_adulto",
          "grade_infantil",
          "origem_grade",
        ],
        properties: {
          descricao: texto,
          arte_ref: texto,
          legenda_cor_sola: texto,
          solado: { type: "string", enum: ["Preto", "Branco", "colorido", DESCONHECIDO] },
          cor_pintura_solado: texto,
          tipo_personalizacao: texto,
          grade_adulto: { type: "array", items: itemGrade(GRADE_ADULTO) },
          grade_infantil: { type: "array", items: itemGrade(GRADE_INFANTIL) },
          origem_grade: texto,
        },
      },
    },
    total_pares_declarado: { type: ["integer", "null"] },
    pagamento: {
      type: "object",
      additionalProperties: false,
      required: ["forma", "valor_unitario", "origem"],
      properties: {
        forma: { type: "string", enum: [...FORMAS_PAGAMENTO, DESCONHECIDO] },
        valor_unitario: { type: ["number", "null"] },
        origem: texto,
      },
    },
    frete: {
      type: "object",
      additionalProperties: false,
      required: ["condicao", "valor_cliente", "origem"],
      properties: {
        condicao: { type: "string", enum: [...CONDICOES_FRETE, DESCONHECIDO] },
        valor_cliente: { type: ["number", "null"] },
        origem: texto,
      },
    },
    comprovante_refs: { type: "array", items: texto },
    cartao: {
      type: "object",
      additionalProperties: false,
      required: ["bandeira", "parcelas", "data_venda"],
      properties: {
        bandeira: { type: "string", enum: [...BANDEIRAS, DESCONHECIDO] },
        parcelas: { type: ["integer", "null"] },
        data_venda: texto,
      },
    },
    tipo_pedido: {
      type: "object",
      additionalProperties: false,
      required: ["valor", "origem"],
      properties: {
        valor: { type: "string", enum: [...TIPOS_PEDIDO] },
        origem: texto,
      },
    },
    data_evento: texto,
    observacoes: { type: "array", items: texto },
    duvidas: { type: "array", items: texto },
  },
} as const;

export const INSTRUCOES_AGENTE = `Você é a Cami, assistente da Hud Lab (fábrica de chinelos slide personalizados com a marca do cliente). O pedido já foi pago. Sua tarefa é ler a conversa do fechamento e as imagens anexadas e devolver os dados da FICHA DO PEDIDO, que o vendedor vai conferir antes de salvar. Nunca invente: o que não estiver na conversa ou nas imagens fica vazio, null ou "desconhecido", com uma linha em "duvidas".

Como o fechamento costuma acontecer:
- O vendedor manda uma mensagem "*ARTE APROVADA*" ou "*ARTES APROVADAS*" com a "GRADE DE NUMERAÇÕES" de cada modelo e o "TOTAL: N PARES", e anexa a arte aprovada de cada modelo. Essa mensagem do vendedor prevalece sobre listas anteriores do cliente.
- A arte aprovada é uma imagem "Amostra digital" com legendas: "Cor da sola" (com quadradinho de cor), "Cores de serigrafia", "Tipo de personalização" e o nome do cliente. A mesma imagem traz uma tabela de medidas (numeração × cm) que NÃO é a grade do pedido.
- Antes disso o vendedor manda o orçamento final numerado ("1. Pix à vista", "2. Cartão em até 6x sem juros", "3. Em 2x no Pix sem juros (50% + 50%)"), com o preço do par e o frete ("Frete: GRÁTIS" ou "Frete: R$ X"). O cliente responde com o número ou com as palavras. Orçamentos automáticos do começo da conversa (orçamento rápido) são prévias e NÃO valem se houver orçamento posterior.
- Depois o cliente envia o comprovante (imagem ou PDF) e a equipe manda "Status do Pedido: Pagamento Aprovado".

Regras de cada campo:
- modelos: um item por arte aprovada, na ordem em que o vendedor listou as grades. "descricao" é como o modelo é chamado na conversa (ex.: "MODELO PRETO (BCNH centralizado)"). "arte_ref" é o id da imagem da arte aprovada desse modelo (ligue grade e arte pela descrição, pela cor da sola e pela posição do logo); "" se não houver.
- solado: leia a legenda "Cor da sola" da arte e copie o texto lido em "legenda_cor_sola". Preto → "Preto"; Branco → "Branco"; qualquer outra cor → "colorido", com a cor em "cor_pintura_solado" (o solado colorido é pintado e o vendedor escolhe a base). Sem legenda, olhe a sola no desenho; na dúvida, "desconhecido". Se o cliente pedir outra cor de sola depois da arte (ex.: "na cor preta todos"), vale o pedido do cliente e registre isso na origem.
- grades: adulto 34/35 a 44/45 e infantil 28/29 a 32/33, somente tamanhos com quantidade maior que zero. Pares de brinde NÃO entram na grade: vão para "observacoes". Em "origem_grade", o id da mensagem e um trecho curto.
- numeração fora da tabela (ex.: "41/42", "43/44", "29/30"): quando a lista segue a ordem da grade, é erro de digitação; use o tamanho padrão que ocupa aquela POSIÇÃO na sequência (ex.: 34/35, 36/37, 38/39, 40/41, 41/42, 43/44 → o quinto é 42/43 e o sexto é 44/45) e registre a troca em "duvidas" para o vendedor conferir. Nunca descarte pares: a soma tem que continuar batendo com o total.
- total_pares_declarado: o "TOTAL" que o vendedor escreveu, ou null.
- pagamento: forma escolhida pelo cliente ("Pix à vista", "Pix 50/50" para 2x no Pix 50% + 50%, "Cartão de Crédito", boletos) e o preço do par DESSA opção no orçamento final, já com o desconto. Se o orçamento mostra só o preço cheio e o percentual (ex.: "10% de desconto no pix"), calcule o preço com desconto. Nunca use o "Preço normal" quando houver desconto para a opção escolhida. Se o cliente disser só "pix", é Pix à vista.
- frete: "Frete Pago pela Empresa (Frete Grátis)" quando o orçamento final diz frete grátis; "Frete Pago pelo Cliente" com o valor em "valor_cliente" quando diz "Frete: R$ X".
- comprovante_refs: ids dos anexos do cliente que são comprovante de pagamento (não inclua logos nem fotos de referência).
- cartao: só se o pagamento for cartão; leia bandeira, parcelas e data da venda (YYYY-MM-DD) no comprovante, se aparecerem.
- tipo_pedido: "Evento" sempre que houver uma data-limite de uso ou de recebimento combinada na conversa, dita pelo cliente OU pelo vendedor (ex.: "precisaria pro dia 15 de dezembro", "até o dia 11/12 por aí", "antes da semana do dia 7/12", "chegar na primeira semana de dezembro", "antes do natal"). "Amostra" quando é pedido de amostra. "Reposição" só quando repõe pares com defeito ou troca, normalmente sem cobrança; repetir ou replicar um pedido anterior (recompra) NÃO é Reposição. Senão, "Pedido".
- data_evento: a data do EVENTO em si (quando vão usar os chinelos), em YYYY-MM-DD, mesmo que o cliente peça para receber antes (ex.: "seu evento é no dia 15", "preciso receber até dia 10" → 15). Só use a data de recebimento quando não houver data de evento. Sem data, "". Quando a conversa dá só um período ("primeira semana de dezembro", "antes da semana do dia 7/12"), use o dia que fecha o limite (ex.: 2026-12-07) e registre em "duvidas" que a data foi deduzida. Ano: o próximo dia com aquela data a partir da conversa.
- observacoes: brindes, alterações de arte combinadas, embalagem/caixa, pedidos especiais. Frases curtas.
- origem: sempre "msg <id>: trecho curto".`;

// ---------------------------------------------------------------------------
// Montagem do rascunho
// ---------------------------------------------------------------------------

export interface ModeloRascunho {
  modelNumber: number;
  descricao: string;
  soleColor: "Preto" | "Branco" | null;
  soleNote: string | null;
  artUrl: string | null;
  tipoPersonalizacao: string | null;
  adultGrade: Record<string, number>;
  childGrade: Record<string, number>;
  hasChild: boolean;
  origemGrade: string;
}

export interface FichaRascunho {
  modelos: ModeloRascunho[];
  quantityPairs: number | null;
  unitPrice: number | null;
  monetaryValue: number | null;
  paymentForm: string | null;
  cardBrand: string | null;
  cardInstallments: number | null;
  cardSaleDate: string | null;
  freightCondition: string | null;
  freightClientValue: number | null;
  comprovanteUrls: string[];
  orderType: string | null;
  eventDate: string | null;
  /** O que a equipe escreve em "Observação importante" (ex.: "EVENTO 15/12"). */
  observacaoImportante: string | null;
  observacoes: string[];
  avisos: string[];
  origens: Record<string, string>;
}

/** Faixa de preço plausível de um par; fora dela, pares ou valor do negócio estão errados. */
const PRECO_PAR_MIN = 30;
const PRECO_PAR_MAX = 75;

/**
 * Preço do par que fecha com o valor do negócio. O formulário do cadastro exige
 * valor = pares × preço com tolerância de 1 centavo, por isso a equipe usa até
 * 3 casas (ex.: R$ 967,38 ÷ 17 = 56,905).
 */
export function precoDoParPeloNegocio(valorNegocio: number, pares: number): number {
  for (const casas of [2, 3, 4]) {
    const fator = 10 ** casas;
    const preco = Math.round((valorNegocio / pares) * fator) / fator;
    if (Math.abs(preco * pares - valorNegocio) <= 0.01) return preco;
  }
  return Math.round((valorNegocio / pares) * 10_000) / 10_000;
}

export interface ReferenciaAnexo {
  url: string;
  mimeType: string;
}

const moeda = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const centavos = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;
const dataValida = (valor: string) => (/^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function somarGrade(itens: ItemGrade[], tamanhos: readonly string[]): Record<string, number> {
  const grade: Record<string, number> = {};
  for (const { tamanho, quantidade } of itens) {
    if (!tamanhos.includes(tamanho)) continue;
    const q = Math.trunc(Number(quantidade));
    if (!Number.isFinite(q) || q <= 0) continue;
    grade[tamanho] = (grade[tamanho] ?? 0) + q;
  }
  return grade;
}

export const totalDaGrade = (grade: Record<string, number>) =>
  Object.values(grade).reduce((soma, q) => soma + q, 0);

export function montarRascunho(
  resposta: RespostaAgente,
  contexto: { anexos: Map<string, ReferenciaAnexo>; valorNegocio: number | null },
): FichaRascunho {
  const avisos: string[] = [];
  const origens: Record<string, string> = {};

  const modelos: ModeloRascunho[] = resposta.modelos.map((m, i) => {
    const modelNumber = i + 1;
    const adultGrade = somarGrade(m.grade_adulto, GRADE_ADULTO);
    const childGrade = somarGrade(m.grade_infantil, GRADE_INFANTIL);
    const arte = m.arte_ref ? contexto.anexos.get(m.arte_ref) : undefined;
    if (!arte) avisos.push(`Modelo ${modelNumber}: não achei a arte aprovada na conversa.`);
    if (totalDaGrade(adultGrade) + totalDaGrade(childGrade) === 0) {
      avisos.push(`Modelo ${modelNumber}: não achei a grade na conversa.`);
    }

    let soleColor: ModeloRascunho["soleColor"] = null;
    let soleNote: string | null = null;
    if (m.solado === "Preto" || m.solado === "Branco") soleColor = m.solado;
    else if (m.solado === "colorido") {
      const cor = m.cor_pintura_solado.trim() || "cor do cliente";
      soleNote = `Solado colorido (${cor}): escolha a base. Mais claro, Branco; mais escuro, Preto.`;
      avisos.push(`Modelo ${modelNumber}: ${soleNote}`);
    } else {
      avisos.push(`Modelo ${modelNumber}: não consegui ler a cor da sola na arte.`);
    }

    return {
      modelNumber,
      descricao: m.descricao.trim(),
      soleColor,
      soleNote,
      artUrl: arte?.url ?? null,
      tipoPersonalizacao: m.tipo_personalizacao.trim() || null,
      adultGrade,
      childGrade,
      hasChild: totalDaGrade(childGrade) > 0,
      origemGrade: m.origem_grade.trim(),
    };
  });

  const somaGrades = modelos.reduce(
    (soma, m) => soma + totalDaGrade(m.adultGrade) + totalDaGrade(m.childGrade),
    0,
  );
  const declarado = resposta.total_pares_declarado;
  if (declarado !== null && somaGrades > 0 && declarado !== somaGrades) {
    avisos.push(`A soma das grades dá ${somaGrades} pares, mas a mensagem de fechamento diz ${declarado}.`);
  }
  // Sem grade na conversa não há pares confiáveis (um orçamento de 36 pares não é
  // o pedido): o vendedor preenche, e o preço não é calculado sobre um número chutado.
  const quantityPairs = somaGrades > 0 ? somaGrades : null;
  if (somaGrades === 0 && declarado !== null) {
    avisos.push(`A conversa fala em ${declarado} pares, mas sem grade; preencha a grade e os pares.`);
  }

  const forma = resposta.pagamento.forma === DESCONHECIDO ? null : resposta.pagamento.forma;
  if (!forma) avisos.push("Não achei a forma de pagamento escolhida pelo cliente.");
  else origens.paymentForm = resposta.pagamento.origem;

  // Preço do par: o valor do negócio no GHL é o número que o vendedor fechou
  // (e o que o formulário exige bater com pares × preço). A conversa entra como
  // conferência: se diverge, prevalece o negócio e o vendedor vê o aviso.
  const precoConversa =
    resposta.pagamento.valor_unitario !== null && resposta.pagamento.valor_unitario > 0
      ? centavos(resposta.pagamento.valor_unitario)
      : null;
  let unitPrice = precoConversa;
  let monetaryValue: number | null = null;
  if (precoConversa !== null) origens.unitPrice = resposta.pagamento.origem;
  const valorNegocio = contexto.valorNegocio && contexto.valorNegocio > 0 ? contexto.valorNegocio : null;
  if (valorNegocio !== null && quantityPairs) {
    const doNegocio = precoDoParPeloNegocio(valorNegocio, quantityPairs);
    if (doNegocio >= PRECO_PAR_MIN && doNegocio <= PRECO_PAR_MAX) {
      if (precoConversa === null) {
        avisos.push(`Preço do par calculado pelo valor do negócio: ${moeda(valorNegocio)} ÷ ${quantityPairs} pares.`);
      } else if (Math.abs(precoConversa - doNegocio) > 0.02) {
        avisos.push(
          `Na conversa o par aparece a ${moeda(precoConversa)}, mas o valor do negócio (${moeda(valorNegocio)} ÷ ${quantityPairs} pares) dá ${doNegocio.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}. Usei o valor do negócio; confira.`,
        );
      }
      unitPrice = doNegocio;
      origens.unitPrice = `valor do negócio no GHL (${moeda(valorNegocio)} ÷ ${quantityPairs} pares)`;
      monetaryValue = valorNegocio;
    } else {
      avisos.push(
        `O valor do negócio (${moeda(valorNegocio)}) dividido por ${quantityPairs} pares sai fora da faixa de preço: confira os pares e o valor.`,
      );
    }
  }
  if (monetaryValue === null && quantityPairs && unitPrice !== null) {
    monetaryValue = centavos(quantityPairs * unitPrice);
  }
  if (unitPrice === null) avisos.push("Não achei o preço do par da opção escolhida.");

  let condicao = resposta.frete.condicao === DESCONHECIDO ? null : resposta.frete.condicao;
  if (condicao) origens.freightCondition = resposta.frete.origem;
  else if (quantityPairs && quantityPairs >= 36) {
    condicao = "Frete Pago pela Empresa (Frete Grátis)";
    origens.freightCondition = "regra de frete grátis a partir de 36 pares";
    avisos.push("Não achei o frete no orçamento final; pela regra de 36 pares ou mais, deixei frete grátis. Confira.");
  } else avisos.push("Não achei a condição de frete no orçamento final.");
  const freightClientValue =
    condicao === "Frete Pago pelo Cliente" && resposta.frete.valor_cliente !== null
      ? centavos(resposta.frete.valor_cliente)
      : null;
  if (condicao === "Frete Pago pelo Cliente" && freightClientValue === null) {
    avisos.push("O frete é do cliente, mas não achei o valor combinado.");
  }

  const comprovanteUrls = resposta.comprovante_refs
    .map((ref) => contexto.anexos.get(ref)?.url)
    .filter((url): url is string => Boolean(url));
  if (comprovanteUrls.length === 0) avisos.push("Não achei o comprovante de pagamento na conversa.");

  const cartao = forma === "Cartão de Crédito";
  const eventDate = dataValida(resposta.data_evento);
  const observacoes = resposta.observacoes.map((o) => o.trim()).filter(Boolean);
  if (eventDate && !observacoes.some((o) => o.includes(ddmm(eventDate)))) {
    observacoes.unshift(`Evento em ${ddmm(eventDate)}.`);
  }
  origens.orderType = resposta.tipo_pedido.origem;

  return {
    modelos,
    quantityPairs,
    unitPrice,
    monetaryValue,
    paymentForm: forma,
    cardBrand: cartao && resposta.cartao.bandeira !== DESCONHECIDO ? resposta.cartao.bandeira : null,
    cardInstallments: cartao ? resposta.cartao.parcelas : null,
    cardSaleDate: cartao ? dataValida(resposta.cartao.data_venda) : null,
    freightCondition: condicao,
    freightClientValue,
    comprovanteUrls,
    orderType: resposta.tipo_pedido.valor,
    eventDate,
    observacaoImportante:
      resposta.tipo_pedido.valor === "Evento" && eventDate ? `EVENTO ${ddmm(eventDate)}` : null,
    observacoes,
    avisos: [...avisos, ...resposta.duvidas.map((d) => d.trim()).filter(Boolean)],
    origens,
  };
}
