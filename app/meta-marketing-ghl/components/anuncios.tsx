"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, ArrowUpDown, ArrowUpRight } from "lucide-react";
import { fmtBrl, fmtNum, periodoAnterior, periodoParaDatas, type Periodo } from "../lib";

// Todas as métricas numéricas da tabela têm comparativo vs período
// anterior — quantidade E valor/custo, não só contagem.
const VAR_KEYS = [
  "spend_total",
  "leads_ghl",
  "custo_por_lead",
  "orcamentos",
  "valor_orcamentos",
  "pares_orcamentos",
  "custo_por_orcamento",
  "mockups",
  "custo_por_mockup",
  "negociacoes",
  "custo_por_negociacao",
  "vendas",
  "faturamento",
  "cpa_venda",
  "roas",
] as const;
type VarKey = (typeof VAR_KEYS)[number];
// Métricas de custo: subir é ruim, inverte a cor do badge de variação.
const VAR_CUSTO: Partial<Record<VarKey, boolean>> = {
  spend_total: true,
  custo_por_lead: true,
  custo_por_orcamento: true,
  custo_por_mockup: true,
  custo_por_negociacao: true,
  cpa_venda: true,
};

interface FunnelRow {
  ad_id: string;
  ad_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  spend_total: number;
  impressoes: number | null;
  cliques: number | null;
  leads_meta: number | null;
  cpl_meta: number | null;
  leads_ghl: number;
  orcamentos: number;
  valor_orcamentos: number;
  pares_orcamentos: number | null;
  mockups: number;
  negociacoes: number;
  vendas: number;
  faturamento: number;
  pares_vendidos: number | null;
  custo_por_lead: number | null;
  custo_por_orcamento: number | null;
  custo_por_mockup: number | null;
  custo_por_negociacao: number | null;
  cpa_venda: number | null;
  taxa_conversao_lead_venda: number | null;
  roas: number | null;
  diagnostico: string;
  variacao?: Partial<Record<VarKey, number>>;
}

function calcVariacao(atual: number, anterior: number): number | undefined {
  if (!anterior) return undefined;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

type Nivel = "anuncio" | "conjunto" | "campanha";

const NIVEIS: { value: Nivel; label: string }[] = [
  { value: "anuncio", label: "Anúncio" },
  { value: "conjunto", label: "Conjunto de Anúncios" },
  { value: "campanha", label: "Campanha" },
];

// Chave de agrupamento por nível. Linhas sem nome conhecido (ad_id
// numérico nunca visto em meta_insights_daily) sempre caem no mesmo balde
// "_sem_investimento", em qualquer nível -- não faz sentido agrupar por
// campaign_id/adset_id que também não existem pra essas linhas.
function chaveNivel(r: FunnelRow, nivel: Nivel): string {
  if (r.ad_name == null) return "_sem_investimento";
  if (nivel === "campanha") return r.campaign_id ?? "_sem_investimento";
  if (nivel === "conjunto") return r.adset_id ?? "_sem_investimento";
  return r.ad_id;
}

// Agrega linhas no nível de anúncio (vindas de get_funnel_por_anuncio) pro
// nível escolhido -- soma os totais brutos e recalcula toda métrica
// derivada (R$/lead, ROAS etc.) a partir dos totais agregados, nunca
// somando ou fazendo média de uma métrica que já é uma razão.
function agruparPorNivel(rows: FunnelRow[], nivel: Nivel): FunnelRow[] {
  const grupos = new Map<string, FunnelRow[]>();
  for (const r of rows) {
    const chave = chaveNivel(r, nivel);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(r);
  }

  return [...grupos.entries()].map(([chave, itens]) => {
    const soma = (key: keyof FunnelRow) =>
      itens.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
    const spend = soma("spend_total");
    const leads = soma("leads_ghl");
    const orcamentos = soma("orcamentos");
    const mockups = soma("mockups");
    const negociacoes = soma("negociacoes");
    const vendas = soma("vendas");
    const faturamento = soma("faturamento");
    const leadsMeta = soma("leads_meta");
    const round2 = (n: number) => Math.round(n * 100) / 100;

    if (chave === "_sem_investimento") {
      return {
        ad_id: "_sem_investimento",
        ad_name: "Sem investimento conhecido",
        campaign_id: null,
        campaign_name: `${itens.length} anúncio(s) sem dado de investimento no Meta (provavelmente de antes do início da coleta)`,
        adset_id: null,
        adset_name: null,
        spend_total: 0,
        impressoes: null,
        cliques: null,
        leads_meta: null,
        cpl_meta: null,
        leads_ghl: leads,
        orcamentos,
        valor_orcamentos: soma("valor_orcamentos"),
        pares_orcamentos: soma("pares_orcamentos"),
        mockups,
        negociacoes,
        vendas,
        faturamento,
        pares_vendidos: soma("pares_vendidos"),
        custo_por_lead: null,
        custo_por_orcamento: null,
        custo_por_mockup: null,
        custo_por_negociacao: null,
        cpa_venda: null,
        taxa_conversao_lead_venda: leads > 0 ? round2((100 * vendas) / leads) : null,
        roas: null,
        diagnostico: "REVISAR",
      };
    }

    const primeiro = itens[0];
    const nome =
      nivel === "campanha" ? primeiro.campaign_name
      : nivel === "conjunto" ? primeiro.adset_name
      : primeiro.ad_name;
    const subtitulo =
      nivel === "campanha"
        ? `${new Set(itens.map((r) => r.adset_id)).size} conjunto(s) · ${itens.length} anúncio(s)`
        : primeiro.campaign_name;
    const roas = spend > 0 ? round2(faturamento / spend) : null;

    return {
      ad_id: chave,
      ad_name: nome,
      campaign_id: primeiro.campaign_id,
      campaign_name: subtitulo,
      adset_id: primeiro.adset_id,
      adset_name: primeiro.adset_name,
      spend_total: spend,
      impressoes: soma("impressoes"),
      cliques: soma("cliques"),
      leads_meta: leadsMeta,
      cpl_meta: leadsMeta > 0 ? round2(spend / leadsMeta) : null,
      leads_ghl: leads,
      orcamentos,
      valor_orcamentos: soma("valor_orcamentos"),
      pares_orcamentos: soma("pares_orcamentos"),
      mockups,
      negociacoes,
      vendas,
      faturamento,
      pares_vendidos: soma("pares_vendidos"),
      custo_por_lead: leads > 0 ? round2(spend / leads) : null,
      custo_por_orcamento: orcamentos > 0 ? round2(spend / orcamentos) : null,
      custo_por_mockup: mockups > 0 ? round2(spend / mockups) : null,
      custo_por_negociacao: negociacoes > 0 ? round2(spend / negociacoes) : null,
      cpa_venda: vendas > 0 ? round2(spend / vendas) : null,
      taxa_conversao_lead_venda: leads > 0 ? round2((100 * vendas) / leads) : null,
      roas,
      diagnostico: roas != null && roas >= 2 ? "GERA VENDA" : "REVISAR",
    };
  });
}

function VarBadge({ pct, custo }: { pct: number | undefined; custo?: boolean }) {
  if (pct == null) return null;
  const subiu = pct > 0;
  const bom = custo ? !subiu : subiu;
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
        bom ? "text-emerald-600" : "text-red-600"
      }`}
    >
      <Icone className="h-2.5 w-2.5" />
      {Math.abs(pct).toLocaleString("pt-BR")}%
    </span>
  );
}

function Valor({
  children,
  varKey,
  variacao,
}: {
  children: React.ReactNode;
  varKey: VarKey;
  variacao?: Partial<Record<VarKey, number>>;
}) {
  return (
    <div className="flex flex-col items-end">
      <span>{children}</span>
      <VarBadge pct={variacao?.[varKey]} custo={VAR_CUSTO[varKey]} />
    </div>
  );
}

interface LeadFrioRow {
  ad_id: string;
  ad_name: string | null;
  campaign_name: string | null;
  qtd_leads_frios: number;
  spend: number;
  custo_por_lead_frio: number | null;
}

type SortKey = keyof FunnelRow;

function DiagnosticoBadge({ valor }: { valor: string }) {
  if (valor === "GERA VENDA") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
        GERA VENDA
      </Badge>
    );
  }
  if (valor === "LEAD BARATO VENDA CARA") {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-500 text-white">
        LEAD BARATO VENDA CARA
      </Badge>
    );
  }
  return <Badge variant="secondary">REVISAR</Badge>;
}

export function Anuncios({ periodo }: { periodo: Periodo }) {
  const [rawAtual, setRawAtual] = useState<FunnelRow[]>([]);
  const [rawAnterior, setRawAnterior] = useState<FunnelRow[]>([]);
  const [frios, setFrios] = useState<LeadFrioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [nivel, setNivel] = useState<Nivel>("anuncio");
  const [sortKey, setSortKey] = useState<SortKey>("spend_total");
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const { inicio, fim } = periodoParaDatas(periodo);
    const anterior = periodoAnterior(inicio, fim);
    let cancel = false;
    setLoading(true);
    (async () => {
      const [atual, anteriorQ, leadsFrios] = await Promise.all([
        supabase.rpc("get_funnel_por_anuncio", { p_inicio: inicio, p_fim: fim }),
        supabase.rpc("get_funnel_por_anuncio", {
          p_inicio: anterior.inicio,
          p_fim: anterior.fim,
        }),
        supabase.from("v_leads_sem_venda").select("*"),
      ]);
      if (cancel) return;

      setRawAtual((atual.data as FunnelRow[]) ?? []);
      setRawAnterior((anteriorQ.data as FunnelRow[]) ?? []);
      setFrios((leadsFrios.data as LeadFrioRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [periodo]);

  // Agrupamento é 100% client-side a partir do nível de anúncio já
  // buscado -- trocar o seletor de nível não refaz a busca no banco, só
  // reagrupa os mesmos dados (atual e período anterior, pra variação
  // refletir o total agregado, não a média dos anúncios individuais).
  const rows = useMemo(() => {
    const atualAgrupado = agruparPorNivel(rawAtual, nivel);
    const anteriorAgrupado = agruparPorNivel(rawAnterior, nivel);
    const porChaveAnterior = new Map(anteriorAgrupado.map((r) => [r.ad_id, r]));
    return atualAgrupado.map((r) => {
      const ant = porChaveAnterior.get(r.ad_id);
      const variacao: Partial<Record<VarKey, number>> = {};
      if (ant) {
        for (const k of VAR_KEYS) {
          const v = calcVariacao(Number(r[k]) || 0, Number(ant[k]) || 0);
          if (v !== undefined) variacao[k] = v;
        }
      }
      return { ...r, variacao };
    });
  }, [rawAtual, rawAnterior, nivel]);

  // A linha "Sem investimento conhecido" (agrupamento de ad_ids nunca
  // vistos em meta_insights_daily) sempre fica no fim da tabela, fora do
  // sort normal, e some durante busca por nome (não representa uma
  // campanha/anúncio específico pra procurar).
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const comNome = rows.filter((r) => r.ad_id !== "_sem_investimento");
    const semNome = rows.find((r) => r.ad_id === "_sem_investimento");

    const filtradas = q
      ? comNome.filter(
          (r) =>
            (r.ad_name ?? "").toLowerCase().includes(q) ||
            (r.campaign_name ?? "").toLowerCase().includes(q) ||
            r.ad_id.includes(q)
        )
      : comNome;

    const ordenadas = [...filtradas].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const na = typeof va === "number" ? va : va == null ? -Infinity : NaN;
      const nb = typeof vb === "number" ? vb : vb == null ? -Infinity : NaN;
      let cmp: number;
      if (!Number.isNaN(na) && !Number.isNaN(nb)) cmp = na - nb;
      else cmp = String(va ?? "").localeCompare(String(vb ?? ""));
      return sortDesc ? -cmp : cmp;
    });

    if (q || !semNome) return ordenadas;
    return [...ordenadas, semNome];
  }, [rows, busca, sortKey, sortDesc]);

  const th = (key: SortKey, label: string, right = true) => (
    <TableHead
      className={`cursor-pointer select-none whitespace-nowrap ${right ? "text-right" : ""}`}
      onClick={() => {
        if (sortKey === key) setSortDesc(!sortDesc);
        else {
          setSortKey(key);
          setSortDesc(true);
        }
      }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${sortKey === key ? "opacity-100" : "opacity-30"}`}
        />
      </span>
    </TableHead>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-96" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Funil por anúncio</CardTitle>
          <CardDescription>
            Leads = coorte criada no período selecionado; marcos = alcançados
            até agora. Variação % comparada ao período anterior de mesma
            duração. Valor e pares contam a partir de Orçamento Gerado (não é
            o valor final — mede o anúncio no caminho); venda = status ganho
            (won). Lead time ~35 dias.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Input
              placeholder="Buscar por anúncio, campanha ou ad_id..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-sm"
            />
            <Select value={nivel} onValueChange={(v) => setNivel(v as Nivel)}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NIVEIS.map((n) => (
                  <SelectItem key={n.value} value={n.value}>
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {visiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum anúncio encontrado. Rode o sync-meta para popular os dados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {th("ad_name", NIVEIS.find((n) => n.value === nivel)!.label, false)}
                    {th("spend_total", "Invest.")}
                    {th("leads_ghl", "Leads")}
                    {th("custo_por_lead", "R$/Lead")}
                    {th("orcamentos", "Orçam.")}
                    {th("valor_orcamentos", "Valor Orç.")}
                    {th("pares_orcamentos", "Pares Orç.")}
                    {th("custo_por_orcamento", "R$/Orç.")}
                    {th("mockups", "Mockups")}
                    {th("custo_por_mockup", "R$/Mockup")}
                    {th("negociacoes", "Negoc.")}
                    {th("custo_por_negociacao", "R$/Negoc.")}
                    {th("vendas", "Vendas")}
                    {th("faturamento", "Faturamento")}
                    {th("cpa_venda", "R$/Venda")}
                    {th("roas", "ROAS")}
                    {th("diagnostico", "Diagnóstico", false)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((r) => (
                    <TableRow key={r.ad_id}>
                      <TableCell className="max-w-64">
                        <div className="truncate font-medium" title={r.ad_name ?? r.ad_id}>
                          {r.ad_name ?? r.ad_id}
                        </div>
                        <div className="truncate text-xs text-muted-foreground" title={r.campaign_name ?? ""}>
                          {r.campaign_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="spend_total" variacao={r.variacao}>
                          {fmtBrl(r.spend_total)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="leads_ghl" variacao={r.variacao}>
                          {fmtNum(r.leads_ghl)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="custo_por_lead" variacao={r.variacao}>
                          {fmtBrl(r.custo_por_lead)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="orcamentos" variacao={r.variacao}>
                          {fmtNum(r.orcamentos)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="valor_orcamentos" variacao={r.variacao}>
                          {fmtBrl(r.valor_orcamentos)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="pares_orcamentos" variacao={r.variacao}>
                          {fmtNum(r.pares_orcamentos)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="custo_por_orcamento" variacao={r.variacao}>
                          {fmtBrl(r.custo_por_orcamento)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="mockups" variacao={r.variacao}>
                          {fmtNum(r.mockups)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="custo_por_mockup" variacao={r.variacao}>
                          {fmtBrl(r.custo_por_mockup)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="negociacoes" variacao={r.variacao}>
                          {fmtNum(r.negociacoes)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="custo_por_negociacao" variacao={r.variacao}>
                          {fmtBrl(r.custo_por_negociacao)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="vendas" variacao={r.variacao}>
                          {fmtNum(r.vendas)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="faturamento" variacao={r.variacao}>
                          {fmtBrl(r.faturamento)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="cpa_venda" variacao={r.variacao}>
                          {fmtBrl(r.cpa_venda)}
                        </Valor>
                      </TableCell>
                      <TableCell className="text-right">
                        <Valor varKey="roas" variacao={r.variacao}>
                          {r.roas != null ? `${r.roas}x` : "—"}
                        </Valor>
                      </TableCell>
                      <TableCell>
                        {r.ad_id === "_sem_investimento" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <DiagnosticoBadge valor={r.diagnostico} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leads frios</CardTitle>
          <CardDescription>
            Contatos com mais de 35 dias (lead time do produto) sem nenhuma
            venda, por anúncio —
            detecta anúncios que queimam verba com lead ruim
          </CardDescription>
        </CardHeader>
        <CardContent>
          {frios.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum lead frio identificado ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anúncio</TableHead>
                    <TableHead className="text-right">Leads frios</TableHead>
                    <TableHead className="text-right">Investimento</TableHead>
                    <TableHead className="text-right">Custo por lead frio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {frios.map((r) => (
                    <TableRow key={r.ad_id}>
                      <TableCell className="max-w-64">
                        <div className="truncate font-medium" title={r.ad_name ?? r.ad_id}>
                          {r.ad_name ?? r.ad_id}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {r.campaign_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{fmtNum(r.qtd_leads_frios)}</TableCell>
                      <TableCell className="text-right">{fmtBrl(r.spend)}</TableCell>
                      <TableCell className="text-right">{fmtBrl(r.custo_por_lead_frio)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
