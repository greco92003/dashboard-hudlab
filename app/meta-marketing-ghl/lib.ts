// Helpers compartilhados do módulo Meta Marketing GHL

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

export type Periodo = "7d" | "30d" | "90d" | "ano";

export const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "ano", label: "Este ano" },
];

// Datas em America/Sao_Paulo no formato YYYY-MM-DD
export function periodoParaDatas(p: Periodo): { inicio: string; fim: string } {
  const spNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  const fim = fmt(spNow);
  if (p === "ano") return { inicio: `${spNow.getFullYear()}-01-01`, fim };
  const dias = p === "7d" ? 7 : p === "30d" ? 30 : 90;
  const inicio = new Date(spNow);
  inicio.setDate(inicio.getDate() - dias);
  return { inicio: fmt(inicio), fim };
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
