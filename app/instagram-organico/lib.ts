// Helpers compartilhados do módulo Instagram Orgânico

export const num = new Intl.NumberFormat("pt-BR");

export function fmtNum(v: number | null | undefined) {
  return v == null ? "—" : num.format(v);
}

// save_rate/share_rate/engagement_rate vêm da view como fração (0-1)
export function fmtPctFraction(v: number | null | undefined) {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

// ig_reels_avg_watch_time vem em milissegundos
export function fmtWatchTime(ms: number | null | undefined) {
  return ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

// timestamp ISO (com hora/timezone) -> "dd/mm/aaaa" (nunca mm/dd)
export function fmtDataCurta(iso: string) {
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()}`;
}

// coluna `date` pura do Postgres ("YYYY-MM-DD", sem hora) -> "dd/mm/aaaa".
// new Date("YYYY-MM-DD") interpreta a string como UTC meia-noite -- em
// fuso negativo (Brasília, UTC-3) os getters locais (getDate/getMonth)
// voltam um dia. Formatar direto da string evita essa conversão de fuso
// que não faz sentido pra uma data sem hora.
export function fmtDataPura(dataIso: string) {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export type Periodo = "7d" | "30d" | "90d" | "todos";

export const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "todos", label: "Todos" },
];

// Datas em America/Sao_Paulo no formato YYYY-MM-DD; null = sem filtro (todos)
export function periodoParaDatas(p: Periodo): { inicio: string | null; fim: string } {
  const spNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  const fim = fmt(spNow);
  if (p === "todos") return { inicio: null, fim };
  const dias = p === "7d" ? 7 : p === "30d" ? 30 : 90;
  const inicio = new Date(spNow);
  inicio.setDate(inicio.getDate() - dias);
  return { inicio: fmt(inicio), fim };
}

export type SortKey =
  | "timestamp"
  | "views"
  | "reach"
  | "save_rate"
  | "share_rate"
  | "engagement_rate"
  | "avg_watch_time_ms";

export const SORT_OPTIONS: { value: SortKey; label: string; reelsOnly?: boolean }[] = [
  { value: "timestamp", label: "Mais recentes" },
  { value: "views", label: "Views" },
  { value: "reach", label: "Alcance" },
  { value: "save_rate", label: "Taxa de salvamento" },
  { value: "share_rate", label: "Taxa de compartilhamento" },
  { value: "engagement_rate", label: "Taxa de engajamento" },
  { value: "avg_watch_time_ms", label: "Tempo médio assistido", reelsOnly: true },
];
