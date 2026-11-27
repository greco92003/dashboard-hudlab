// Regras do Hud Indica (programa de indicação do pós-venda): código e link
// pessoal, leitura da resposta da pesquisa de 3 botões, validação da indicação
// na chegada e no fechamento, liberação do prêmio e os números do painel.
// Módulo puro: sem rede, testado em tests/hud-indica-regras.test.mjs.

export const PREMIO_CENTAVOS = 10_000;
export const VALIDADE_DIAS = 60;
export const SITE = "https://www.hudlab.com.br";

export type Satisfacao = "Nota 10" | "Ficou ok" | "Tive um problema";
export type StatusIndicacao = "recebida" | "invalida" | "fechou" | "liberada" | "paga" | "expirada" | "cancelada";

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Primeiro nome legível ("ANA PAULA SILVA" → "Ana"); "" se não houver. */
export function primeiroNome(nome: string | null | undefined): string {
  const p = String(nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!p) return "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

// Sem 0/o, 1/l/i: o código é lido e digitado por gente.
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * Código do link pessoal: primeiro nome sem acento e 3 caracteres ("ana-x7k").
 * `aleatorio` devolve números em [0, 1) (Math.random em produção; fixo no teste).
 */
export function gerarCodigo(nome: string | null | undefined, aleatorio: () => number = Math.random): string {
  const base = semAcento(primeiroNome(nome)).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "cliente";
  let sufixo = "";
  for (let i = 0; i < 3; i++) sufixo += ALFABETO[Math.floor(aleatorio() * ALFABETO.length) % ALFABETO.length];
  return `${base}-${sufixo}`;
}

/** Mesmo formato que o redirecionamento do site aceita em /indica/<código>. */
export function codigoValido(codigo: string): boolean {
  return /^[A-Za-z0-9_-]{3,40}$/.test(codigo);
}

/** Código como vem do campo "Afiliado" (pode chegar com espaço ou maiúscula). */
export function normalizarCodigo(valor: unknown): string | null {
  const c = String(valor ?? "").trim().toLowerCase();
  return c && codigoValido(c) ? c : null;
}

export function linkDoCodigo(codigo: string): string {
  return `${SITE}/indica/${codigo}`;
}

/**
 * Resposta da pesquisa: o texto do botão (M0) ou do modelo antigo. "Sim, tudo
 * certo" do modelo atual não é uma nota: depois dele a régua manda os 3 botões.
 */
export function lerSatisfacao(resposta: unknown): Satisfacao | null {
  const t = semAcento(String(resposta ?? "")).toLowerCase().trim();
  if (!t) return null;
  if (/nota\s*10|^10$/.test(t)) return "Nota 10";
  if (/ficou\s*ok|^ok$/.test(t)) return "Ficou ok";
  if (/problema/.test(t)) return "Tive um problema";
  return null;
}

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
/** Telefone comparável: últimos 11 dígitos (DDD + número), sem o 55. */
export function telefoneComparavel(v: unknown): string {
  const d = digitos(v);
  return d.length > 11 ? d.slice(-11) : d;
}
const emailComparavel = (v: unknown) => String(v ?? "").trim().toLowerCase();

export interface Pessoa {
  contactId: string;
  telefone?: string | null;
  email?: string | null;
}

export interface Avaliacao {
  valida: boolean;
  motivo: string | null;
}

/**
 * Indicação na chegada do lead: não vale indicar a si mesmo (mesmo contato,
 * telefone ou e-mail) nem quem já é cliente (pedido ganho no contato ou em
 * outro contato com o mesmo telefone ou e-mail).
 */
export function avaliarChegada(entrada: {
  indicador: Pessoa;
  indicado: Pessoa;
  indicadoJaComprou: boolean;
}): Avaliacao {
  const { indicador, indicado } = entrada;
  if (indicador.contactId === indicado.contactId) return { valida: false, motivo: "O indicado é o próprio indicador." };
  const tel = telefoneComparavel(indicado.telefone);
  if (tel.length >= 10 && tel === telefoneComparavel(indicador.telefone)) {
    return { valida: false, motivo: "Mesmo telefone de quem indicou." };
  }
  const email = emailComparavel(indicado.email);
  if (email && email === emailComparavel(indicador.email)) return { valida: false, motivo: "Mesmo e-mail de quem indicou." };
  if (entrada.indicadoJaComprou) return { valida: false, motivo: "Já é cliente: tem pedido ganho." };
  return { valida: true, motivo: null };
}

/** Formas pagas de uma vez: o prêmio sai na validação. As outras esperam o pagamento integral. */
const FORMAS_A_VISTA = ["pix a vista", "cartao de credito", "cartao"];
export function pagoDeUmaVez(forma: string | null | undefined): boolean {
  const f = semAcento(String(forma ?? "")).toLowerCase().trim();
  return FORMAS_A_VISTA.some((x) => f === x || f.startsWith(x));
}

/**
 * Indicação no fechamento (card entrou em Cadastro ERP): dentro dos 60 dias,
 * documento (CNPJ ou CPF) diferente do de quem indicou. À vista libera o
 * prêmio na hora; Pix 50/50 e boleto esperam "Aprovar Financeiro Pedido Total".
 */
export function avaliarFechamento(entrada: {
  status: StatusIndicacao;
  expiraEmMs: number;
  agoraMs: number;
  documentoIndicado: string | null | undefined;
  documentosIndicador: Array<string | null | undefined>;
  formaDePagamento: string | null | undefined;
}): { status: StatusIndicacao; motivo: string | null } {
  if (entrada.status !== "recebida") return { status: entrada.status, motivo: "A indicação não está aguardando fechamento." };
  if (entrada.agoraMs > entrada.expiraEmMs) return { status: "expirada", motivo: `Fechou depois dos ${VALIDADE_DIAS} dias da indicação.` };
  const doc = digitos(entrada.documentoIndicado);
  if (doc.length >= 11 && entrada.documentosIndicador.some((d) => digitos(d) === doc)) {
    return { status: "invalida", motivo: "Mesmo CNPJ ou CPF de quem indicou." };
  }
  return { status: pagoDeUmaVez(entrada.formaDePagamento) ? "liberada" : "fechou", motivo: null };
}

export interface IndicacaoResumo {
  status: StatusIndicacao;
  indicador_id: string;
  premio_centavos: number;
  valor_centavos: number | null;
  criado_em: string;
  pago_em: string | null;
}

export interface NumerosDoPrograma {
  indicadores: number;
  indicadoresAtivos: number;
  adesaoPct: number | null;
  indicacoes: number;
  invalidas: number;
  emAndamento: number;
  fechadas: number;
  conversaoPct: number | null;
  pixAPagar: number;
  pixAPagarCentavos: number;
  pagas: number;
  premiosPagosCentavos: number;
  faturamentoIndicadoCentavos: number;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((1000 * a) / b) / 10 : null);

/** Números da página /indica a partir das linhas do banco. */
export function numerosDoPrograma(indicadores: number, indicacoes: IndicacaoResumo[]): NumerosDoPrograma {
  const validas = indicacoes.filter((i) => i.status !== "invalida" && i.status !== "cancelada");
  const fechadas = validas.filter((i) => i.status === "fechou" || i.status === "liberada" || i.status === "paga");
  const ativos = new Set(validas.map((i) => i.indicador_id)).size;
  const liberadas = indicacoes.filter((i) => i.status === "liberada");
  const pagas = indicacoes.filter((i) => i.status === "paga");
  return {
    indicadores,
    indicadoresAtivos: ativos,
    adesaoPct: pct(ativos, indicadores),
    indicacoes: indicacoes.length,
    invalidas: indicacoes.length - validas.length,
    emAndamento: validas.filter((i) => i.status === "recebida").length,
    fechadas: fechadas.length,
    conversaoPct: pct(fechadas.length, validas.filter((i) => i.status !== "expirada").length),
    pixAPagar: liberadas.length,
    pixAPagarCentavos: liberadas.reduce((s, i) => s + i.premio_centavos, 0),
    pagas: pagas.length,
    premiosPagosCentavos: pagas.reduce((s, i) => s + i.premio_centavos, 0),
    faturamentoIndicadoCentavos: fechadas.reduce((s, i) => s + (i.valor_centavos ?? 0), 0),
  };
}
