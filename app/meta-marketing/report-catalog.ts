// Lista fechada de relatórios que a rota /api/meta-marketing/report serve.
// Fica fora da rota para o cliente e os testes usarem os mesmos nomes.
export const REPORTS = {
  summary: { rpc: "get_resumo_periodo", period: true },
  series: { rpc: "get_serie_diaria", period: true },
  funnel: { rpc: "get_funil_etapas", period: true },
  sources: { rpc: "get_desempenho_fonte", period: true },
  ads: { rpc: "get_funnel_por_anuncio", period: true },
  "top-campaigns": { rpc: "get_funnel_por_anuncio", period: true },
  "sales-without-pairs": { rpc: "get_vendas_sem_pares", period: true },
  pipelines: { rpc: "get_nomes_pipelines", period: false },
  health: { rpc: "get_atribuicao_saude", period: false },
  "utm-unmatched": { rpc: "get_utm_sem_match", period: false },
  "leads-without-sale": { rpc: "get_leads_sem_venda", period: false },
} as const satisfies Record<string, { rpc: string; period: boolean }>;

export type MarketingReport = keyof typeof REPORTS;

export type ParsedReportRequest =
  | { ok: true; report: MarketingReport; rpc: string; inicio: string | null; fim: string | null }
  | { ok: false };

const MAX_PERIOD_MS = 366 * 86_400_000;

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseReportRequest(params: URLSearchParams): ParsedReportRequest {
  const report = params.get("report") ?? "";
  if (!Object.prototype.hasOwnProperty.call(REPORTS, report)) return { ok: false };
  const entry = REPORTS[report as MarketingReport];
  if (!entry.period) {
    return { ok: true, report: report as MarketingReport, rpc: entry.rpc, inicio: null, fim: null };
  }
  const inicio = params.get("inicio");
  const fim = params.get("fim");
  if (!validDate(inicio) || !validDate(fim) || inicio > fim ||
      Date.parse(fim) - Date.parse(inicio) > MAX_PERIOD_MS) {
    return { ok: false };
  }
  return { ok: true, report: report as MarketingReport, rpc: entry.rpc, inicio, fim };
}
