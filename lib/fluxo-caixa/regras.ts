/**
 * Regras puras do fluxo de caixa (sem I/O): status das contas, lançamentos
 * de caixa, agrupamento por período, linha de fechamento e mapeamento das
 * contas do Tiny v3 para o espelho no Supabase.
 *
 * Datas são sempre strings `YYYY-MM-DD`. Saídas são negativas.
 */

export type TipoConta = "pagar" | "receber";
export type StatusConta = "paga" | "atrasada" | "a_vencer" | "cancelada";
export type Agrupamento = "dia" | "semana" | "mes";

export type ContaEspelho = {
  tipo: TipoConta;
  tiny_id: number;
  situacao: string;
  data_emissao: string | null;
  data_vencimento: string;
  data_pagamento: string | null;
  valor: number;
  saldo: number;
  historico: string | null;
  numero_documento: string | null;
  contato_id: number | null;
  contato_nome: string | null;
  contato_cpf_cnpj: string | null;
  categoria_id: number | null;
  categoria_nome: string | null;
  forma_pagamento: string | null;
};

export type ContaComStatus = ContaEspelho & { status: StatusConta };

export type Lancamento = { data: string; valor: number; atrasado: boolean };

export type SaldoInicial = { valor: number; data: string };

export type PontoFluxo = {
  inicio: string;
  entradas: number;
  saidas: number;
  resultado: number;
  fechamento: number;
  atrasadoEntradas: number;
  atrasadoSaidas: number;
};

export type ResumoFluxo = {
  saldoInicioPeriodo: number;
  entradas: number;
  saidas: number;
  fechamentoFinal: number;
  atrasadasPagar: { quantidade: number; valor: number };
  atrasadasReceber: { quantidade: number; valor: number };
};

export type UltimaSync = {
  id: number;
  origem: string;
  iniciado_em: string;
  terminado_em: string | null;
  status: "rodando" | "ok" | "erro";
  contas_lidas: number | null;
  contas_removidas: number | null;
  detalhes_pendentes: number | null;
  erro: string | null;
};

export type RespostaFluxo = {
  hoje: string;
  inicio: string;
  fim: string;
  agrupamento: Agrupamento;
  pontos: PontoFluxo[];
  resumo: ResumoFluxo;
  contas: ContaComStatus[];
  saldoInicial: SaldoInicial | null;
  ultimaSync: UltimaSync | null;
  ultimaSyncOk: string | null;
};

/** Conta como o Tiny v3 devolve na listagem ou no detalhe. */
export type TinyContaBruta = {
  id: number;
  situacao?: string | null;
  data?: string | null;
  dataVencimento?: string | null;
  dataLiquidacao?: string | null;
  historico?: string | null;
  valor?: number | string | null;
  saldo?: number | string | null;
  numeroDocumento?: string | null;
  cliente?: { id?: number | null; nome?: string | null; cpfCnpj?: string | null } | null;
  contato?: { id?: number | null; nome?: string | null; cpfCnpj?: string | null } | null;
  categoria?: { id?: number | null; descricao?: string | null } | null;
  formaPagamento?: { nome?: string | null } | number | null;
  meioPagamento?: string | null;
};

const SITUACOES_QUITADAS = new Set(["pago", "recebido", "liquidado"]);
const CENTAVO = 0.004;

export function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function numero(valor: unknown): number {
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** Aceita `YYYY-MM-DD[...]` e `dd/MM/yyyy`. */
export function normalizarData(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/** O Tiny recebe a data da baixa como `dd/MM/yyyy`. */
export function formatarDataTiny(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}

export function hojeEmSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

function paraUtc(data: string): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

export function somarDias(data: string, dias: number): string {
  const d = paraUtc(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(inicio: string, fim: string): number {
  return Math.round((paraUtc(fim).getTime() - paraUtc(inicio).getTime()) / 86_400_000);
}

export function agrupamentoAutomatico(inicio: string, fim: string): Agrupamento {
  const dias = diasEntre(inicio, fim) + 1;
  if (dias <= 45) return "dia";
  if (dias <= 180) return "semana";
  return "mes";
}

export function inicioDoBucket(data: string, agrupamento: Agrupamento): string {
  if (agrupamento === "dia") return data;
  if (agrupamento === "mes") return `${data.slice(0, 7)}-01`;
  const diaSemana = paraUtc(data).getUTCDay(); // 0 = domingo
  return somarDias(data, -((diaSemana + 6) % 7)); // semana começa na segunda
}

export function proximoBucket(inicio: string, agrupamento: Agrupamento): string {
  if (agrupamento === "dia") return somarDias(inicio, 1);
  if (agrupamento === "semana") return somarDias(inicio, 7);
  const d = paraUtc(inicio);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

export function statusDaConta(
  conta: Pick<ContaEspelho, "situacao" | "saldo" | "data_vencimento">,
  hoje: string,
): StatusConta {
  if (conta.situacao === "cancelada") return "cancelada";
  if (SITUACOES_QUITADAS.has(conta.situacao) || conta.saldo <= CENTAVO) return "paga";
  if (conta.data_vencimento < hoje) return "atrasada";
  return "a_vencer";
}

/**
 * Quanto a conta mexe no caixa e quando. A parte paga entra na data de
 * pagamento (ou no vencimento, se o Tiny ainda não informou); o saldo em
 * aberto entra no vencimento, ou hoje se já venceu.
 */
export function lancamentosDaConta(conta: ContaEspelho, hoje: string): Lancamento[] {
  const status = statusDaConta(conta, hoje);
  if (status === "cancelada") return [];
  const sinal = conta.tipo === "pagar" ? -1 : 1;
  const emAberto = status === "paga" ? 0 : Math.max(0, conta.saldo);
  const pago = arredondar(conta.valor - emAberto);
  const lancamentos: Lancamento[] = [];
  if (pago > CENTAVO) {
    lancamentos.push({
      data: conta.data_pagamento ?? conta.data_vencimento,
      valor: arredondar(sinal * pago),
      atrasado: false,
    });
  }
  if (emAberto > CENTAVO) {
    const atrasado = status === "atrasada";
    lancamentos.push({
      data: atrasado ? hoje : conta.data_vencimento,
      valor: arredondar(sinal * emAberto),
      atrasado,
    });
  }
  return lancamentos;
}

/**
 * Monta os pontos do gráfico. O saldo inicial vale para o começo do dia
 * `saldoInicial.data`; o ponto de partida do período é recalculado para
 * frente ou para trás a partir dele.
 */
export function montarFluxo(parametros: {
  contas: ContaEspelho[];
  inicio: string;
  fim: string;
  agrupamento: Agrupamento;
  hoje: string;
  saldoInicial: SaldoInicial | null;
}): { pontos: PontoFluxo[]; resumo: ResumoFluxo } {
  const { contas, fim, agrupamento, hoje } = parametros;
  const inicio = inicioDoBucket(parametros.inicio, agrupamento);
  const saldo = parametros.saldoInicial ?? { valor: 0, data: inicio };

  const pontos: PontoFluxo[] = [];
  const porInicio = new Map<string, PontoFluxo>();
  for (let b = inicio; b <= fim; b = proximoBucket(b, agrupamento)) {
    const ponto: PontoFluxo = {
      inicio: b,
      entradas: 0,
      saidas: 0,
      resultado: 0,
      fechamento: 0,
      atrasadoEntradas: 0,
      atrasadoSaidas: 0,
    };
    pontos.push(ponto);
    porInicio.set(b, ponto);
  }

  let partida = saldo.valor;
  const atrasadasPagar = { quantidade: 0, valor: 0 };
  const atrasadasReceber = { quantidade: 0, valor: 0 };

  for (const conta of contas) {
    if (statusDaConta(conta, hoje) === "atrasada") {
      const alvo = conta.tipo === "pagar" ? atrasadasPagar : atrasadasReceber;
      alvo.quantidade += 1;
      alvo.valor = arredondar(alvo.valor + conta.saldo);
    }
    for (const lancamento of lancamentosDaConta(conta, hoje)) {
      if (lancamento.data < inicio) {
        if (lancamento.data >= saldo.data) partida += lancamento.valor;
        continue;
      }
      if (lancamento.data < saldo.data) partida -= lancamento.valor;
      if (lancamento.data > fim) continue;
      const ponto = porInicio.get(inicioDoBucket(lancamento.data, agrupamento));
      if (!ponto) continue;
      if (lancamento.valor >= 0) {
        ponto.entradas += lancamento.valor;
        if (lancamento.atrasado) ponto.atrasadoEntradas += lancamento.valor;
      } else {
        ponto.saidas += lancamento.valor;
        if (lancamento.atrasado) ponto.atrasadoSaidas += lancamento.valor;
      }
    }
  }

  let corrente = arredondar(partida);
  let entradas = 0;
  let saidas = 0;
  for (const ponto of pontos) {
    ponto.entradas = arredondar(ponto.entradas);
    ponto.saidas = arredondar(ponto.saidas);
    ponto.atrasadoEntradas = arredondar(ponto.atrasadoEntradas);
    ponto.atrasadoSaidas = arredondar(ponto.atrasadoSaidas);
    ponto.resultado = arredondar(ponto.entradas + ponto.saidas);
    corrente = arredondar(corrente + ponto.resultado);
    ponto.fechamento = corrente;
    entradas += ponto.entradas;
    saidas += ponto.saidas;
  }

  return {
    pontos,
    resumo: {
      saldoInicioPeriodo: arredondar(partida),
      entradas: arredondar(entradas),
      saidas: arredondar(saidas),
      fechamentoFinal: corrente,
      atrasadasPagar,
      atrasadasReceber,
    },
  };
}

/** Contas que aparecem nas listas: todas as atrasadas + as do período. */
export function contasDoPeriodo(
  contas: ContaEspelho[],
  inicio: string,
  fim: string,
  hoje: string,
): ContaComStatus[] {
  const resultado: ContaComStatus[] = [];
  for (const conta of contas) {
    const status = statusDaConta(conta, hoje);
    const dataReferencia =
      status === "paga" ? conta.data_pagamento ?? conta.data_vencimento : conta.data_vencimento;
    const noPeriodo = dataReferencia >= inicio && dataReferencia <= fim;
    if (status === "atrasada" || (status !== "cancelada" && noPeriodo)) {
      resultado.push({ ...conta, status });
    }
  }
  return resultado;
}

/** Campos da listagem que, se mudarem, exigem buscar o detalhe de novo. */
export function assinaturaDaListagem(bruta: TinyContaBruta): string {
  return JSON.stringify([
    bruta.situacao ?? null,
    normalizarData(bruta.dataVencimento),
    numero(bruta.valor),
    bruta.saldo === undefined || bruta.saldo === null ? null : numero(bruta.saldo),
    bruta.historico ?? null,
  ]);
}

export function mapearContaTiny(
  tipo: TipoConta,
  listagem: TinyContaBruta,
  detalhe?: TinyContaBruta | null,
): ContaEspelho | null {
  const r: TinyContaBruta = { ...listagem, ...(detalhe ?? {}) };
  const vencimento = normalizarData(r.dataVencimento);
  if (!r.id || !vencimento) return null;

  const situacao = String(r.situacao ?? "aberto").toLowerCase();
  const valor = arredondar(numero(r.valor));
  const semSaldo = SITUACOES_QUITADAS.has(situacao) || situacao === "cancelada";
  const saldo =
    r.saldo === undefined || r.saldo === null
      ? semSaldo ? 0 : valor
      : arredondar(numero(r.saldo));
  const contato = r.cliente ?? r.contato ?? null;
  const forma =
    r.formaPagamento && typeof r.formaPagamento === "object"
      ? r.formaPagamento.nome ?? null
      : r.meioPagamento ?? null;

  return {
    tipo,
    tiny_id: Number(r.id),
    situacao,
    data_emissao: normalizarData(r.data),
    data_vencimento: vencimento,
    data_pagamento: normalizarData(r.dataLiquidacao),
    valor,
    saldo,
    historico: r.historico?.trim() || null,
    numero_documento: r.numeroDocumento?.trim() || null,
    contato_id: contato?.id ?? null,
    contato_nome: contato?.nome?.trim() || null,
    contato_cpf_cnpj: contato?.cpfCnpj?.trim() || null,
    categoria_id: r.categoria?.id ?? null,
    categoria_nome: r.categoria?.descricao?.trim() || null,
    forma_pagamento: forma,
  };
}

/** Extrai a mensagem legível de um erro lançado por `tinyV3Request`. */
export function mensagemDoTiny(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro);
  const corpo = texto.split(/HTTP \d+: /)[1];
  if (!corpo) return texto;
  try {
    const json = JSON.parse(corpo) as {
      mensagem?: string;
      detalhes?: { campo?: string; mensagem?: string }[];
    };
    const detalhes = Array.isArray(json.detalhes)
      ? json.detalhes.map((d) => [d.campo, d.mensagem].filter(Boolean).join(": ")).join("; ")
      : "";
    return [json.mensagem, detalhes].filter(Boolean).join(" — ") || texto;
  } catch {
    return corpo;
  }
}
