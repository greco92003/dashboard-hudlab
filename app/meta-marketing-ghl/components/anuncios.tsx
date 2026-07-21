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
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown } from "lucide-react";
import { fmtBrl, fmtNum } from "../lib";

interface FunnelRow {
  ad_id: string;
  ad_name: string | null;
  campaign_name: string | null;
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

export function Anuncios() {
  const [rows, setRows] = useState<FunnelRow[]>([]);
  const [frios, setFrios] = useState<LeadFrioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("spend_total");
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancel = false;
    (async () => {
      const [funnel, leadsFrios] = await Promise.all([
        supabase.from("v_funnel_por_anuncio").select("*"),
        supabase.from("v_leads_sem_venda").select("*"),
      ]);
      if (cancel) return;
      setRows((funnel.data as FunnelRow[]) ?? []);
      setFrios((leadsFrios.data as LeadFrioRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtradas = q
      ? rows.filter(
          (r) =>
            (r.ad_name ?? "").toLowerCase().includes(q) ||
            (r.campaign_name ?? "").toLowerCase().includes(q) ||
            r.ad_id.includes(q)
        )
      : rows;
    return [...filtradas].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const na = typeof va === "number" ? va : va == null ? -Infinity : NaN;
      const nb = typeof vb === "number" ? vb : vb == null ? -Infinity : NaN;
      let cmp: number;
      if (!Number.isNaN(na) && !Number.isNaN(nb)) cmp = na - nb;
      else cmp = String(va ?? "").localeCompare(String(vb ?? ""));
      return sortDesc ? -cmp : cmp;
    });
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
            Pipeline Atendimento desde 01/07/2026, join por utm_content =
            ad_id. Valor e pares contam a partir de Orçamento Gerado (não é o
            valor final — mede o anúncio no caminho); venda = Pagamento
            Confirmado. Lead time &gt; 30 dias.
          </CardDescription>
          <Input
            placeholder="Buscar por anúncio, campanha ou ad_id..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-sm mt-2"
          />
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
                    {th("ad_name", "Anúncio", false)}
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
                      <TableCell className="text-right">{fmtBrl(r.spend_total)}</TableCell>
                      <TableCell className="text-right">{fmtNum(r.leads_ghl)}</TableCell>
                      <TableCell className="text-right">{fmtBrl(r.custo_por_lead)}</TableCell>
                      <TableCell className="text-right">{fmtNum(r.orcamentos)}</TableCell>
                      <TableCell className="text-right">{fmtBrl(r.valor_orcamentos)}</TableCell>
                      <TableCell className="text-right">{fmtNum(r.pares_orcamentos)}</TableCell>
                      <TableCell className="text-right">{fmtBrl(r.custo_por_orcamento)}</TableCell>
                      <TableCell className="text-right">{fmtNum(r.mockups)}</TableCell>
                      <TableCell className="text-right">{fmtBrl(r.custo_por_mockup)}</TableCell>
                      <TableCell className="text-right">{fmtNum(r.negociacoes)}</TableCell>
                      <TableCell className="text-right">{fmtBrl(r.custo_por_negociacao)}</TableCell>
                      <TableCell className="text-right">{fmtNum(r.vendas)}</TableCell>
                      <TableCell className="text-right">{fmtBrl(r.faturamento)}</TableCell>
                      <TableCell className="text-right">{fmtBrl(r.cpa_venda)}</TableCell>
                      <TableCell className="text-right">
                        {r.roas != null ? `${r.roas}x` : "—"}
                      </TableCell>
                      <TableCell>
                        <DiagnosticoBadge valor={r.diagnostico} />
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
