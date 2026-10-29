// Configuração da Cami vinda do banco (ai_seller_settings), com os valores do
// código como reserva. Módulo puro.
import { DEFAULT_ALERTS, type AlertSettings } from "./alerts";
import { ASSIGN_MAX_PARES, ASSIGN_MIN_PARES, ESCALATION_SHIFTS } from "./config";
import type { Aviso, FaixaPromocao, Promocao } from "./vigentes";

export type SellerState = "ligada" | "nao_pega_novos" | "desligada";
export type Shift = readonly [start: string, end: string];

export interface SellerSettings {
  estado: SellerState;
  minPares: number;
  maxPares: number;
  /** null = usa AI_SELLER_ESCALATION_USER_ID. */
  escalationUserId: string | null;
  escalationName: string;
  shifts: ReadonlyArray<Shift>;
  /** Para estimar o custo: preço do modelo (US$ por milhão de tokens) e dólar. */
  custo: { entradaUsdPorMilhao: number; saidaUsdPorMilhao: number; dolar: number };
  alertas: AlertSettings;
  /** Regras comerciais vigentes: uma promoção por vez e avisos, cada um com prazo. */
  promocao: Promocao | null;
  avisos: Aviso[];
}

export const DEFAULT_SETTINGS: SellerSettings = {
  estado: "ligada",
  minPares: ASSIGN_MIN_PARES,
  maxPares: ASSIGN_MAX_PARES,
  escalationUserId: null,
  escalationName: "Schay",
  shifts: ESCALATION_SHIFTS,
  custo: { entradaUsdPorMilhao: 2.5, saidaUsdPorMilhao: 15, dolar: 5.4 },
  alertas: DEFAULT_ALERTS,
  promocao: null,
  avisos: [],
};

const MAX_AVISOS = 10;
const MAX_DESCONTO_PCT = 30;

const validDate = (s: unknown): s is string => typeof s === "string" && !Number.isNaN(Date.parse(s));
const trimText = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/** Promoção válida, ou a explicação do que está errado. */
function checkPromocao(value: unknown): { ok: true; value: Promocao } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Promoção inválida" };
  const v = value as Record<string, unknown>;
  const nome = trimText(v.nome);
  if (nome.length < 2 || nome.length > 60) return { ok: false, error: "Dê um nome à promoção (até 60 caracteres)" };
  if (!validDate(v.inicio) || !validDate(v.fim)) return { ok: false, error: "Promoção: informe início e fim" };
  if (Date.parse(v.fim) <= Date.parse(v.inicio)) return { ok: false, error: "Promoção: o fim precisa ser depois do início" };
  const pct = v.descontoPct;
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct <= 0 || pct > MAX_DESCONTO_PCT) {
    return { ok: false, error: `Promoção: desconto entre 0 e ${MAX_DESCONTO_PCT}%` };
  }
  if (!Number.isInteger(v.minPares) || (v.minPares as number) < 12) {
    return { ok: false, error: "Promoção: o mínimo de pares é 12 ou mais" };
  }
  const texto = trimText(v.texto);
  if (texto.length > 300) return { ok: false, error: "Promoção: a frase de apresentação tem até 300 caracteres" };
  const faixas = checkFaixas(v.faixas, v.minPares as number);
  if (!faixas.ok) return faixas;
  return {
    ok: true,
    value: {
      nome,
      inicio: v.inicio,
      fim: v.fim,
      descontoPct: Math.round(pct * 10) / 10,
      minPares: v.minPares as number,
      // Sem faixas extras o objeto fica igual ao de antes, sem o campo.
      ...(faixas.value.length ? { faixas: faixas.value } : {}),
      texto,
    },
  };
}

const MAX_FAIXAS = 6;

/** Faixas acima da primeira: mínimo de pares crescente, cada uma com o próprio %. */
function checkFaixas(
  value: unknown,
  minPrimeira: number,
): { ok: true; value: FaixaPromocao[] } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, error: "Promoção: faixas inválidas" };
  if (value.length > MAX_FAIXAS) return { ok: false, error: `Promoção: no máximo ${MAX_FAIXAS} faixas a mais` };
  const faixas: FaixaPromocao[] = [];
  let anterior = minPrimeira;
  for (const [i, f] of value.entries()) {
    const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
    if (!Number.isInteger(o.minPares) || (o.minPares as number) <= anterior) {
      return { ok: false, error: `Promoção, faixa ${i + 2}: o mínimo de pares precisa ser maior que o da faixa anterior (${anterior})` };
    }
    const fpct = o.descontoPct;
    if (typeof fpct !== "number" || !Number.isFinite(fpct) || fpct <= 0 || fpct > MAX_DESCONTO_PCT) {
      return { ok: false, error: `Promoção, faixa ${i + 2}: desconto entre 0 e ${MAX_DESCONTO_PCT}%` };
    }
    anterior = o.minPares as number;
    faixas.push({ minPares: anterior, descontoPct: Math.round(fpct * 10) / 10 });
  }
  return { ok: true, value: faixas };
}

function checkAvisos(value: unknown): { ok: true; value: Aviso[] } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, error: "Avisos inválidos" };
  if (value.length > MAX_AVISOS) return { ok: false, error: `No máximo ${MAX_AVISOS} avisos` };
  const avisos: Aviso[] = [];
  for (const [i, a] of value.entries()) {
    const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
    const texto = trimText(o.texto);
    if (texto.length < 5 || texto.length > 300) return { ok: false, error: `Aviso ${i + 1}: escreva o aviso (5 a 300 caracteres)` };
    if (!validDate(o.inicio) || !validDate(o.fim)) return { ok: false, error: `Aviso ${i + 1}: informe início e fim` };
    if (Date.parse(o.fim) <= Date.parse(o.inicio)) return { ok: false, error: `Aviso ${i + 1}: o fim precisa ser depois do início` };
    avisos.push({ texto, inicio: o.inicio, fim: o.fim });
  }
  return { ok: true, value: avisos };
}

const validMinutes = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 15 && n <= 24 * 60;

/** Alertas do banco; o resumo diário antigo vinha como horário ("18:30") e conta como ligado. */
function validAlertas(value: unknown): AlertSettings | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!validMinutes(v.passagemSemRespostaMin) || !validMinutes(v.ownerAposMin)) return null;
  return {
    passagemSemRespostaMin: v.passagemSemRespostaMin as number,
    ownerAposMin: v.ownerAposMin as number,
    resumoDiario: typeof v.resumoDiario === "boolean" ? v.resumoDiario : Boolean(v.resumoDiario),
  };
}

function validCusto(value: unknown): SellerSettings["custo"] | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const nums = [v.entradaUsdPorMilhao, v.saidaUsdPorMilhao, v.dolar];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)) return null;
  return {
    entradaUsdPorMilhao: v.entradaUsdPorMilhao as number,
    saidaUsdPorMilhao: v.saidaUsdPorMilhao as number,
    dolar: v.dolar as number,
  };
}

const STATES: readonly SellerState[] = ["ligada", "nao_pega_novos", "desligada"];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function validShifts(value: unknown): ReadonlyArray<Shift> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const shifts: Shift[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [start, end] = item;
    if (typeof start !== "string" || typeof end !== "string") return null;
    if (!HHMM.test(start) || !HHMM.test(end) || start >= end) return null;
    shifts.push([start, end]);
  }
  return shifts.sort((a, b) => a[0].localeCompare(b[0]));
}

/** Linha do banco → configuração; cada campo inválido cai no padrão do código. */
export function normalizeSettings(row: Record<string, unknown> | null | undefined): SellerSettings {
  if (!row) return DEFAULT_SETTINGS;
  const estado = STATES.includes(row.estado as SellerState) ? (row.estado as SellerState) : DEFAULT_SETTINGS.estado;
  const min = Number.isInteger(row.min_pares) ? (row.min_pares as number) : DEFAULT_SETTINGS.minPares;
  const max = Number.isInteger(row.max_pares) ? (row.max_pares as number) : DEFAULT_SETTINGS.maxPares;
  const rangeOk = min >= 12 && max >= min;
  const userId = typeof row.escalation_user_id === "string" && row.escalation_user_id.trim()
    ? row.escalation_user_id.trim()
    : null;
  const name = typeof row.escalation_name === "string" && row.escalation_name.trim()
    ? row.escalation_name.trim()
    : DEFAULT_SETTINGS.escalationName;
  return {
    estado,
    minPares: rangeOk ? min : DEFAULT_SETTINGS.minPares,
    maxPares: rangeOk ? max : DEFAULT_SETTINGS.maxPares,
    escalationUserId: userId,
    escalationName: name,
    shifts: validShifts(row.escalation_shifts) ?? DEFAULT_SETTINGS.shifts,
    custo: validCusto(row.custo) ?? DEFAULT_SETTINGS.custo,
    alertas: validAlertas(row.alertas) ?? DEFAULT_SETTINGS.alertas,
    promocao: row.promocao ? ((p) => (p.ok ? p.value : null))(checkPromocao(row.promocao)) : null,
    avisos: ((a) => (a.ok ? a.value : []))(checkAvisos(row.avisos)),
  };
}

/**
 * O que o owner manda salvar no Controle → linha do banco. Diferente da
 * leitura, aqui valor inválido é recusado com a explicação, nunca trocado
 * pelo padrão em silêncio.
 */
export function validateSettingsInput(
  body: unknown,
): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Corpo inválido" };
  const b = body as Record<string, unknown>;
  if (!STATES.includes(b.estado as SellerState)) return { ok: false, error: "Estado inválido" };
  const min = b.minPares;
  const max = b.maxPares;
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return { ok: false, error: "A faixa de pares precisa ser de números inteiros" };
  }
  if ((min as number) < 12) return { ok: false, error: "O mínimo é 12 pares (pedido mínimo)" };
  if ((max as number) < (min as number)) return { ok: false, error: "O máximo não pode ser menor que o mínimo" };
  const name = typeof b.escalationName === "string" ? b.escalationName.trim() : "";
  if (!name) return { ok: false, error: "Diga o nome de quem recebe as passagens" };
  const userId = typeof b.escalationUserId === "string" ? b.escalationUserId.trim() : "";
  const shifts = validShifts(b.shifts);
  if (!shifts) return { ok: false, error: "Turnos inválidos: use HH:MM e início antes do fim" };
  const custo = validCusto(b.custo);
  if (!custo) return { ok: false, error: "Preço do modelo e dólar precisam ser números maiores que zero" };
  const alertas = validAlertas(b.alertas);
  if (!alertas) return { ok: false, error: "Prazos dos alertas: minutos inteiros entre 15 e 1440" };
  if (alertas.ownerAposMin < alertas.passagemSemRespostaMin) {
    return { ok: false, error: "O aviso para o dono não pode vir antes do aviso para quem recebe as passagens" };
  }
  const promocao = b.promocao == null ? null : checkPromocao(b.promocao);
  if (promocao && !promocao.ok) return { ok: false, error: promocao.error };
  const avisos = checkAvisos(b.avisos);
  if (!avisos.ok) return { ok: false, error: avisos.error };
  return {
    ok: true,
    row: {
      estado: b.estado,
      min_pares: min,
      max_pares: max,
      escalation_user_id: userId || null,
      escalation_name: name,
      escalation_shifts: shifts,
      custo,
      alertas,
      promocao: promocao ? promocao.value : null,
      avisos: avisos.value,
    },
  };
}
