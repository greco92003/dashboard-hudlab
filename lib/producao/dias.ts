// Painel Produção: rótulo de cada dia, tom de urgência e o status curto de cada
// pedido. Módulo puro, testado em tests/producao-dias.test.mjs.
import {
  getCurrentDateBrasilia,
  getDaysDifference,
  getDaysUntilShipping,
  parseDate,
} from "../programacao/board-dates";

/** Tons translúcidos do tema (app/hud-dashboard.css). */
export type Tom = "tone-rose" | "tone-pink" | "tone-violet" | "tone-slate" | "tone-green" | "tone-sky";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ddmm = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Mesma escala dos quadros: atrasado rosa, até 3 dias magenta, até 7 violeta. */
export function tomPorDias(dias: number | null): Tom {
  if (dias === null) return "tone-pink";
  if (dias < 0) return "tone-rose";
  if (dias <= 3) return "tone-pink";
  if (dias <= 7) return "tone-violet";
  return "tone-slate";
}

/**
 * Título da coluna de um dia: "Hoje · sex 13/11", "Amanhã · sáb 14/11",
 * "Seg 16/11". O que não for data (etapas da Expedição) volta como veio.
 */
export function rotuloDoDia(titulo: string, hoje: Date = getCurrentDateBrasilia()): string {
  const data = parseDate(titulo.trim());
  if (!data) return titulo;
  const dias = getDaysDifference(data, hoje);
  const semana = DIAS[data.getDay()];
  if (dias === 0) return `Hoje · ${semana} ${ddmm(data)}`;
  if (dias === 1) return `Amanhã · ${semana} ${ddmm(data)}`;
  return `${maiuscula(semana)} ${ddmm(data)}`;
}

/** O título do grupo é a data de hoje? (para abrir esse dia de cara) */
export function ehHoje(titulo: string, hoje: Date = getCurrentDateBrasilia()): boolean {
  const data = parseDate(titulo.trim());
  return data !== null && getDaysDifference(data, hoje) === 0;
}

/** Tom do cabeçalho de um grupo (dia, "Em atraso", "Sem data" ou etapa). */
export function tomDoGrupo(grupo: { id: string; title: string }, hoje: Date = getCurrentDateBrasilia()): Tom {
  if (grupo.id === "em-atraso") return "tone-rose";
  if (grupo.id === "recebido") return "tone-green";
  if (grupo.id === "sem-data") return "tone-pink";
  if (grupo.id === "em-conferencia") return "tone-slate";
  const data = parseDate(grupo.title.trim());
  if (!data) return "tone-sky";
  return tomPorDias(getDaysDifference(data, hoje));
}

/** Frase curta da linha do pedido, com o tom da urgência. */
export function statusCurto(
  dataEmbarque: string | null | undefined,
  concluido = false,
): { texto: string; tom: Tom } {
  if (concluido) return { texto: "Recebido", tom: "tone-green" };
  const dias = getDaysUntilShipping(dataEmbarque);
  if (dias === null) return { texto: "Sem data de embarque", tom: "tone-pink" };
  const tom = tomPorDias(dias);
  if (dias < 0) {
    const atraso = Math.abs(dias);
    return { texto: `Atrasado ${atraso} ${atraso === 1 ? "dia" : "dias"}`, tom };
  }
  if (dias === 0) return { texto: "Embarca hoje", tom };
  if (dias === 1) return { texto: "Embarca amanhã", tom };
  return { texto: `Faltam ${dias} dias`, tom };
}

/** Soma de pares de uma lista de pedidos (o campo vem como texto do GHL). */
export function somaDePares(deals: Array<{ quantidadePares: string | null }>): number {
  return deals.reduce((soma, d) => soma + (parseInt(d.quantidadePares || "0", 10) || 0), 0);
}
