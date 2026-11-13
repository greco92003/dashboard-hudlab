"use client";

import {
  type CSSProperties,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AlertCircle, Filter, Info, ListChecks, RefreshCw } from "lucide-react";
import Link from "next/link";
import {
  FunnelChart,
  type FunnelStage as ChartStage,
} from "@/components/charts/funnel-chart";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { SeletorPeriodo, usePeriodoParams } from "@/components/seletor-periodo";
import { periodoParaDatas } from "@/lib/periodo";
import { storage } from "@/lib/storage";

/**
 * Degradê do tema HUD: do verde da marca a ciano, azul e violeta conforme o
 * funil afunila (antes eram seis cores sólidas de mapa de calor, com amarelo e
 * laranja). Cada etapa vai da cor dela à da próxima, então o funil corre num
 * degradê contínuo; as camadas de halo do gráfico já dão a transparência.
 */
const FUNIL_CORES = [
  "#00ff91",
  "#16dfa9",
  "#22bfcc",
  "#2f9fe6",
  "#4d83f2",
  "#6a6ff2",
  "#8a62f0",
] as const;

interface ApiFunnelStage {
  slug: string;
  label: string;
  value: number;
}

interface ApiFunnel {
  /** Braço do teste A/B. Os braços mudam com o tempo -- o "Com Mockup
   * Automático" foi aposentado em 26/08/2026 e substituído pelo "Atendimento
   * Lado B" --, então a lista vem pronta da API em vez de campos fixos. */
  id: string;
  title: string;
  stages: ApiFunnelStage[];
  active: boolean;
  /** Data em que o braço parou de receber lead novo, se aposentado. */
  retiredAt: string | null;
  lastEventAt: string | null;
}

interface FunnelResponse {
  funnels: ApiFunnel[];
  meta: {
    totalEvents: number;
    totalContacts: number;
    unassignedContacts: number;
    ambiguousContacts: number;
    lastEventAt: string | null;
    firstEventAt: string | null;
    generatedAt: string;
    range: { from: string; to: string } | null;
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatWebhookDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

/** Dia (YYYY-MM-DD) de um instante ISO no calendário de São Paulo. */
function toDiaSaoPaulo(iso: string): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;

  // en-CA formata como YYYY-MM-DD, que é o mesmo formato dos parâmetros.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "2026-07-15" -> "15/07" (nunca mm/dd). */
function formatDiaCurto(dia: string): string {
  const [, mes, diaDoMes] = dia.split("-");
  return `${diaDoMes}/${mes}`;
}

// White label with a dark halo: readable both over the funnel colors and
// over the page background when the funnel narrows.
const LABEL_STYLE: CSSProperties = {
  color: "#FFFFFF",
  textShadow: "0 0 6px rgba(2,6,23,0.7), 0 1px 2px rgba(2,6,23,0.6)",
};

function toChartData(stages: ApiFunnelStage[]): {
  data: ChartStage[];
  isEmpty: boolean;
} {
  const isEmpty = stages.every((stage) => stage.value === 0);

  return {
    isEmpty,
    data: stages.map((stage, index) => ({
      label: stage.label,
      // Keep the component visible before the first webhook while displaying 0.
      value: isEmpty ? stages.length - index : stage.value,
      displayValue: formatNumber(stage.value),
      color: FUNIL_CORES[Math.min(index, FUNIL_CORES.length - 1)],
      gradient: [
        { offset: "0%", color: FUNIL_CORES[Math.min(index, FUNIL_CORES.length - 1)] },
        { offset: "100%", color: FUNIL_CORES[Math.min(index + 1, FUNIL_CORES.length - 1)] },
      ],
      labelStyle: LABEL_STYLE,
    })),
  };
}

function FunnelPanel({ funnel }: { funnel: ApiFunnel }) {
  const { data, isEmpty } = useMemo(
    () => toChartData(funnel.stages),
    [funnel.stages],
  );
  const isMobile = useIsMobile() ?? false;
  const lastEventLabel = formatWebhookDate(funnel.lastEventAt);

  return (
    <section className="hud-panel overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b px-5 py-4 sm:px-6">
        <div>
          <p className="hud-field-label">Teste A/B</p>
          <div className="mt-1 flex items-center gap-2.5">
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">
              {funnel.title}
            </h2>
            {funnel.active ? (
              <span className="hud-chip tone-green hud-tone-chip">Ativo</span>
            ) : (
              <span className="hud-chip">
                {funnel.retiredAt
                  ? `Aposentado em ${formatDiaCurto(funnel.retiredAt)}`
                  : "Desativado"}
              </span>
            )}
          </div>
        </div>
        {lastEventLabel && (
          <p className="text-xs text-muted-foreground">
            último webhook: {lastEventLabel}
          </p>
        )}
      </div>

      <div
        className={
          isMobile
            ? "px-5 py-8 sm:px-8 sm:py-10"
            : "overflow-x-auto px-5 py-8 sm:px-8 sm:py-10"
        }
      >
        <div
          className={
            isMobile
              ? "mx-auto w-full max-w-[420px]"
              : "mx-auto min-w-[960px] max-w-[1280px]"
          }
        >
          <FunnelChart
            data={data}
            edges="straight"
            formatPercentage={isEmpty ? () => "0%" : undefined}
            gap={0}
            layers={5}
            orientation={isMobile ? "vertical" : "horizontal"}
            labelLayout="grouped"
            labelOrientation="vertical"
            labelAlign="center"
            showLabels
            showPercentage
            showValues
            staggerDelay={0.09}
            style={isMobile ? undefined : { aspectRatio: "3.45 / 1" }}
          />
        </div>
      </div>
    </section>
  );
}

function FunnelSkeleton() {
  return (
    <div className="hud-panel space-y-5 p-6 sm:p-8">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-56" />
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}

function FunilContent() {
  const { periodo, customRange } = usePeriodoParams();
  const { inicio, fim } = periodoParaDatas(periodo, customRange);
  const [statusFilter, setStatusFilter] = useState<"all" | "active">("all");
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = storage.getItem("funilStatusFilter");
    if (stored === "active" || stored === "all") {
      setStatusFilter(stored);
    }
  }, []);

  const handleStatusFilterChange = (value: "all" | "active") => {
    setStatusFilter(value);
    storage.setItem("funilStatusFilter", value);
  };

  const loadFunnels = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch(
        `/api/ghl/funnel?startDate=${inicio}&endDate=${fim}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as FunnelResponse & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível carregar os funis");
      }
      setData(body);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar os funis",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [inicio, fim]);

  useEffect(() => {
    loadFunnels();

    // Cada chamada lê a tabela de eventos inteira, então não faz sentido
    // continuar consultando com a aba escondida -- ao voltar pra aba,
    // atualiza na hora.
    const atualizarSeVisivel = () => {
      if (document.visibilityState === "visible") loadFunnels(true);
    };
    const interval = window.setInterval(atualizarSeVisivel, 30_000);
    document.addEventListener("visibilitychange", atualizarSeVisivel);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", atualizarSeVisivel);
    };
  }, [loadFunnels]);

  const visibleFunnels = data
    ? data.funnels.filter((f) => statusFilter === "all" || f.active)
    : [];

  const lastEventLabel =
    formatWebhookDate(data?.meta.lastEventAt ?? null) ??
    "aguardando o primeiro webhook";

  // O funil só existe a partir do primeiro webhook: sem esse aviso, um
  // período que começa antes disso parece queda de desempenho.
  const primeiroDia = data?.meta.firstEventAt
    ? toDiaSaoPaulo(data.meta.firstEventAt)
    : null;
  const avisoInicio =
    primeiroDia && inicio < primeiroDia
      ? `O funil começou a receber dados em ${formatDiaCurto(primeiroDia)}. O período selecionado inclui dias anteriores a isso, que aparecem vazios.`
      : null;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="hud-v2-head">
        <div className="hud-v2-title">
          <div className="hud-v2-tile">
            <Filter />
          </div>
          <div>
            <h1>Funil de Conversão</h1>
            <p className="hud-v2-sub">
              Progressão dos contatos em cada braço do teste A/B, pelos webhooks
              do GHL. Braço aposentado continua aqui pelo histórico, com a data
              em que saiu.
            </p>
          </div>
        </div>
        <div className="hud-group" role="group" aria-label="Ações do funil">
          <Link href="/funil/followup">
            <ListChecks />
            Follow-Up
          </Link>
          <span className="hud-group-sep" aria-hidden />
          <button
            type="button"
            aria-label="Atualizar funis"
            disabled={loading || refreshing}
            onClick={() => loadFunnels(true)}
          >
            <RefreshCw className={refreshing ? "animate-spin" : undefined} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="hud-panel hud-bar">
        <div className="hud-field">
          <span className="hud-field-label">Período</span>
          <SeletorPeriodo />
        </div>

        <div className="hud-field">
          <span className="hud-field-label">Braços</span>
          <div className="hud-group" role="group" aria-label="Braços do teste">
            <button
              type="button"
              aria-pressed={statusFilter === "all"}
              onClick={() => handleStatusFilterChange("all")}
            >
              Todos os funis
            </button>
            <button
              type="button"
              aria-pressed={statusFilter === "active"}
              onClick={() => handleStatusFilterChange("active")}
            >
              Somente ativos
            </button>
          </div>
        </div>

        {!loading && data && (
          <div className="hud-field ml-auto justify-items-end text-right">
            <span className="hud-field-label">
              {data.meta.range ? "Webhooks no período" : "Webhooks recebidos"}
            </span>
            <div className="flex h-9 items-center gap-1.5 text-sm">
              <span className="text-base font-bold tabular-nums">
                {formatNumber(data.meta.totalEvents)}
              </span>
              <span className="text-muted-foreground">
                · {data.meta.lastEventAt ? `último evento ${lastEventLabel}` : lastEventLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {avisoInicio && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{avisoInicio}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="grid gap-5">
          <FunnelSkeleton />
          <FunnelSkeleton />
        </div>
      ) : data ? (
        <div className="grid gap-5">
          {visibleFunnels.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              Nenhum funil ativo no momento.
            </p>
          ) : (
            visibleFunnels.map((f) => <FunnelPanel key={f.id} funnel={f} />)
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function FunilPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col gap-5">
          <FunnelSkeleton />
          <FunnelSkeleton />
        </div>
      }
    >
      <FunilContent />
    </Suspense>
  );
}
