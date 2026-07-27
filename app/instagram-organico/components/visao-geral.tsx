"use client";

import { useEffect, useState } from "react";
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
import { ArrowDownRight, ArrowUpRight, Clapperboard, Images, CircleDot } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtNum, fmtPctFraction, periodoParaDatas, type Periodo } from "../lib";

// Esta aba precisa de início/fim concretos pra comparar com o período
// anterior -- "todos" (sem limite) não se aplica aqui.
const PERIODOS_COMPARAVEIS: { value: Periodo; label: string }[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
];

interface TipoResumo {
  qtd: number;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
  total_interactions: number;
  engagement_rate: number | null;
}

interface Resumo {
  atual: Record<string, TipoResumo>;
  anterior: Record<string, TipoResumo>;
}

interface AtributoLite {
  media_product_type: string;
  timestamp: string;
  views: number | null;
  reach: number | null;
  engagement_rate: number | null;
}

interface DiaSerie {
  data: string;
  dataIso: string;
  reelsViews: number;
  postsAlcance: number;
  storiesViews: number;
}

interface TendenciaDia {
  data: string;
  dataIso: string;
  reelsEng: number | null;
  postsEng: number | null;
  storiesEng: number | null;
}

// Timestamp (ISO, UTC) -> data no fuso America/Sao_Paulo (YYYY-MM-DD),
// pra bater com o mesmo fuso usado em periodoParaDatas.
function dataSaoPaulo(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const sp = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${sp.getFullYear()}-${String(sp.getMonth() + 1).padStart(2, "0")}-${String(sp.getDate()).padStart(2, "0")}`;
}

function subtrairDias(dataIso: string, n: number): string {
  const d = new Date(`${dataIso}T12:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Série por dia de publicação (nunca semanal, mesmo em 30/90 dias) --
// cohort: soma o total ATUAL (visto na v_ig_atributos) do que foi
// publicado em cada dia. Preenche todos os dias do intervalo com zero
// pra linha não pular dia sem publicação.
function construirSerieDiaria(rows: AtributoLite[], inicio: string, fim: string): DiaSerie[] {
  const porDia = new Map<string, DiaSerie>();
  const cursor = new Date(`${inicio}T12:00:00`);
  const fimDate = new Date(`${fim}T12:00:00`);
  while (cursor <= fimDate) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(
      cursor.getDate(),
    ).padStart(2, "0")}`;
    porDia.set(iso, {
      data: `${String(cursor.getDate()).padStart(2, "0")}/${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      dataIso: iso,
      reelsViews: 0,
      postsAlcance: 0,
      storiesViews: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const r of rows) {
    const iso = dataSaoPaulo(r.timestamp);
    const bucket = porDia.get(iso);
    if (!bucket) continue;
    if (r.media_product_type === "REELS") bucket.reelsViews += r.views ?? 0;
    else if (r.media_product_type === "FEED") bucket.postsAlcance += r.reach ?? 0;
    else if (r.media_product_type === "STORY") bucket.storiesViews += r.views ?? 0;
  }
  return Array.from(porDia.values()).sort((a, b) => a.dataIso.localeCompare(b.dataIso));
}

const JANELA_TENDENCIA_DIAS = 7;

// Tendência de qualidade (engajamento), separada da tendência de volume
// acima: soma de views mistura "quanto postamos" com "quão bem
// performou" -- um dia com 3 reels sempre soma mais que um dia com 0,
// mesmo que o conteúdo tenha ido pior. Aqui cada ponto é a média
// (poolada, não "média das médias") da taxa de engajamento de TODOS os
// posts publicados nos últimos `janela` dias corridos até aquele dia --
// suaviza o ruído de um vídeo viral isolado e não some quando não há
// post no dia (fica null = buraco na linha, não zero).
function construirTendenciaEngajamento(
  rows: AtributoLite[],
  inicio: string,
  fim: string,
  janela = JANELA_TENDENCIA_DIAS,
): TendenciaDia[] {
  const porTipo: Record<string, { iso: string; valor: number }[]> = { REELS: [], FEED: [], STORY: [] };
  for (const r of rows) {
    if (r.engagement_rate == null || !porTipo[r.media_product_type]) continue;
    porTipo[r.media_product_type].push({ iso: dataSaoPaulo(r.timestamp), valor: r.engagement_rate });
  }

  const mediaJanela = (tipo: string, diaIso: string): number | null => {
    const inicioJanela = subtrairDias(diaIso, janela - 1);
    const valores = porTipo[tipo]
      .filter((v) => v.iso >= inicioJanela && v.iso <= diaIso)
      .map((v) => v.valor);
    if (valores.length === 0) return null;
    return valores.reduce((s, v) => s + v, 0) / valores.length;
  };

  const out: TendenciaDia[] = [];
  const cursor = new Date(`${inicio}T12:00:00`);
  const fimDate = new Date(`${fim}T12:00:00`);
  while (cursor <= fimDate) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(
      cursor.getDate(),
    ).padStart(2, "0")}`;
    out.push({
      data: `${String(cursor.getDate()).padStart(2, "0")}/${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      dataIso: iso,
      reelsEng: mediaJanela("REELS", iso),
      postsEng: mediaJanela("FEED", iso),
      storiesEng: mediaJanela("STORY", iso),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

const TIPOS: { key: string; label: string; icon: typeof Clapperboard }[] = [
  { key: "REELS", label: "Reels", icon: Clapperboard },
  { key: "FEED", label: "Posts & Carrosséis", icon: Images },
  { key: "STORY", label: "Stories", icon: CircleDot },
];

function calcVariacao(atual: number, anterior: number | undefined): number | undefined {
  if (!anterior) return undefined;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

function VarBadge({ pct }: { pct: number | undefined }) {
  if (pct == null) return null;
  const subiu = pct > 0;
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
        subiu ? "text-emerald-600" : "text-red-600"
      }`}
    >
      <Icone className="h-3 w-3" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function MetricRow({
  label,
  atual,
  anterior,
}: {
  label: string;
  atual: number;
  anterior: number | undefined;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="font-medium">{fmtNum(atual)}</span>
        <VarBadge pct={calcVariacao(atual, anterior)} />
      </span>
    </div>
  );
}

export function VisaoGeral() {
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [serie, setSerie] = useState<DiaSerie[]>([]);
  const [tendencia, setTendencia] = useState<TendenciaDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancel = false;
    setLoading(true);
    setErro(null);
    (async () => {
      const { inicio, fim } = periodoParaDatas(periodo);
      // periodoParaDatas tipa inicio como string | null pro caso "todos",
      // mas essa aba só usa PERIODOS_COMPARAVEIS (7d/30d/90d) -- nunca null.
      if (!inicio) return;
      // Busca com folga de JANELA_TENDENCIA_DIAS antes do início pra média
      // móvel já ter janela cheia no primeiro dia exibido, sem "partida fria".
      const inicioBusca = subtrairDias(inicio, JANELA_TENDENCIA_DIAS - 1);
      const [resumoResp, serieResp] = await Promise.all([
        supabase.rpc("get_instagram_resumo_periodo", { p_inicio: inicio, p_fim: fim }),
        supabase
          .from("v_ig_atributos")
          .select("media_product_type, timestamp, views, reach, engagement_rate")
          .gte("timestamp", inicioBusca)
          .lte("timestamp", `${fim}T23:59:59`),
      ]);
      if (cancel) return;
      if (resumoResp.error) {
        setErro(resumoResp.error.message);
        setLoading(false);
        return;
      }
      if (serieResp.error) {
        setErro(serieResp.error.message);
        setLoading(false);
        return;
      }
      const linhas = (serieResp.data as AtributoLite[]) ?? [];
      setResumo(resumoResp.data as Resumo);
      setSerie(construirSerieDiaria(linhas, inicio, fim));
      setTendencia(construirTendenciaEngajamento(linhas, inicio, fim));
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [periodo]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS_COMPARAVEIS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {erro && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">Erro ao carregar: {erro}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : resumo ? (
        <div className="grid gap-4 md:grid-cols-3">
          {TIPOS.map(({ key, label, icon: Icon }) => {
            const atual = resumo.atual[key];
            const anterior = resumo.anterior[key];
            if (!atual || atual.qtd === 0) {
              return (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="h-4 w-4" />
                      {label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Nenhum item publicado no período.
                  </CardContent>
                </Card>
              );
            }
            return (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4" />
                    {label}
                  </CardTitle>
                  <CardDescription>
                    {atual.qtd} {atual.qtd === 1 ? "item publicado" : "itens publicados"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <MetricRow label="Views" atual={atual.views} anterior={anterior?.views} />
                  <MetricRow label="Alcance" atual={atual.reach} anterior={anterior?.reach} />
                  <MetricRow label="Curtidas" atual={atual.likes} anterior={anterior?.likes} />
                  <MetricRow label="Comentários" atual={atual.comments} anterior={anterior?.comments} />
                  <MetricRow label="Salvos" atual={atual.saved} anterior={anterior?.saved} />
                  <MetricRow
                    label="Compartilhamentos"
                    atual={atual.shares}
                    anterior={anterior?.shares}
                  />
                  <div className="flex items-center justify-between border-t pt-2">
                    <span className="text-muted-foreground">Taxa de engajamento</span>
                    <span className="font-medium">{fmtPctFraction(atual.engagement_rate)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {!loading && serie.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução diária</CardTitle>
            <CardDescription>
              Views de Reels e Stories, alcance de Posts &amp; Carrosséis -- por dia de publicação, mesmo em
              períodos de 30/90 dias (nunca agrupado por semana)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serie} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="reelsViews" name="Reels (views)" stroke="#8884d8" dot={false} />
                  <Line
                    type="monotone"
                    dataKey="postsAlcance"
                    name="Posts (alcance)"
                    stroke="#e11d48"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="storiesViews"
                    name="Stories (views)"
                    stroke="#10b981"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && tendencia.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tendência de engajamento</CardTitle>
            <CardDescription>
              Média móvel de {JANELA_TENDENCIA_DIAS} dias da taxa de engajamento -- ao contrário do gráfico de
              volume acima, aqui um dia sem post não derruba a linha pra zero, e um vídeo viral isolado não
              domina o gráfico. Buraco na linha = nenhum post daquele tipo na janela.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tendencia} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                  <Tooltip formatter={(v: number) => fmtPctFraction(v)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="reelsEng"
                    name="Reels (engajamento)"
                    stroke="#8884d8"
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="postsEng"
                    name="Posts (engajamento)"
                    stroke="#e11d48"
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="storiesEng"
                    name="Stories (engajamento)"
                    stroke="#10b981"
                    dot={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
