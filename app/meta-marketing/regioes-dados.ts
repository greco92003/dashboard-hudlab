export interface UfMesRow {
  uf: string; region_group: string | null; mes: string; estacao: string;
  spend: number; leads_meta: number; leads_ghl: number; mockups: number; vendas: number; faturamento: number;
}
export interface UfTotal {
  uf: string; region_group: string | null; spend: number; mockups: number;
  vendas: number; faturamento: number; roas: number | null; custo_mockup: number | null;
}
export interface SazonalidadeRow {
  region_group: string; estacao: string; spend: number; vendas: number;
  faturamento: number; roas: number | null; cpa: number | null;
}
export type MetricaRegiao = "roas" | "spend" | "custo_mockup" | "faturamento";

export const METRICAS_REGIAO: Record<MetricaRegiao, { label: string; escala: "sequential" | "sequential-inverted" }> = {
  roas: { label: "ROAS", escala: "sequential" },
  spend: { label: "Investimento", escala: "sequential" },
  custo_mockup: { label: "Custo/Mockup", escala: "sequential-inverted" },
  faturamento: { label: "Faturamento", escala: "sequential" },
};

// PostgREST devolve numeric como string às vezes
const num = (x: unknown): number => Number(x) || 0;
const round2 = (x: number): number => Math.round(x * 100) / 100;

export function somarPorUf(rows: UfMesRow[]): UfTotal[] {
  const map = new Map<string, UfTotal>();
  for (const r of rows) {
    let t = map.get(r.uf);
    if (!t) {
      t = { uf: r.uf, region_group: null, spend: 0, mockups: 0, vendas: 0, faturamento: 0, roas: null, custo_mockup: null };
      map.set(r.uf, t);
    }
    if (t.region_group === null && r.region_group != null) t.region_group = r.region_group;
    t.spend += num(r.spend);
    t.mockups += num(r.mockups);
    t.vendas += num(r.vendas);
    t.faturamento += num(r.faturamento);
  }
  for (const t of map.values()) {
    t.roas = t.spend > 0 ? t.faturamento / t.spend : null;
    t.custo_mockup = t.mockups > 0 ? t.spend / t.mockups : null;
  }
  return [...map.values()];
}

export function sazonalidade(rows: UfMesRow[]): SazonalidadeRow[] {
  const map = new Map<string, SazonalidadeRow>();
  for (const r of rows) {
    if (r.region_group == null) continue;
    const key = `${r.region_group}|${r.estacao}`;
    let s = map.get(key);
    if (!s) {
      s = { region_group: r.region_group, estacao: r.estacao, spend: 0, vendas: 0, faturamento: 0, roas: null, cpa: null };
      map.set(key, s);
    }
    s.spend += num(r.spend);
    s.vendas += num(r.vendas);
    s.faturamento += num(r.faturamento);
  }
  for (const s of map.values()) {
    s.roas = s.spend > 0 ? round2(s.faturamento / s.spend) : null;
    s.cpa = s.vendas > 0 ? round2(s.spend / s.vendas) : null;
  }
  return [...map.values()];
}

export function valorMetrica(t: UfTotal, m: MetricaRegiao): number | null {
  switch (m) {
    case "roas": return t.roas;
    case "custo_mockup": return t.custo_mockup;
    case "spend": return t.spend;
    case "faturamento": return t.faturamento;
  }
}
