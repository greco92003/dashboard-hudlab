"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBrl } from "../lib";

interface UfMesRow {
  uf: string;
  region_group: string | null;
  mes: string; // YYYY-MM-01
  estacao: string;
  spend: number;
  leads_meta: number;
  leads_ghl: number;
  mockups: number;
  vendas: number;
  faturamento: number;
}

interface SazonalidadeRow {
  region_group: string;
  estacao: string;
  spend: number;
  vendas: number;
  faturamento: number;
  roas: number | null;
  cpa: number | null;
}

const ORDEM_REGIOES = ["Sul", "Sudeste", "Centro-Oeste", "Nordeste", "Norte"];
const ORDEM_ESTACOES = ["verão", "outono", "inverno", "primavera"];

type Metrica = "roas" | "spend" | "custo_mockup";

export function Regioes() {
  const [rows, setRows] = useState<UfMesRow[]>([]);
  const [sazonalidade, setSazonalidade] = useState<SazonalidadeRow[]>([]);
  const [metrica, setMetrica] = useState<Metrica>("roas");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancel = false;
    (async () => {
      const [ufMes, saz] = await Promise.all([
        supabase.from("v_desempenho_uf_mes").select("*"),
        supabase.from("v_sazonalidade_regiao").select("*"),
      ]);
      if (cancel) return;
      setRows((ufMes.data as UfMesRow[]) ?? []);
      setSazonalidade((saz.data as SazonalidadeRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const { meses, porUf, maxValor } = useMemo(() => {
    const meses = [...new Set(rows.map((r) => r.mes))].sort();
    const porUf = new Map<string, Map<string, UfMesRow>>();
    for (const r of rows) {
      if (!porUf.has(r.uf)) porUf.set(r.uf, new Map());
      porUf.get(r.uf)!.set(r.mes, r);
    }
    const valor = (r: UfMesRow) => {
      if (metrica === "spend") return r.spend;
      if (metrica === "custo_mockup") return r.mockups > 0 ? r.spend / r.mockups : 0;
      return r.spend > 0 ? r.faturamento / r.spend : 0;
    };
    let maxValor = 0;
    for (const r of rows) maxValor = Math.max(maxValor, valor(r));
    return { meses, porUf, maxValor };
  }, [rows, metrica]);

  const ufsOrdenadas = useMemo(() => {
    const grupos = new Map<string, string[]>();
    for (const [uf] of porUf) {
      const grupo =
        rows.find((r) => r.uf === uf)?.region_group ?? "Sem região";
      if (!grupos.has(grupo)) grupos.set(grupo, []);
      grupos.get(grupo)!.push(uf);
    }
    const ordenado: { grupo: string; ufs: string[] }[] = [];
    for (const g of [...ORDEM_REGIOES, "Sem região"]) {
      if (grupos.has(g)) ordenado.push({ grupo: g, ufs: grupos.get(g)!.sort() });
    }
    return ordenado;
  }, [porUf, rows]);

  const celValor = (r: UfMesRow | undefined) => {
    if (!r) return null;
    if (metrica === "spend") return r.spend;
    if (metrica === "custo_mockup") return r.mockups > 0 ? r.spend / r.mockups : null;
    return r.spend > 0 ? r.faturamento / r.spend : null;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-96" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Desempenho por estado e mês</CardTitle>
            <CardDescription>
              Lado Meta: região do clique • Lado GHL: estado informado pelo
              lead. Custo/Mockup usa a mesma régua do KPI &quot;Solicitações de
              Mockup&quot; da Visão Geral (oportunidade que chegou em Amostra
              Digital Enviada) — o UF só é confiável a partir do orçamento,
              então contar por lead bruto por estado ficaria poluído.
              Intensidade da célula ={" "}
              {metrica === "roas"
                ? "ROAS (verde forte = melhor)"
                : metrica === "custo_mockup"
                  ? "Custo/Mockup (âmbar forte = mockup mais caro)"
                  : "investimento (âmbar forte = mais verba)"}
              .
            </CardDescription>
          </div>
          <Select value={metrica} onValueChange={(v) => setMetrica(v as Metrica)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="roas">ROAS</SelectItem>
              <SelectItem value="spend">Investimento</SelectItem>
              <SelectItem value="custo_mockup">Custo/Mockup</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Sem dados regionais ainda. Rode os syncs para popular.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left p-2 sticky left-0 bg-background">
                      UF
                    </th>
                    {meses.map((m) => (
                      <th key={m} className="p-2 font-medium whitespace-nowrap">
                        {m.slice(0, 7)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ufsOrdenadas.map(({ grupo, ufs }) => (
                    <Fragment key={grupo}>
                      <tr>
                        <td
                          colSpan={meses.length + 1}
                          className="pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase"
                        >
                          {grupo}
                        </td>
                      </tr>
                      {ufs.map((uf) => (
                        <tr key={uf}>
                          <td className="p-2 font-medium sticky left-0 bg-background">
                            {uf}
                          </td>
                          {meses.map((m) => {
                            const r = porUf.get(uf)?.get(m);
                            const v = celValor(r);
                            const intensidade =
                              v != null && maxValor > 0 ? v / maxValor : 0;
                            return (
                              <td
                                key={m}
                                className="p-2 text-center whitespace-nowrap rounded"
                                style={{
                                  backgroundColor:
                                    v != null
                                      ? metrica === "roas"
                                        ? `rgba(16, 185, 129, ${0.08 + 0.72 * intensidade})`
                                        : `rgba(245, 158, 11, ${0.08 + 0.72 * intensidade})`
                                      : undefined,
                                }}
                                title={
                                  r
                                    ? `${uf} ${m.slice(0, 7)} — invest.: ${fmtBrl(r.spend)} | mockups: ${r.mockups} | vendas: ${r.vendas} | fat.: ${fmtBrl(r.faturamento)}`
                                    : undefined
                                }
                              >
                                {v == null
                                  ? "—"
                                  : metrica === "roas"
                                    ? `${v.toFixed(1)}x`
                                    : fmtBrl(v)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-semibold mb-1">Sazonalidade por região</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Vale anunciar no Sul no inverno? As respostas ganham confiança
          conforme o histórico acumula.
        </p>
        {sazonalidade.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Sem dados suficientes ainda.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {ORDEM_ESTACOES.filter((e) =>
              sazonalidade.some((s) => s.estacao === e)
            ).map((estacao) => (
              <Card key={estacao}>
                <CardHeader className="pb-2">
                  <CardTitle className="capitalize text-base">
                    {estacao}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ORDEM_REGIOES.filter((g) =>
                    sazonalidade.some(
                      (s) => s.estacao === estacao && s.region_group === g
                    )
                  ).map((g) => {
                    const s = sazonalidade.find(
                      (x) => x.estacao === estacao && x.region_group === g
                    )!;
    return (
                      <div key={g} className="text-sm space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{g}</span>
                          <span className="text-muted-foreground">
                            {s.roas != null ? `ROAS ${s.roas}x` : "ROAS —"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Invest. {fmtBrl(s.spend)}</span>
                          <span>CPA {s.cpa != null ? fmtBrl(s.cpa) : "—"}</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
