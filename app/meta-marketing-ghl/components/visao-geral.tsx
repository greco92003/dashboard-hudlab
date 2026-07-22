"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, ArrowUpRight, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  fmtBrl,
  fmtNum,
  fmtDataCurta,
  hojeSaoPaulo,
  inicioSemana,
  type Periodo,
  periodoParaDatas,
} from "../lib";

interface Kpis {
  spend: number;
  impressoes: number;
  cliques: number;
  leads: number;
  vendas: number;
  faturamento: number;
  roas: number | null;
  cpa_pedido: number | null;
  cpl: number | null;
  ctr: number | null;
  cpc: number | null;
  pares_vendidos: number | null;
  ticket_medio_par: number | null;
  custo_por_par: number | null;
  mockups: number;
  custo_por_mockup: number | null;
}

interface Resumo {
  atual: Kpis;
  anterior: Kpis;
  variacao_pct: Partial<Record<keyof Kpis, number>>;
}

interface FunilRow {
  pipeline_id: string;
  stage_id: string | null;
  stage_name: string;
  stage_order: number;
  qtd: number;
  pct_primeira_etapa: number | null;
  pct_etapa_anterior: number | null;
}

interface CustoEtapaRow {
  pipeline_id: string;
  stage_name: string;
  stage_order: number;
  qtd: number;
  custo_por_oportunidade: number | null;
}

interface FonteRow {
  fonte: string;
  investimento: number | null;
  leads: number;
  cpl: number | null;
  vendas: number;
  faturamento: number;
  roas: number | null;
}

interface CampanhaRow {
  campaign_name: string;
  spend: number;
  faturamento: number;
  vendas: number;
  roas: number | null;
}

interface SeriePonto {
  bucket: string;
  investimento: number;
  faturamento: number;
  parcial: boolean;
}

type Granularidade = "diario" | "semanal" | "mensal";

// Métricas em que aumento é ruim (custos): inverte a cor da variação
const CUSTO_KEYS = new Set(["spend", "cpa_pedido", "cpl", "cpc", "custo_por_par"]);

function Variacao({ metrica, pct }: { metrica: string; pct?: number }) {
  if (pct == null) return null;
  const subiu = pct > 0;
  const bom = CUSTO_KEYS.has(metrica) ? !subiu : subiu;
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        bom ? "text-emerald-600" : "text-red-600"
      }`}
    >
      <Icone className="h-3 w-3" />
      {Math.abs(pct).toLocaleString("pt-BR")}%
    </span>
  );
}

function bucketDe(dateStr: string, g: Granularidade): string {
  if (g === "diario") return dateStr;
  if (g === "mensal") return `${dateStr.slice(0, 7)}-01`;
  return inicioSemana(dateStr);
}

export function VisaoGeral({ periodo }: { periodo: Periodo }) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [funil, setFunil] = useState<FunilRow[]>([]);
  const [custoEtapa, setCustoEtapa] = useState<CustoEtapaRow[]>([]);
  const [fontes, setFontes] = useState<FonteRow[]>([]);
  const [topCampanhas, setTopCampanhas] = useState<CampanhaRow[]>([]);
  const [saudePct, setSaudePct] = useState<number | null>(null);
  const [metaDiario, setMetaDiario] = useState<{ date: string; spend: number }[]>([]);
  const [vendasDiario, setVendasDiario] = useState<{ venda_em: string; monetary_value: number }[]>([]);
  const [pipelineNomes, setPipelineNomes] = useState<Map<string, string>>(new Map());
  const [granularidade, setGranularidade] = useState<Granularidade>("semanal");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const { inicio, fim } = periodoParaDatas(periodo);
    let cancel = false;
    setLoading(true);
    setErro(null);

    (async () => {
      const [rpc, meta, vendas, funilQ, custoQ, fonteQ, funnelAds, saude, pipes] =
        await Promise.all([
          supabase.rpc("get_resumo_periodo", { p_inicio: inicio, p_fim: fim }),
          supabase
            .from("meta_insights_daily")
            .select("date, spend")
            .gte("date", inicio)
            .lte("date", fim),
          supabase
            .from("v_vendas")
            .select("venda_em, monetary_value")
            .gte("venda_em", `${inicio}T00:00:00`)
            .lte("venda_em", `${fim}T23:59:59`),
          supabase.from("v_funil_etapas").select("*"),
          supabase.from("v_custo_por_etapa").select("*"),
          supabase.from("v_desempenho_fonte").select("*"),
          supabase.rpc("get_funnel_por_anuncio", { p_inicio: inicio, p_fim: fim }),
          supabase
            .from("v_atribuicao_saude")
            .select("semana, pct_com_utm")
            .order("semana", { ascending: false })
            .limit(1),
          supabase
            .from("ghl_opportunities")
            .select("pipeline_id, pipeline_name")
            .not("pipeline_name", "is", null)
            .limit(500),
        ]);
      if (cancel) return;

      if (rpc.error) {
        setErro(rpc.error.message);
        setLoading(false);
        return;
      }
      setResumo(rpc.data as Resumo);
      setMetaDiario(meta.data ?? []);
      setVendasDiario(
        (vendas.data ?? []).filter((v) => v.venda_em) as { venda_em: string; monetary_value: number }[]
      );
      setPipelineNomes(
        new Map(
          (pipes.data ?? []).map((p) => [p.pipeline_id as string, p.pipeline_name as string])
        )
      );
      setFunil((funilQ.data as FunilRow[]) ?? []);
      setCustoEtapa((custoQ.data as CustoEtapaRow[]) ?? []);
      setFontes((fonteQ.data as FonteRow[]) ?? []);
      setSaudePct(saude.data?.[0]?.pct_com_utm ?? null);

      // Top 5 campanhas por ROAS (agregado por campanha)
      const porCampanha = new Map<string, CampanhaRow>();
      for (const r of funnelAds.data ?? []) {
        const nome = r.campaign_name ?? "(sem campanha)";
        let c = porCampanha.get(nome);
        if (!c) {
          c = { campaign_name: nome, spend: 0, faturamento: 0, vendas: 0, roas: null };
          porCampanha.set(nome, c);
        }
        c.spend += Number(r.spend_total) || 0;
        c.faturamento += Number(r.faturamento) || 0;
        c.vendas += Number(r.vendas) || 0;
      }
      const campanhas = [...porCampanha.values()].map((c) => ({
        ...c,
        roas: c.spend > 0 ? c.faturamento / c.spend : null,
      }));
      campanhas.sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1));
      setTopCampanhas(campanhas.slice(0, 5));

      setLoading(false);
    })();

    return () => {
      cancel = true;
    };
  }, [periodo]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-destructive">
          Erro ao carregar resumo: {erro}
        </CardContent>
      </Card>
    );
  }

  const a = resumo!.atual;
  const v = resumo!.variacao_pct;
  const nd = (x: number | null | undefined, fmt: (n: number) => string) =>
    x == null ? "N/D" : fmt(x);

  // CPA/CAC é sempre POR PEDIDO; custo por par é métrica separada
  // (a Hud Lab vende em lote — nunca misturar as duas)
  const kpis: { key: keyof Kpis; label: string; valor: string; sub?: string }[] = [
    { key: "spend", label: "Investimento", valor: fmtBrl(a.spend) },
    { key: "impressoes", label: "Impressões", valor: fmtNum(a.impressoes) },
    {
      key: "cliques",
      label: "Cliques",
      valor: fmtNum(a.cliques),
      sub: `CTR ${nd(a.ctr, (n) => `${n.toLocaleString("pt-BR")}%`)} · CPC ${nd(a.cpc, fmtBrl)}`,
    },
    {
      key: "leads",
      label: "Leads",
      valor: fmtNum(a.leads),
      sub: `CPL ${nd(a.cpl, fmtBrl)}`,
    },
    {
      key: "mockups",
      label: "Solicitações de Mockup",
      valor: fmtNum(a.mockups),
      sub: `Custo/mockup ${nd(a.custo_por_mockup, fmtBrl)}`,
    },
    {
      key: "faturamento",
      label: "Faturamento",
      valor: fmtBrl(a.faturamento),
      sub: `ROAS ${nd(a.roas, (n) => `${n.toLocaleString("pt-BR")}x`)}`,
    },
    {
      key: "vendas",
      label: "Vendas (pedidos)",
      valor: fmtNum(a.vendas),
      sub: `CAC/pedido ${nd(a.cpa_pedido, fmtBrl)}`,
    },
    {
      key: "pares_vendidos",
      label: "Pares vendidos",
      valor: nd(a.pares_vendidos, fmtNum),
      sub: `Custo/par ${nd(a.custo_por_par, fmtBrl)} · Ticket/par ${nd(a.ticket_medio_par, fmtBrl)}`,
    },
  ];

  // Série investimento vs faturamento na granularidade escolhida.
  // O bucket que contém "hoje" está incompleto (semana/mês em
  // andamento) — marcado para não ser lido como uma queda real.
  const bucketAtual = bucketDe(hojeSaoPaulo(), granularidade);
  const buckets = new Map<string, SeriePonto>();
  const get = (b: string) => {
    let p = buckets.get(b);
    if (!p) {
      p = { bucket: b, investimento: 0, faturamento: 0, parcial: b === bucketAtual };
      buckets.set(b, p);
    }
    return p;
  };
  for (const r of metaDiario) {
    get(bucketDe(r.date, granularidade)).investimento += Number(r.spend) || 0;
  }
  for (const vd of vendasDiario) {
    get(bucketDe(vd.venda_em.slice(0, 10), granularidade)).faturamento +=
      Number(vd.monetary_value) || 0;
  }
  const serie = [...buckets.values()].sort((x, y) => x.bucket.localeCompare(y.bucket));
  const ultimoPonto = serie[serie.length - 1];

  const maxFunil = Math.max(1, ...funil.map((f) => f.qtd));
  const maxCusto = Math.max(1, ...custoEtapa.map((c) => c.custo_por_oportunidade ?? 0));
  const totalFontes = fontes.reduce(
    (acc, f) => ({
      investimento: (acc.investimento ?? 0) + (f.investimento ?? 0),
      leads: acc.leads + f.leads,
      vendas: acc.vendas + f.vendas,
      faturamento: acc.faturamento + f.faturamento,
    }),
    { investimento: 0, leads: 0, vendas: 0, faturamento: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Indicador de saúde da atribuição */}
      {saudePct != null && (
        <div
          className={`flex items-center gap-2 text-sm ${
            saudePct < 80 ? "text-red-600" : "text-muted-foreground"
          }`}
        >
          {saudePct < 80 ? (
            <ShieldAlert className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Atribuição: {saudePct.toLocaleString("pt-BR")}% dos leads da última
          semana com UTM — detalhes na aba Saúde da Atribuição
        </div>
      )}

      {/* KPIs com variação vs período anterior */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
        {kpis.map((k) => (
          <Card key={k.key}>
            <CardHeader className="pb-2 px-4 pt-4">
              <CardDescription className="text-xs">{k.label}</CardDescription>
              <CardTitle className="text-xl leading-tight">{k.valor}</CardTitle>
              <div className="min-h-4">
                <Variacao metrica={k.key} pct={v[k.key]} />
              </div>
              {k.sub && (
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {k.sub}
                </p>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Funil de vendas */}
        <Card>
          <CardHeader>
            <CardTitle>Funil de vendas</CardTitle>
            <CardDescription>
              Oportunidades que atingiram cada etapa (desde o início dos
              snapshots diários), por pipeline
            </CardDescription>
          </CardHeader>
          <CardContent>
            {funil.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem snapshots ainda. O funil começa a existir quando o sync-ghl
                roda pela primeira vez.
              </p>
            ) : (
              <div className="space-y-2">
                {[...new Set(funil.map((f) => f.pipeline_id))].map((pid) => (
                  <div key={pid} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase pt-2">
                      {pipelineNomes.get(pid) ?? pid}
                    </p>
                    {funil
                      .filter((f) => f.pipeline_id === pid)
                      .map((f) => (
                        <div key={f.stage_id ?? `${pid}-${f.stage_order}`}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="font-medium truncate">{f.stage_name}</span>
                            <span className="text-muted-foreground">
                              {fmtNum(f.qtd)}
                              {f.pct_primeira_etapa != null &&
                                ` · ${f.pct_primeira_etapa.toLocaleString("pt-BR")}%`}
                            </span>
                          </div>
                          <div className="h-5 rounded bg-muted overflow-hidden">
                            <div
                              className="h-full rounded bg-emerald-600/80"
                              style={{ width: `${(100 * f.qtd) / maxFunil}%` }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Investimento vs Faturamento */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-2">
            <div>
              <CardTitle>Investimento vs. Faturamento</CardTitle>
              <CardDescription>
                Faturamento = oportunidades marcadas como ganhas (won) no GHL
              </CardDescription>
            </div>
            <Tabs
              value={granularidade}
              onValueChange={(g) => setGranularidade(g as Granularidade)}
            >
              <TabsList className="h-8">
                <TabsTrigger value="diario" className="text-xs px-2">
                  Diário
                </TabsTrigger>
                <TabsTrigger value="semanal" className="text-xs px-2">
                  Semanal
                </TabsTrigger>
                <TabsTrigger value="mensal" className="text-xs px-2">
                  Mensal
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {serie.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem dados no período. Rode os syncs para começar a coletar.
              </p>
            ) : (
              <>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={serie}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="bucket"
                        tickFormatter={fmtDataCurta}
                        fontSize={11}
                      />
                      <YAxis
                        tickFormatter={(x: number) => fmtBrl(x)}
                        fontSize={11}
                        width={85}
                      />
                      <Tooltip
                        formatter={(x: number) => fmtBrl(x)}
                        labelFormatter={(bucket: string) =>
                          `${fmtDataCurta(bucket)}${bucket === bucketAtual ? " (em andamento)" : ""}`
                        }
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="investimento"
                        name="Investimento"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="faturamento"
                        name="Faturamento"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {ultimoPonto?.parcial && (
                  <p className="text-xs text-muted-foreground mt-1">
                    * Último ponto ({fmtDataCurta(ultimoPonto.bucket)}) é um{" "}
                    {granularidade === "diario"
                      ? "dia"
                      : granularidade === "semanal"
                        ? "período semanal"
                        : "período mensal"}{" "}
                    em andamento — inclui só os dados até hoje, por isso costuma
                    aparecer mais baixo que o anterior.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Performance por fonte */}
        <Card>
          <CardHeader>
            <CardTitle>Performance por fonte</CardTitle>
            <CardDescription>
              Investimento hoje só é conhecido para Meta Ads — demais fontes
              exibem N/D
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fontes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem leads sincronizados ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fonte</TableHead>
                    <TableHead className="text-right">Invest.</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">CPL</TableHead>
                    <TableHead className="text-right">Faturamento</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fontes.map((f) => (
                    <TableRow key={f.fonte}>
                      <TableCell className="font-medium">{f.fonte}</TableCell>
                      <TableCell className="text-right">
                        {f.investimento == null ? "N/D" : fmtBrl(f.investimento)}
                      </TableCell>
                      <TableCell className="text-right">{fmtNum(f.leads)}</TableCell>
                      <TableCell className="text-right">
                        {f.cpl == null ? "N/D" : fmtBrl(f.cpl)}
                      </TableCell>
                      <TableCell className="text-right">{fmtBrl(f.faturamento)}</TableCell>
                      <TableCell className="text-right">
                        {f.roas == null ? "N/D" : `${f.roas.toLocaleString("pt-BR")}x`}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-medium">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{fmtBrl(totalFontes.investimento)}</TableCell>
                    <TableCell className="text-right">{fmtNum(totalFontes.leads)}</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">{fmtBrl(totalFontes.faturamento)}</TableCell>
                    <TableCell className="text-right">—</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Top 5 campanhas por ROAS */}
        <Card>
          <CardHeader>
            <CardTitle>Top 5 campanhas por ROAS</CardTitle>
            <CardDescription>
              Agregado de todos os anúncios da campanha — detalhes na aba
              Anúncios
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topCampanhas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem campanhas sincronizadas ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campanha</TableHead>
                    <TableHead className="text-right">Invest.</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Faturamento</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCampanhas.map((c) => (
                    <TableRow key={c.campaign_name}>
                      <TableCell className="max-w-52">
                        <span className="truncate block font-medium" title={c.campaign_name}>
                          {c.campaign_name}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{fmtBrl(c.spend)}</TableCell>
                      <TableCell className="text-right">{fmtNum(c.vendas)}</TableCell>
                      <TableCell className="text-right">{fmtBrl(c.faturamento)}</TableCell>
                      <TableCell className="text-right">
                        {c.roas == null ? "—" : `${c.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Custo por etapa */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Custo por etapa do funil</CardTitle>
            <CardDescription>
              Custo médio (investimento Meta acumulado) para levar uma
              oportunidade até cada etapa
            </CardDescription>
          </CardHeader>
          <CardContent>
            {custoEtapa.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem snapshots ainda — o custo por etapa nasce junto com o funil.
              </p>
            ) : (
              <div className="space-y-2">
                {custoEtapa.map((c) => (
                  <div key={c.stage_order + c.pipeline_id}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="font-medium truncate">{c.stage_name}</span>
                      <span className="text-muted-foreground">
                        {c.custo_por_oportunidade == null
                          ? "—"
                          : fmtBrl(c.custo_por_oportunidade)}
                        {` · ${fmtNum(c.qtd)} opps`}
                      </span>
                    </div>
                    <div className="h-5 rounded bg-muted overflow-hidden">
                      <div
                        className="h-full rounded bg-amber-500/80"
                        style={{
                          width: `${(100 * (c.custo_por_oportunidade ?? 0)) / maxCusto}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
