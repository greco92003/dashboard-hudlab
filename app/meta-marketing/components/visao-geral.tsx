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
  diaAnterior,
  hojeSaoPaulo,
  janelaComparacao,
  textoComparacao,
  type Periodo,
  type RangeCustom,
  periodoParaDatas,
} from "../lib";

interface Kpis {
  spend: number;
  impressoes: number;
  cliques: number;
  leads: number;
  vendas: number;
  faturamento: number;
  // ROAS geral = faturamento de todas as fontes ÷ gasto do Meta.
  roas: number | null;
  // Só o atribuído a anúncio/campanha do Meta (inclui bio com campanha de
  // origem) -- é a soma do faturamento da aba Anúncios.
  faturamento_meta: number;
  vendas_meta: number;
  roas_meta: number | null;
  cpa_pedido: number | null;
  cpl: number | null;
  ctr: number | null;
  cpc: number | null;
  pares_vendidos: number | null;
  ticket_medio_par: number | null;
  custo_por_par: number | null;
  vendas_sem_pares: number | null;
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
  custo_por_oportunidade: number | null;
  pct_primeira_etapa: number | null;
  pct_etapa_anterior: number | null;
  variacao?: { qtd?: number; custo_por_oportunidade?: number };
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

interface VendaSemParesRow {
  opportunity_id: string;
  contact_id: string;
  first_name: string | null;
  last_name: string | null;
  monetary_value: number;
  dia_venda: string;
}

interface SerieDiaRow {
  dia: string;
  investimento: number;
  faturamento: number;
}

interface SeriePonto {
  bucket: string;
  investimento: number;
  faturamento: number;
  investimentoAnterior: number;
  faturamentoAnterior: number;
}

// Métricas em que aumento é ruim (custos): inverte a cor da variação
const CUSTO_KEYS = new Set([
  "spend",
  "cpa_pedido",
  "cpl",
  "cpc",
  "custo_por_par",
  "custo_por_mockup",
  "custo_por_oportunidade",
]);

// Mesma fórmula usada em anuncios.tsx pro comparativo com período anterior
function calcVariacao(atual: number, anterior: number): number | undefined {
  if (!anterior) return undefined;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

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

export function VisaoGeral({
  periodo,
  customRange,
  refreshKey,
}: {
  periodo: Periodo;
  customRange?: RangeCustom;
  refreshKey?: number;
}) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [funil, setFunil] = useState<FunilRow[]>([]);
  const [fontes, setFontes] = useState<FonteRow[]>([]);
  const [topCampanhas, setTopCampanhas] = useState<CampanhaRow[]>([]);
  const [saudePct, setSaudePct] = useState<number | null>(null);
  const [serieAtual, setSerieAtual] = useState<SerieDiaRow[]>([]);
  const [serieAnterior, setSerieAnterior] = useState<SerieDiaRow[]>([]);
  const [pipelineNomes, setPipelineNomes] = useState<Map<string, string>>(new Map());
  const [vendasSemPares, setVendasSemPares] = useState<VendaSemParesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const selecionado = periodoParaDatas(periodo, customRange);
  // Início recortado na coleta do Meta; a variação compara só dias fechados
  // com o período anterior de mesma duração (ver janelaComparacao).
  const janela = janelaComparacao(selecionado.inicio, selecionado.fim);
  const { inicio, fim } = janela;
  // Gráfico diário: sempre exclui hoje (parcial). Um período personalizado
  // que termina num dia passado já é dado completo.
  const realFim = fim === hojeSaoPaulo() ? diaAnterior(fim) : fim;

  useEffect(() => {
    const supabase = createClient();
    let cancel = false;
    setLoading(true);
    setErro(null);

    const vazio = Promise.resolve({ data: [] as unknown[], error: null });
    const { atualFechado, anterior } = janela;
    // A variação do funil usa a parte fechada do período; quando o período
    // já terminou, é o próprio período e não precisa de outra consulta.
    const precisaFunilFechado = atualFechado != null && atualFechado.fim !== fim;

    (async () => {
      const [rpc, serieQ, serieAntQ, funilQ, funilFechadoQ, funilAntQ, fonteQ, funnelAds, saude, pipes, semPares] =
        await Promise.all([
          supabase.rpc("get_resumo_periodo", { p_inicio: inicio, p_fim: fim }),
          // Somado por dia no banco: ler meta_insights_daily cru esbarrava no
          // limite de 1.000 linhas do PostgREST (chegavam 11 de 30 dias).
          supabase.rpc("get_serie_diaria", { p_inicio: inicio, p_fim: realFim }),
          anterior
            ? supabase.rpc("get_serie_diaria", { p_inicio: anterior.inicio, p_fim: anterior.fim })
            : vazio,
          supabase.rpc("get_funil_etapas", { p_inicio: inicio, p_fim: fim }),
          precisaFunilFechado
            ? supabase.rpc("get_funil_etapas", { p_inicio: atualFechado!.inicio, p_fim: atualFechado!.fim })
            : vazio,
          anterior
            ? supabase.rpc("get_funil_etapas", { p_inicio: anterior.inicio, p_fim: anterior.fim })
            : vazio,
          supabase.rpc("get_desempenho_fonte", { p_inicio: inicio, p_fim: fim }),
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
          // Mesma base e mesmo período do contador "vendas sem pares" do card.
          supabase
            .from("v_vendas_sem_pares")
            .select("*")
            .gte("dia_venda", inicio)
            .lte("dia_venda", fim),
        ]);
      if (cancel) return;

      if (rpc.error) {
        setErro(rpc.error.message);
        setLoading(false);
        return;
      }
      setResumo(rpc.data as Resumo);
      setSerieAtual((serieQ.data as SerieDiaRow[]) ?? []);
      setSerieAnterior((serieAntQ.data as SerieDiaRow[]) ?? []);
      setPipelineNomes(
        new Map(
          (pipes.data ?? []).map((p) => [p.pipeline_id as string, p.pipeline_name as string])
        )
      );
      setVendasSemPares((semPares.data as VendaSemParesRow[]) ?? []);

      const chave = (r: FunilRow) => `${r.pipeline_id}:${r.stage_name}`;
      const funilFechado = (precisaFunilFechado ? funilFechadoQ.data : funilQ.data) as FunilRow[] | null;
      const porEtapaFechada = new Map((funilFechado ?? []).map((r) => [chave(r), r]));
      const porEtapaAnterior = new Map(
        ((funilAntQ.data as FunilRow[]) ?? []).map((r) => [chave(r), r])
      );
      // Quantidade exibida = período inteiro (inclui hoje); variação = dias
      // fechados vs. período anterior de mesma duração.
      const funilMerged = ((funilQ.data as FunilRow[]) ?? []).map((r) => {
        const fechada = porEtapaFechada.get(chave(r));
        const ant = porEtapaAnterior.get(chave(r));
        const variacao: FunilRow["variacao"] = {};
        if (fechada && ant) {
          const vq = calcVariacao(Number(fechada.qtd) || 0, Number(ant.qtd) || 0);
          if (vq !== undefined) variacao.qtd = vq;
          if (fechada.custo_por_oportunidade != null && ant.custo_por_oportunidade != null) {
            const vc = calcVariacao(fechada.custo_por_oportunidade, ant.custo_por_oportunidade);
            if (vc !== undefined) variacao.custo_por_oportunidade = vc;
          }
        }
        return { ...r, variacao };
      });
      setFunil(funilMerged);
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
  }, [periodo, customRange?.inicio, customRange?.fim, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
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
  // Cada métrica secundária (extras) também tem sua própria variação vs
  // período anterior, igual a métrica principal do card.
  const kpis: {
    key: keyof Kpis;
    label: string;
    valor: string;
    extras?: { key: keyof Kpis; label: string; valor: string }[];
  }[] = [
    { key: "spend", label: "Investimento", valor: fmtBrl(a.spend) },
    { key: "impressoes", label: "Impressões", valor: fmtNum(a.impressoes) },
    {
      key: "cliques",
      label: "Cliques",
      valor: fmtNum(a.cliques),
      extras: [
        { key: "ctr", label: "CTR", valor: nd(a.ctr, (n) => `${n.toLocaleString("pt-BR")}%`) },
        { key: "cpc", label: "CPC", valor: nd(a.cpc, fmtBrl) },
      ],
    },
    {
      key: "leads",
      label: "Leads",
      valor: fmtNum(a.leads),
      extras: [{ key: "cpl", label: "CPL", valor: nd(a.cpl, fmtBrl) }],
    },
    {
      key: "mockups",
      label: "Solicitações de Mockup",
      valor: fmtNum(a.mockups),
      extras: [
        { key: "custo_por_mockup", label: "Custo/mockup", valor: nd(a.custo_por_mockup, fmtBrl) },
      ],
    },
    {
      // Faturamento de todas as fontes (bate com o /dashboard). "Do Meta" e
      // "ROAS Meta" isolam o que veio de anúncio ou campanha do Meta; o ROAS
      // geral divide TUDO pelo gasto do Meta.
      key: "faturamento",
      label: "Faturamento",
      valor: fmtBrl(a.faturamento),
      extras: [
        { key: "faturamento_meta", label: "Do Meta", valor: fmtBrl(a.faturamento_meta) },
        { key: "roas_meta", label: "ROAS Meta", valor: nd(a.roas_meta, (n) => `${n.toLocaleString("pt-BR")}x`) },
        { key: "roas", label: "ROAS geral", valor: nd(a.roas, (n) => `${n.toLocaleString("pt-BR")}x`) },
      ],
    },
    {
      key: "vendas",
      label: "Vendas (pedidos)",
      valor: fmtNum(a.vendas),
      extras: [
        { key: "vendas_meta", label: "Do Meta", valor: fmtNum(a.vendas_meta) },
        { key: "cpa_pedido", label: "CAC/pedido", valor: nd(a.cpa_pedido, fmtBrl) },
      ],
    },
    {
      key: "pares_vendidos",
      label: "Pares vendidos",
      valor: nd(a.pares_vendidos, fmtNum),
      extras: [
        { key: "custo_por_par", label: "Custo/par", valor: nd(a.custo_por_par, fmtBrl) },
        { key: "ticket_medio_par", label: "Ticket/par", valor: nd(a.ticket_medio_par, fmtBrl) },
      ],
    },
  ];

  // Ticket/par e Custo/par só são confiáveis na medida em que as vendas
  // tenham a "Quantidade de Pares" preenchida no GHL -- em vez de tentar
  // estimar/assumir um valor pra quem não tem, mostramos quantas faltam
  // e quais são, pra equipe corrigir na origem (ver Card "Negócios sem
  // quantidade de pares" abaixo).
  const temVendasSemPares = (a.vendas_sem_pares ?? 0) > 0;

  // Série diária investimento vs faturamento (já somada por dia no banco),
  // alinhada por posição (dia 0, 1, 2...) com o período anterior de mesma
  // duração -- permite sobrepor as linhas mesmo com datas diferentes. Sem
  // período comparável, as linhas tracejadas não aparecem.
  const temAnterior = serieAnterior.length > 0;
  const serie: SeriePonto[] = serieAtual.map((d, i) => ({
    bucket: d.dia,
    investimento: Number(d.investimento) || 0,
    faturamento: Number(d.faturamento) || 0,
    investimentoAnterior: Number(serieAnterior[i]?.investimento) || 0,
    faturamentoAnterior: Number(serieAnterior[i]?.faturamento) || 0,
  }));

  const maxFunil = Math.max(1, ...funil.map((f) => f.qtd));
  const maxCusto = Math.max(1, ...funil.map((c) => c.custo_por_oportunidade ?? 0));
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

      {/* Contra o que a variação % compara (e recorte no início da coleta) */}
      <p className="text-xs text-muted-foreground">{textoComparacao(janela)}</p>

      {/* KPIs com variação vs período anterior */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {kpis.map((k) => (
          <Card key={k.key}>
            <CardHeader className="pb-2 px-4 pt-4">
              <CardDescription className="text-xs">{k.label}</CardDescription>
              <CardTitle className="text-xl leading-tight">{k.valor}</CardTitle>
              <div className="min-h-4">
                <Variacao metrica={k.key} pct={v[k.key]} />
              </div>
              {k.extras && (
                <div className="space-y-0.5">
                  {k.extras.map((e) => (
                    <p
                      key={e.key}
                      className="text-[11px] text-muted-foreground leading-tight flex items-center gap-1"
                    >
                      <span>
                        {e.label} {e.valor}
                      </span>
                      <Variacao metrica={e.key} pct={v[e.key]} />
                    </p>
                  ))}
                </div>
              )}
              {k.key === "pares_vendidos" && temVendasSemPares && (
                <p className="text-[11px] text-amber-600 leading-tight pt-0.5">
                  {fmtNum(a.vendas_sem_pares)} venda(s) sem qtd. de pares —
                  custo/ticket por par abaixo não as considera
                </p>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Funil de vendas */}
        <Card>
          <CardHeader>
            <CardTitle>Funil de vendas</CardTitle>
            <CardDescription>
              Oportunidades que atingiram cada etapa no período selecionado,
              por pipeline. Variação vs período anterior de mesma duração.
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
                          <div className="flex justify-between items-center text-xs mb-0.5">
                            <span className="font-medium truncate">{f.stage_name}</span>
                            <span className="flex items-center gap-1 text-muted-foreground">
                              {fmtNum(f.qtd)}
                              {f.pct_primeira_etapa != null &&
                                ` · ${f.pct_primeira_etapa.toLocaleString("pt-BR")}%`}
                              <Variacao metrica="qtd" pct={f.variacao?.qtd} />
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
          <CardHeader>
            <CardTitle>Investimento vs. Faturamento</CardTitle>
            <CardDescription>
              Diário, sempre excluindo hoje (dado parcial) · linhas
              tracejadas = período anterior de mesma duração, alinhado por
              dia (só quando já havia dados do Meta nele) · Faturamento =
              pedidos ganhos pelo dia da venda, todas as fontes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {serie.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem dados no período. Rode os syncs para começar a coletar.
              </p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="bucket" tickFormatter={fmtDataCurta} fontSize={11} />
                    <YAxis
                      tickFormatter={(x: number) => fmtBrl(x)}
                      fontSize={11}
                      width={85}
                    />
                    <Tooltip
                      formatter={(x: number) => fmtBrl(x)}
                      labelFormatter={(bucket: string) => fmtDataCurta(bucket)}
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
                    {temAnterior && (
                      <Line
                        type="monotone"
                        dataKey="investimentoAnterior"
                        name="Investimento (período anterior)"
                        stroke="#f59e0b"
                        strokeOpacity={0.45}
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        dot={false}
                      />
                    )}
                    {temAnterior && (
                      <Line
                        type="monotone"
                        dataKey="faturamentoAnterior"
                        name="Faturamento (período anterior)"
                        stroke="#10b981"
                        strokeOpacity={0.45}
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        dot={false}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance por fonte */}
        <Card>
          <CardHeader>
            <CardTitle>Performance por fonte</CardTitle>
            <CardDescription>
              No período selecionado; as somas fecham com os cards acima.
              Investimento só é conhecido para Meta Ads. Meta Ads inclui
              quem chegou pela bio com a campanha de origem; Base antiga são
              clientes do CRM anterior comprando de novo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fontes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem leads sincronizados ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top 5 campanhas por ROAS */}
        <Card>
          <CardHeader>
            <CardTitle>Top 5 campanhas por ROAS</CardTitle>
            <CardDescription>
              Agregado de todos os anúncios da campanha, mais as vendas via
              bio atribuídas a ela. Faturamento = pedidos fechados no período,
              mesmo de lead anterior — detalhes na aba Anúncios
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topCampanhas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem campanhas sincronizadas ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* Negócios sem quantidade de pares -- aponta o dado faltante em
            vez de assumir/estimar um ticket médio a partir de amostra
            parcial (viés de seleção real: só uma parte das vendas tem
            esse campo preenchido no GHL) */}
        {temVendasSemPares && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Negócios sem quantidade de pares</CardTitle>
              <CardDescription>
                Essas vendas não entram no cálculo de Custo/Ticket por par
                acima — preencha &quot;Número Quantidade de Pares&quot; no
                negócio correspondente no GHL pra corrigir.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contato</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendasSemPares.map((r) => (
                      <TableRow key={r.opportunity_id}>
                        <TableCell className="font-medium">
                          {[r.first_name, r.last_name].filter(Boolean).join(" ") || r.contact_id}
                        </TableCell>
                        <TableCell className="text-right">{fmtBrl(r.monetary_value)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {new Date(`${r.dia_venda}T12:00:00`).toLocaleDateString("pt-BR")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Custo por etapa */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Custo por etapa do funil</CardTitle>
            <CardDescription>
              Custo médio (investimento Meta no período selecionado) para
              levar uma oportunidade até cada etapa. Variação vs período
              anterior de mesma duração.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {funil.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem snapshots ainda — o custo por etapa nasce junto com o funil.
              </p>
            ) : (
              <div className="space-y-2">
                {funil.map((c) => (
                  <div key={c.stage_order + c.pipeline_id}>
                    <div className="flex justify-between items-center text-xs mb-0.5">
                      <span className="font-medium truncate">{c.stage_name}</span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {c.custo_por_oportunidade == null
                          ? "—"
                          : fmtBrl(c.custo_por_oportunidade)}
                        {` · ${fmtNum(c.qtd)} opps`}
                        <Variacao metrica="custo_por_oportunidade" pct={c.variacao?.custo_por_oportunidade} />
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
