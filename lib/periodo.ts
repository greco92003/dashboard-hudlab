// Seleção de período compartilhada entre os módulos do dashboard.
// Extraído de app/meta-marketing/lib.ts para que /funil use exatamente o
// mesmo seletor (presets + intervalo personalizado) sem duplicar a regra.

export type Periodo = "7d" | "30d" | "90d" | "ano" | "custom";

export const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "ano", label: "Este ano" },
];

export interface RangeCustom {
  inicio: string;
  fim: string;
}

function hojeSaoPauloDate(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
}

function fmtIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Definição ÚNICA de "últimos N dias" em todo o dashboard: de (hoje - N)
// até hoje, inclusive, em America/Sao_Paulo. Meta Marketing, /funil e
// /dashboard precisam usar esta mesma função -- quando cada tela contava
// "30 dias" do seu jeito (uma por dias corridos, outra "1 mês atrás no mesmo
// dia"), o faturamento do mesmo período divergia em dezenas de milhares de
// reais só por causa de 1-2 dias a mais ou a menos na janela.
export function ultimosDias(dias: number): { inicio: string; fim: string } {
  const spNow = hojeSaoPauloDate();
  const inicio = new Date(spNow);
  inicio.setDate(inicio.getDate() - dias);
  return { inicio: fmtIso(inicio), fim: fmtIso(spNow) };
}

// Datas em America/Sao_Paulo no formato YYYY-MM-DD. Pra "custom", usa o
// range escolhido no calendário (inicio/fim já em YYYY-MM-DD, um único
// dia é só um range com inicio === fim); sem range ainda escolhido, cai
// no mesmo padrão de "30d" pra nunca ficar sem dado.
export function periodoParaDatas(
  p: Periodo,
  custom?: RangeCustom
): { inicio: string; fim: string } {
  if (p === "custom" && custom) return custom;
  if (p === "ano") {
    const spNow = hojeSaoPauloDate();
    return { inicio: `${spNow.getFullYear()}-01-01`, fim: fmtIso(spNow) };
  }
  return ultimosDias(p === "7d" ? 7 : p === "90d" ? 90 : 30);
}

// Converte um Date (do calendário, meio-dia/local) pro formato YYYY-MM-DD
// usado em todo o módulo -- nunca usar toISOString() aqui (converte pra
// UTC e pode mudar o dia dependendo do fuso do navegador).
export function dateParaIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
