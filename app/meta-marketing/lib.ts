// Helpers compartilhados do módulo Meta Marketing

export const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const num = new Intl.NumberFormat("pt-BR");

export function fmtBrl(v: number | null | undefined) {
  return v == null ? "—" : brl.format(v);
}

export function fmtNum(v: number | null | undefined) {
  return v == null ? "—" : num.format(v);
}

export function fmtPct(v: number | null | undefined) {
  return v == null ? "—" : `${num.format(v)}%`;
}

// "2026-07-20" -> "20/07" (formato brasileiro dd/mm, nunca mm/dd)
export function fmtDataCurta(isoDate: string) {
  const [, mes, dia] = isoDate.slice(0, 10).split("-");
  return `${dia}/${mes}`;
}

// Segunda-feira da semana ISO de uma data YYYY-MM-DD
export function inicioSemana(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
  const dia = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dia);
  return d.toISOString().slice(0, 10);
}

// Data de hoje em America/Sao_Paulo, formato YYYY-MM-DD
export function hojeSaoPaulo(): string {
  const spNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  return `${spNow.getFullYear()}-${String(spNow.getMonth() + 1).padStart(2, "0")}-${String(
    spNow.getDate()
  ).padStart(2, "0")}`;
}

// A seleção de período mora em lib/periodo.ts, compartilhada com /funil.
// Reexportado aqui para não quebrar os imports existentes do módulo.
export {
  PERIODOS,
  dateParaIso,
  periodoParaDatas,
  type Periodo,
  type RangeCustom,
} from "@/lib/periodo";

// Um dia antes da data informada (YYYY-MM-DD)
export function diaAnterior(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Soma (ou subtrai, com n negativo) dias a uma data (YYYY-MM-DD)
export function addDias(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Período imediatamente anterior, com a mesma duração (dias) do
// período informado — mesma regra usada em get_resumo_periodo no banco.
export function periodoAnterior(inicio: string, fim: string): { inicio: string; fim: string } {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  const dIni = new Date(`${inicio}T12:00:00`);
  const dFim = new Date(`${fim}T12:00:00`);
  const dias = Math.round((dFim.getTime() - dIni.getTime()) / 86400000);
  const fimAnterior = new Date(dIni);
  fimAnterior.setDate(fimAnterior.getDate() - 1);
  const inicioAnterior = new Date(fimAnterior);
  inicioAnterior.setDate(inicioAnterior.getDate() - dias);
  return { inicio: fmt(inicioAnterior), fim: fmt(fimAnterior) };
}

// Primeiro dia com gasto do Meta e com lead não importado no banco. Antes
// dele o módulo só tem venda antiga, sem gasto nem lead -- ROAS e variação
// não fazem sentido, então os períodos começam aqui. Espelha
// public.meta_inicio_coleta() no banco: se um dia houver backfill anterior,
// mudar nos dois lugares.
export const INICIO_COLETA_META = "2026-07-01";

export interface JanelaComparacao {
  /** Início efetivo do período (recortado no início da coleta). */
  inicio: string;
  fim: string;
  recortadoNaColeta: boolean;
  /** Parte do período usada na variação: só dias fechados (sem hoje). */
  atualFechado: { inicio: string; fim: string } | null;
  /** Período anterior de mesma duração que atualFechado. */
  anterior: { inicio: string; fim: string } | null;
  semComparacao: "sem_dia_fechado" | "anterior_antes_da_coleta" | null;
}

// O TOTAL do período inclui hoje (para bater com o /dashboard), mas a
// VARIAÇÃO % compara só dias fechados com o período anterior de mesma
// duração -- senão o dia de hoje, ainda pela metade, puxa toda variação para
// baixo. Mesma regra de get_resumo_periodo no banco.
export function janelaComparacao(inicio: string, fim: string): JanelaComparacao {
  const ini = inicio < INICIO_COLETA_META ? INICIO_COLETA_META : inicio;
  const ontem = diaAnterior(hojeSaoPaulo());
  const fimFechado = fim < ontem ? fim : ontem;
  const base = { inicio: ini, fim, recortadoNaColeta: ini !== inicio };

  if (fimFechado < ini) {
    return { ...base, atualFechado: null, anterior: null, semComparacao: "sem_dia_fechado" };
  }
  const anterior = periodoAnterior(ini, fimFechado);
  if (anterior.inicio < INICIO_COLETA_META) {
    return { ...base, atualFechado: null, anterior: null, semComparacao: "anterior_antes_da_coleta" };
  }
  return {
    ...base,
    atualFechado: { inicio: ini, fim: fimFechado },
    anterior,
    semComparacao: null,
  };
}

// Frase curta explicando contra o que a variação % está comparando.
export function textoComparacao(j: JanelaComparacao): string {
  const coleta = `${fmtDataCurta(INICIO_COLETA_META)}/${INICIO_COLETA_META.slice(0, 4)}`;
  const recorte = j.recortadoNaColeta
    ? `Dados desde ${coleta}, início da coleta do Meta. `
    : "";
  if (j.semComparacao === "anterior_antes_da_coleta") {
    return `${recorte}Sem variação: o período anterior começaria antes de ${coleta}, quando ainda não havia dados do Meta.`;
  }
  if (j.semComparacao === "sem_dia_fechado") {
    return `${recorte}Sem variação: o período ainda não tem nenhum dia fechado.`;
  }
  const a = j.atualFechado!;
  const b = j.anterior!;
  return `${recorte}Variação compara dias fechados: ${fmtDataCurta(a.inicio)}–${fmtDataCurta(a.fim)} vs. ${fmtDataCurta(b.inicio)}–${fmtDataCurta(b.fim)}.`;
}
