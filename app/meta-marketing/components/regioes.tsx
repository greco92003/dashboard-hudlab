"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { BrazilMap } from "@/components/charts/brazil-map";
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
import {
  fmtBrl,
  janelaComparacao,
  periodoParaDatas,
  type Periodo,
  type RangeCustom,
} from "../lib";
import { fetchMarketingReport, fetchMarketingSnapshot } from "../report-client";
import {
  METRICAS_REGIAO,
  sazonalidade as calcSazonalidade,
  somarPorUf,
  valorMetrica,
  type MetricaRegiao,
  type UfMesRow,
} from "../regioes-dados";

const ORDEM_REGIOES = ["Sul", "Sudeste", "Centro-Oeste", "Nordeste", "Norte"];
const ORDEM_ESTACOES = ["verão", "outono", "inverno", "primavera"];

const fmtMetrica = (metrica: MetricaRegiao) => (x: number) =>
  metrica === "roas" ? `${x.toFixed(1)}x` : fmtBrl(x);

const isAbort = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError";
const msgErro = (e: unknown) =>
  e instanceof Error ? e.message : "Falha ao carregar dados";

function fmtDia(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function celValor(r: UfMesRow, metrica: MetricaRegiao): number | null {
  const spend = Number(r.spend) || 0;
  const mockups = Number(r.mockups) || 0;
  const fat = Number(r.faturamento) || 0;
  if (metrica === "spend") return spend;
  if (metrica === "faturamento") return fat;
  if (metrica === "custo_mockup") return mockups > 0 ? spend / mockups : null;
  return spend > 0 ? fat / spend : null;
}

const erroTexto = (msg: string) => (
  <p className="text-xs text-destructive py-4">{msg}</p>
);

export function Regioes({
  periodo,
  customRange,
  refreshKey,
}: {
  periodo: Periodo;
  customRange?: RangeCustom;
  refreshKey?: number;
}) {
  const [regions, setRegions] = useState<UfMesRow[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [regionsErro, setRegionsErro] = useState<string | null>(null);
  const [history, setHistory] = useState<UfMesRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyErro, setHistoryErro] = useState<string | null>(null);
  const [metrica, setMetrica] = useState<MetricaRegiao>("roas");
  const [selectedUf, setSelectedUf] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const selecionado = periodoParaDatas(periodo, customRange);
  const janela = janelaComparacao(selecionado.inicio, selecionado.fim);
  const { inicio, fim } = janela;

  useEffect(() => {
    const ctrl = new AbortController();
    setRegionsLoading(true);
    setRegionsErro(null);
    fetchMarketingReport<UfMesRow[]>("regions", inicio, fim, ctrl.signal)
      .then((r) => {
        setRegions(r.data ?? []);
        setRegionsLoading(false);
      })
      .catch((e) => {
        if (isAbort(e) || ctrl.signal.aborted) return;
        setRegionsErro(msgErro(e));
        setRegions([]);
        setRegionsLoading(false);
      });
    return () => ctrl.abort();
  }, [inicio, fim, refreshKey]);

  useEffect(() => {
    const ctrl = new AbortController();
    setHistoryLoading(true);
    setHistoryErro(null);
    fetchMarketingSnapshot<UfMesRow[]>("regions-history", ctrl.signal)
      .then((r) => {
        setHistory(r.data ?? []);
        setHistoryLoading(false);
      })
      .catch((e) => {
        if (isAbort(e) || ctrl.signal.aborted) return;
        setHistoryErro(msgErro(e));
        setHistory([]);
        setHistoryLoading(false);
      });
    return () => ctrl.abort();
  }, [refreshKey]);

  const totais = useMemo(() => somarPorUf(regions), [regions]);
  const totalPorUf = useMemo(
    () => new Map(totais.map((t) => [t.uf, t])),
    [totais]
  );
  const dadosMapa = useMemo(
    () => totais.map((t) => ({ uf: t.uf, value: valorMetrica(t, metrica) })),
    [totais, metrica]
  );
  const invertida = METRICAS_REGIAO[metrica].escala === "sequential-inverted";
  const top5 = useMemo(
    () =>
      dadosMapa
        .filter((d): d is { uf: string; value: number } => d.value != null)
        .sort((a, b) => (invertida ? a.value - b.value : b.value - a.value))
        .slice(0, 5),
    [dadosMapa, invertida]
  );
  const formatValue = fmtMetrica(metrica);

  const saz = useMemo(() => calcSazonalidade(history), [history]);

  const { meses, porUf, maxValor } = useMemo(() => {
    const meses = [...new Set(history.map((r) => r.mes))].sort();
    const porUf = new Map<string, Map<string, UfMesRow>>();
    for (const r of history) {
      if (!porUf.has(r.uf)) porUf.set(r.uf, new Map());
      porUf.get(r.uf)!.set(r.mes, r);
    }
    let maxValor = 0;
    for (const r of history) {
      const v = celValor(r, metrica);
      if (v != null) maxValor = Math.max(maxValor, v);
    }
    return { meses, porUf, maxValor };
  }, [history, metrica]);

  const ufsOrdenadas = useMemo(() => {
    const grupos = new Map<string, string[]>();
    for (const [uf] of porUf) {
      const grupo =
        history.find((r) => r.uf === uf)?.region_group ?? "Sem região";
      if (!grupos.has(grupo)) grupos.set(grupo, []);
      grupos.get(grupo)!.push(uf);
    }
    const ordenado: { grupo: string; ufs: string[] }[] = [];
    for (const g of [...ORDEM_REGIOES, "Sem região"]) {
      if (grupos.has(g)) ordenado.push({ grupo: g, ufs: grupos.get(g)!.sort() });
    }
    return ordenado;
  }, [porUf, history]);

  useEffect(() => {
    if (!selectedUf) return;
    rowRefs.current
      .get(selectedUf)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedUf]);

  return (
    <div className="space-y-6">
      {regionsLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Mapa por estado</CardTitle>
              <CardDescription>
                Período de {fmtDia(inicio)} a {fmtDia(fim)}.{" "}
                {metrica === "roas"
                  ? "ROAS = faturamento ÷ investimento (cor forte = melhor)."
                  : metrica === "custo_mockup"
                    ? "Custo/Mockup = investimento ÷ mockups (cor forte = mockup mais barato)."
                    : metrica === "spend"
                      ? "Investimento no estado (cor forte = mais verba)."
                      : "Faturamento dos pedidos do estado (cor forte = mais faturamento)."}
              </CardDescription>
            </div>
            <Select
              value={metrica}
              onValueChange={(v) => setMetrica(v as MetricaRegiao)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METRICAS_REGIAO) as MetricaRegiao[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {METRICAS_REGIAO[m].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {regionsErro ? (
              erroTexto(regionsErro)
            ) : regions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem dados regionais no período.
              </p>
            ) : (
              <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <BrazilMap
                    data={dadosMapa}
                    formatValue={formatValue}
                    colorScale={METRICAS_REGIAO[metrica].escala}
                    valueLabel={METRICAS_REGIAO[metrica].label}
                    selectedUf={selectedUf}
                    onSelectUf={setSelectedUf}
                    tooltipRows={(uf) => {
                      const t = totalPorUf.get(uf);
                      if (!t) return [];
                      const c = "var(--chart-grid)";
                      return [
                        { color: c, label: "Investimento", value: fmtBrl(t.spend) },
                        { color: c, label: "Mockups", value: String(t.mockups) },
                        { color: c, label: "Vendas", value: String(t.vendas) },
                        { color: c, label: "Faturamento", value: fmtBrl(t.faturamento) },
                      ];
                    }}
                  />
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-2">Top 5</h4>
                  {top5.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem valores.</p>
                  ) : (
                    <ol className="space-y-1">
                      {top5.map((d, i) => (
                        <li key={d.uf}>
                          <button
                            type="button"
                            onClick={() => setSelectedUf(d.uf)}
                            className={`w-full flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted ${
                              selectedUf === d.uf ? "bg-muted" : ""
                            }`}
                          >
                            <span>
                              <span className="text-muted-foreground mr-2">
                                {i + 1}.
                              </span>
                              <span className="font-medium">{d.uf}</span>
                            </span>
                            <span>{formatValue(d.value)}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {historyLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <Card>
          <CardHeader className="space-y-0">
            <CardTitle>Desempenho por estado e mês</CardTitle>
            <CardDescription>
              Lado Meta: região do clique • Lado GHL: estado informado pelo
              lead. Custo/Mockup usa a mesma régua do KPI &quot;Solicitações de
              Mockup&quot; da Visão Geral (oportunidade que chegou em Amostra
              Digital Enviada) — o UF só é confiável a partir do orçamento,
              então contar por lead bruto por estado ficaria poluído.
              Faturamento = pedidos pelo mês da venda, só de clientes com
              estado informado — venda sem estado não aparece aqui, então a
              soma dos estados fica abaixo do faturamento total.
              Métrica escolhida no seletor do mapa. Intensidade da célula ={" "}
              {metrica === "roas"
                ? "ROAS (verde forte = melhor)"
                : metrica === "custo_mockup"
                  ? "Custo/Mockup (âmbar forte = mockup mais caro)"
                  : metrica === "faturamento"
                    ? "faturamento (âmbar forte = mais faturamento)"
                    : "investimento (âmbar forte = mais verba)"}
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            {historyErro ? (
              erroTexto(historyErro)
            ) : history.length === 0 ? (
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
                          <tr
                            key={uf}
                            ref={(el) => {
                              if (el) rowRefs.current.set(uf, el);
                              else rowRefs.current.delete(uf);
                            }}
                            className={selectedUf === uf ? "bg-muted" : undefined}
                          >
                            <td
                              className={`p-2 font-medium sticky left-0 ${
                                selectedUf === uf ? "bg-muted" : "bg-background"
                              }`}
                            >
                              {uf}
                            </td>
                            {meses.map((m) => {
                              const r = porUf.get(uf)?.get(m);
                              const v = r ? celValor(r, metrica) : null;
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
                                  {v == null ? "—" : formatValue(v)}
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
      )}

      <div>
        <h3 className="text-lg font-semibold mb-1">Sazonalidade por região</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Vale anunciar no Sul no inverno? As respostas ganham confiança
          conforme o histórico acumula.
        </p>
        {historyLoading ? (
          <Skeleton className="h-40" />
        ) : historyErro ? (
          erroTexto(historyErro)
        ) : saz.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Sem dados suficientes ainda.
          </p>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            {ORDEM_ESTACOES.filter((e) =>
              saz.some((s) => s.estacao === e)
            ).map((estacao) => (
              <Card key={estacao}>
                <CardHeader className="pb-2">
                  <CardTitle className="capitalize text-base">
                    {estacao}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ORDEM_REGIOES.filter((g) =>
                    saz.some(
                      (s) => s.estacao === estacao && s.region_group === g
                    )
                  ).map((g) => {
                    const s = saz.find(
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
