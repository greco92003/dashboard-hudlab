"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
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

// Cache vencido volta na hora e é recalculado em segundo plano; a tela busca
// de novo depois desse intervalo (no máximo duas vezes), como a Visão Geral.
const REVALIDAR_MS = 12_000;
const MAX_REVALIDACOES = 2;

const COMO_LER_TABELA =
  "Lado Meta: região do clique. Lado GHL: estado informado pelo lead. " +
  "Custo/Mockup usa a mesma régua do KPI \"Solicitações de Mockup\" da Visão Geral " +
  "(oportunidade que chegou em Amostra Digital Enviada); o UF só é confiável a partir " +
  "do orçamento, então contar por lead bruto por estado ficaria poluído. Faturamento = " +
  "pedidos pelo mês da venda, só de clientes com estado informado: venda sem estado " +
  "não aparece aqui, então a soma dos estados fica abaixo do faturamento total.";

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

function fmtMes(iso: string) {
  const [a, m] = iso.split("-");
  return `${m}/${a.slice(2)}`;
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

function ComoLer({ texto }: { texto: string }) {
  return (
    <span
      className="inline-flex cursor-help text-muted-foreground"
      title={texto}
      aria-label={texto}
      role="img"
    >
      <Info className="h-3.5 w-3.5" />
    </span>
  );
}

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
  const [revalidateTick, setRevalidateTick] = useState(0);
  const revalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const selecionado = periodoParaDatas(periodo, customRange);
  const janela = janelaComparacao(selecionado.inicio, selecionado.fim);
  const { inicio, fim } = janela;

  useEffect(() => {
    setRevalidateTick(0);
    return () => {
      if (revalidateTimer.current) clearTimeout(revalidateTimer.current);
      revalidateTimer.current = null;
    };
  }, [inicio, fim, refreshKey]);

  const scheduleRevalidate = () => {
    if (revalidateTick >= MAX_REVALIDACOES || revalidateTimer.current) return;
    revalidateTimer.current = setTimeout(() => {
      revalidateTimer.current = null;
      setRevalidateTick((tick) => tick + 1);
    }, REVALIDAR_MS);
  };

  useEffect(() => {
    const ctrl = new AbortController();
    // Na revalidação a tela continua mostrando o que já tem.
    if (revalidateTick === 0) setRegionsLoading(true);
    setRegionsErro(null);
    fetchMarketingReport<UfMesRow[]>("regions", inicio, fim, ctrl.signal)
      .then((r) => {
        setRegions(r.data ?? []);
        setRegionsLoading(false);
        if (r.stale) scheduleRevalidate();
      })
      .catch((e) => {
        if (isAbort(e) || ctrl.signal.aborted) return;
        setRegionsErro(msgErro(e));
        setRegions([]);
        setRegionsLoading(false);
      });
    return () => ctrl.abort();
    // scheduleRevalidate só lê o tick atual, que já está nas dependências.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim, refreshKey, revalidateTick]);

  useEffect(() => {
    const ctrl = new AbortController();
    if (revalidateTick === 0) setHistoryLoading(true);
    setHistoryErro(null);
    fetchMarketingSnapshot<UfMesRow[]>("regions-history", ctrl.signal)
      .then((r) => {
        setHistory(r.data ?? []);
        setHistoryLoading(false);
        if (r.stale) scheduleRevalidate();
      })
      .catch((e) => {
        if (isAbort(e) || ctrl.signal.aborted) return;
        setHistoryErro(msgErro(e));
        setHistory([]);
        setHistoryLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, revalidateTick]);

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
  const formatValue = useMemo(() => fmtMetrica(metrica), [metrica]);

  const saz = useMemo(() => calcSazonalidade(history), [history]);
  const estacoes = ORDEM_ESTACOES.filter((e) => saz.some((s) => s.estacao === e));
  const regioesSaz = ORDEM_REGIOES.filter((g) => saz.some((s) => s.region_group === g));

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

  const descricaoMetrica =
    metrica === "roas"
      ? "ROAS = faturamento ÷ investimento (cor forte = melhor)."
      : metrica === "custo_mockup"
        ? "Investimento ÷ mockups (cor forte = mockup mais barato)."
        : metrica === "spend"
          ? "Investimento no estado (cor forte = mais verba)."
          : "Faturamento dos pedidos do estado (cor forte = mais faturamento).";

  // Desktop: tudo numa tela só. Mapa à esquerda; tabela (com rolagem própria)
  // e sazonalidade à direita. No celular, empilha na ordem de leitura.
  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:h-[calc(100dvh-13rem)] lg:min-h-[560px]">
      {/* Coluna do mapa */}
      <div className="lg:col-span-4 lg:min-h-0">
        {regionsLoading ? (
          <Skeleton className="h-full min-h-80" />
        ) : (
          <Card className="h-full gap-3 py-4 lg:overflow-y-auto">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 px-4">
              <div className="min-w-0">
                <CardTitle className="text-base">Mapa por estado</CardTitle>
                <CardDescription className="text-xs">
                  {fmtDia(inicio)} a {fmtDia(fim)}. {descricaoMetrica}
                </CardDescription>
              </div>
              <Select
                value={metrica}
                onValueChange={(v) => setMetrica(v as MetricaRegiao)}
              >
                <SelectTrigger className="h-8 w-36 shrink-0 text-xs">
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
            <CardContent className="space-y-4 px-4">
              {regionsErro ? (
                erroTexto(regionsErro)
              ) : regions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Sem dados regionais no período.
                </p>
              ) : (
                <>
                  <BrazilMap
                    className="mx-auto max-w-[360px]"
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
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      Top 5
                    </h4>
                    {top5.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem valores.</p>
                    ) : (
                      <ol className="grid grid-cols-1 gap-0.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        {top5.map((d, i) => (
                          <li key={d.uf}>
                            <button
                              type="button"
                              onClick={() => setSelectedUf(selectedUf === d.uf ? null : d.uf)}
                              aria-pressed={selectedUf === d.uf}
                              className={`flex w-full items-center justify-between rounded px-2 py-1 text-xs hover:bg-muted ${
                                selectedUf === d.uf ? "bg-muted" : ""
                              }`}
                            >
                              <span>
                                <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                                <span className="font-medium">{d.uf}</span>
                              </span>
                              <span className="tabular-nums">{formatValue(d.value)}</span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Coluna da tabela e da sazonalidade */}
      <div className="flex flex-col gap-4 lg:col-span-8 lg:min-h-0">
        {historyLoading ? (
          <Skeleton className="min-h-80 flex-1" />
        ) : (
          <Card className="gap-2 py-4 lg:min-h-0 lg:flex-1">
            <CardHeader className="space-y-0 px-4">
              <CardTitle className="flex items-center gap-1.5 text-base">
                Desempenho por estado e mês
                <ComoLer texto={COMO_LER_TABELA} />
              </CardTitle>
              <CardDescription className="text-xs">
                Histórico completo, na métrica do mapa ({METRICAS_REGIAO[metrica].label}).
                {metrica === "roas" ? " Verde forte = melhor." : " Âmbar forte = valor maior."}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 lg:min-h-0 lg:flex-1">
              {historyErro ? (
                erroTexto(historyErro)
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Sem dados regionais ainda. Rode os syncs para popular.
                </p>
              ) : (
                <div className="max-h-[60vh] overflow-auto lg:h-full lg:max-h-none">
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr>
                        <th className="sticky left-0 z-20 bg-card p-1.5 text-left">UF</th>
                        {meses.map((m) => (
                          <th key={m} className="whitespace-nowrap p-1.5 font-medium">
                            {fmtMes(m)}
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
                              className="pb-0.5 pt-2 text-[10px] font-semibold uppercase text-muted-foreground"
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
                                className={`sticky left-0 p-1.5 font-medium ${
                                  selectedUf === uf ? "bg-muted" : "bg-card"
                                }`}
                              >
                                <button
                                  type="button"
                                  className="hover:underline"
                                  onClick={() => setSelectedUf(selectedUf === uf ? null : uf)}
                                >
                                  {uf}
                                </button>
                              </td>
                              {meses.map((m) => {
                                const r = porUf.get(uf)?.get(m);
                                const v = r ? celValor(r, metrica) : null;
                                const intensidade =
                                  v != null && maxValor > 0 ? v / maxValor : 0;
                                return (
                                  <td
                                    key={m}
                                    className="whitespace-nowrap rounded p-1.5 text-center tabular-nums"
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
                                        ? `${uf} ${fmtMes(m)}: invest. ${fmtBrl(r.spend)} | mockups ${r.mockups} | vendas ${r.vendas} | fat. ${fmtBrl(r.faturamento)}`
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

        {historyLoading ? (
          <Skeleton className="h-44 shrink-0" />
        ) : (
          <Card className="shrink-0 gap-2 py-4">
            <CardHeader className="space-y-0 px-4">
              <CardTitle className="flex items-center gap-1.5 text-base">
                Sazonalidade por região
                <ComoLer texto="Vale anunciar no Sul no inverno? As respostas ganham confiança conforme o histórico acumula. ROAS e CPA (investimento por pedido) somando todos os meses de cada estação." />
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              {historyErro ? (
                erroTexto(historyErro)
              ) : saz.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Sem dados suficientes ainda.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="p-1.5 text-left font-medium">Região</th>
                        {estacoes.map((e) => (
                          <th key={e} className="p-1.5 text-right font-medium capitalize">
                            {e}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {regioesSaz.map((g) => (
                        <tr key={g} className="border-t">
                          <td className="p-1.5 font-medium">{g}</td>
                          {estacoes.map((e) => {
                            const s = saz.find((x) => x.estacao === e && x.region_group === g);
                            return (
                              <td key={e} className="p-1.5 text-right tabular-nums">
                                {s ? (
                                  <>
                                    <span className="font-medium">
                                      {s.roas != null ? `${s.roas}x` : "—"}
                                    </span>
                                    <span className="ml-2 text-muted-foreground">
                                      {fmtBrl(s.spend)} · CPA {s.cpa != null ? fmtBrl(s.cpa) : "—"}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
