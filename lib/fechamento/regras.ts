// Painel de fechamento: quando é o próximo follow-up de cada card e de que cor ele fica.
// Módulo puro (sem rede), testado em tests/fechamento-regras.test.mjs.
//
// Regras combinadas com o usuário em 13/11/2026:
// - Cliente escreveu e ninguém respondeu: vermelho, responder já.
// - Janela de 24h aberta e a última palavra é nossa: o follow-up grátis vence no último
//   momento de turno antes de a janela fechar (fecha às 20h → vale até as 18h). Na última
//   hora antes disso o card avisa "última chance".
// - Janela fechada: follow-up a cada 2 dias (por modelo), no começo do turno.
// - Data combinada com o cliente ("me chama sexta") ou adiamento manual mandam no prazo.
// - Parado há mais de 14 dias sem o cliente escrever: cinza, decidir se perde.
import { businessMinutesBetween, isFeriado } from "../ghl/ai-seller/hours";

export type Turnos = ReadonlyArray<readonly [start: string, end: string]>;

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const JANELA_MS = 24 * 60 * 60 * 1000;
/** Follow-up mandado na segunda metade da janela já conta como o "último momento". */
const SEGUNDA_METADE_JANELA_MS = 12 * 60 * 60 * 1000;
const DOIS_DIAS_MS = 2 * DAY_MS;
/** Minutos de turno antes do prazo da janela em que o card pisca "última chance". */
export const ULTIMA_CHANCE_MIN = 60;
const PARADO_MS = 14 * DAY_MS;

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const diaUtil = (localDayMs: number) => {
  const d = new Date(localDayMs).getUTCDay();
  return d >= 1 && d <= 5 && !isFeriado(localDayMs);
};

/** Último instante de turno até `limiteMs` (inclusive). Ex.: limite às 20h → 18h do mesmo dia. */
export function ultimoMomentoDeTurno(limiteMs: number, turnos: Turnos): number {
  const local = limiteMs - BRT_OFFSET_MS;
  let dia = Math.floor(local / DAY_MS) * DAY_MS;
  for (let i = 0; i < 15; i++, dia -= DAY_MS) {
    if (!diaUtil(dia)) continue;
    for (let t = turnos.length - 1; t >= 0; t--) {
      const ini = dia + minutos(turnos[t][0]) * 60_000;
      const fim = dia + minutos(turnos[t][1]) * 60_000;
      if (local >= fim) return fim + BRT_OFFSET_MS;
      if (local >= ini) return local + BRT_OFFSET_MS;
    }
  }
  return limiteMs;
}

/** Primeiro instante de turno a partir de `desdeMs` (inclusive). Ex.: sábado 10h → segunda 8h30. */
export function primeiroMomentoDeTurno(desdeMs: number, turnos: Turnos): number {
  const local = desdeMs - BRT_OFFSET_MS;
  let dia = Math.floor(local / DAY_MS) * DAY_MS;
  for (let i = 0; i < 15; i++, dia += DAY_MS) {
    if (!diaUtil(dia)) continue;
    for (const [inicio, fimTurno] of turnos) {
      const ini = dia + minutos(inicio) * 60_000;
      const fim = dia + minutos(fimTurno) * 60_000;
      if (local < ini) return ini + BRT_OFFSET_MS;
      if (local < fim) return local + BRT_OFFSET_MS;
    }
  }
  return desdeMs;
}

/** Fim do dia de hoje em Brasília (23h59), em ms. */
export function fimDoDia(nowMs: number): number {
  const local = nowMs - BRT_OFFSET_MS;
  return Math.floor(local / DAY_MS) * DAY_MS + DAY_MS - 1 + BRT_OFFSET_MS;
}

export interface EstadoDoCard {
  /** Última mensagem de WhatsApp do cliente (ms). Abre a janela de 24h. */
  ultimaClienteEm: number | null;
  /** Última mensagem nossa no WhatsApp, de pessoa ou automação (ms). */
  ultimaNossaEm: number | null;
  /** A última mensagem de WhatsApp da conversa é do cliente. */
  clienteEsperando: boolean;
  /** "Fiz contato" ou modelo mandado pelo painel (ms). */
  contatoManualEm: number | null;
  /** "Adiar" no painel (ms). */
  adiadoAte: number | null;
  /** Data que o cliente combinou, lida pela Cami (ms, meia-noite de Brasília). */
  dataCombinada: number | null;
  /** Contato com a tag da Cami: é ela quem responde. */
  camiAtendendo: boolean;
  /** Quando o card entrou na etapa (ms). */
  naEtapaDesde: number | null;
}

export type TipoDePrazo = "responder" | "janela" | "dois_dias" | "combinado" | "adiado" | "cami";
export type Cor = "vermelho" | "laranja" | "amarelo" | "verde" | "cinza" | "cami";

export interface Situacao {
  tipo: TipoDePrazo;
  /** Quando vence o próximo passo (ms); null com a Cami. */
  prazoEm: number | null;
  cor: Cor;
  /** Janela de 24h aberta agora: dá para escrever livre. */
  janelaAberta: boolean;
  janelaFechaEm: number | null;
  /** Última hora de turno antes do prazo da janela: piscar. */
  ultimaChance: boolean;
  /** Ordem na lista: menor primeiro. */
  ordem: number;
}

const PESO: Record<Cor, number> = { vermelho: 0, laranja: 1, amarelo: 2, verde: 3, cinza: 4, cami: 5 };

export function situacaoDoCard(e: EstadoDoCard, nowMs: number, turnos: Turnos): Situacao {
  const janelaFechaEm = e.ultimaClienteEm != null ? e.ultimaClienteEm + JANELA_MS : null;
  const janelaAberta = janelaFechaEm != null && nowMs < janelaFechaEm;
  const montar = (tipo: TipoDePrazo, prazoEm: number | null, cor: Cor, ultimaChance = false): Situacao => ({
    tipo,
    prazoEm,
    cor,
    janelaAberta,
    janelaFechaEm,
    ultimaChance,
    // Dentro da cor, o prazo mais antigo primeiro.
    ordem: PESO[cor] * 1e15 + (prazoEm ?? nowMs + 1e14),
  });

  if (e.camiAtendendo) return montar("cami", null, "cami");
  if (e.clienteEsperando) return montar("responder", e.ultimaClienteEm ?? nowMs, "vermelho");

  const ultimoContato = Math.max(e.ultimaNossaEm ?? 0, e.contatoManualEm ?? 0) || null;
  let tipo: TipoDePrazo;
  let prazoEm: number;
  if (e.adiadoAte != null && e.adiadoAte > nowMs) {
    tipo = "adiado";
    prazoEm = e.adiadoAte;
  } else if (e.dataCombinada != null && (ultimoContato == null || e.dataCombinada > ultimoContato)) {
    tipo = "combinado";
    prazoEm = primeiroMomentoDeTurno(e.dataCombinada, turnos);
  } else if (
    janelaAberta &&
    e.ultimaClienteEm != null &&
    (ultimoContato == null || ultimoContato <= e.ultimaClienteEm + SEGUNDA_METADE_JANELA_MS)
  ) {
    tipo = "janela";
    prazoEm = ultimoMomentoDeTurno(janelaFechaEm as number, turnos);
  } else {
    tipo = "dois_dias";
    const base = ultimoContato ?? e.ultimaClienteEm ?? e.naEtapaDesde ?? nowMs;
    prazoEm = primeiroMomentoDeTurno(base + DOIS_DIAS_MS, turnos);
  }

  const ultimoSinalDoCliente = e.ultimaClienteEm ?? e.naEtapaDesde;
  const comDataFutura = (tipo === "adiado" || tipo === "combinado") && prazoEm > nowMs;
  if (!comDataFutura && ultimoSinalDoCliente != null && nowMs - ultimoSinalDoCliente > PARADO_MS) {
    return montar(tipo, prazoEm, "cinza");
  }

  if (prazoEm <= fimDoDia(nowMs)) {
    const ultimaChance =
      tipo === "janela" &&
      janelaAberta &&
      businessMinutesBetween(nowMs, prazoEm, turnos) <= ULTIMA_CHANCE_MIN;
    return montar(tipo, prazoEm, janelaAberta ? "laranja" : "amarelo", ultimaChance);
  }
  return montar(tipo, prazoEm, "verde");
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "hoje 18h", "amanhã 8h30", "sex 15/11 8h30" (Brasília). */
export function quandoTexto(ms: number, nowMs: number): string {
  const l = new Date(ms - BRT_OFFSET_MS);
  const hoje = Math.floor((nowMs - BRT_OFFSET_MS) / DAY_MS);
  const dia = Math.floor((ms - BRT_OFFSET_MS) / DAY_MS);
  const h = l.getUTCHours();
  const m = l.getUTCMinutes();
  const hora = m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
  if (dia === hoje) return `hoje ${hora}`;
  if (dia === hoje + 1) return `amanhã ${hora}`;
  if (dia === hoje - 1) return `ontem ${hora}`;
  const dd = String(l.getUTCDate()).padStart(2, "0");
  const mm = String(l.getUTCMonth() + 1).padStart(2, "0");
  return `${DIAS[l.getUTCDay()]} ${dd}/${mm} ${hora}`;
}

/** "há 3 dias", "há 5 h", "há 20 min". */
export function haQuantoTempo(ms: number, nowMs: number): string {
  const min = Math.max(0, Math.round((nowMs - ms) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

/** A frase do card: o que fazer e até quando. */
export function rotuloDaSituacao(s: Situacao, nowMs: number): string {
  switch (s.tipo) {
    case "cami":
      return "Com a Cami";
    case "responder":
      return `Cliente esperando resposta ${haQuantoTempo(s.prazoEm as number, nowMs)}`;
    case "janela":
      if (s.ultimaChance) return `Última chance de follow-up grátis: até ${quandoTexto(s.prazoEm as number, nowMs)}`;
      return `Follow-up grátis até ${quandoTexto(s.prazoEm as number, nowMs)}`;
    case "combinado":
      return `Combinado com o cliente: ${quandoTexto(s.prazoEm as number, nowMs)}`;
    case "adiado":
      return `Adiado até ${quandoTexto(s.prazoEm as number, nowMs)}`;
    case "dois_dias":
      if (s.cor === "cinza") return "Parado há mais de 14 dias: decidir";
      return (s.prazoEm as number) <= nowMs
        ? `Follow-up atrasado desde ${quandoTexto(s.prazoEm as number, nowMs)}${s.janelaAberta ? "" : " (por modelo)"}`
        : `Próximo follow-up ${quandoTexto(s.prazoEm as number, nowMs)}${s.janelaAberta ? "" : " (por modelo)"}`;
  }
}

export const MOTIVOS_DE_PERDA = [
  "Preço",
  "Frete",
  "Prazo",
  "Sumiu",
  "Comprou de outro",
  "Só pesquisando",
] as const;
export type MotivoDePerda = (typeof MOTIVOS_DE_PERDA)[number];
