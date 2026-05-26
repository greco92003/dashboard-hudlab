"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  RefreshCw,
  Trophy,
  ChevronDown,
  ArrowRight,
  Target,
  Users,
  ListChecks,
  Archive,
  ArchiveRestore,
  PhoneCall,
  Phone,
  Mail,
  ChevronUp,
} from "lucide-react";

type Period = "weekly" | "monthly" | "yearly";

interface FollowUpLead {
  subscriber_id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  quantidade_pares: number | null;
  stage_slug: string;
  stage_name: string;
  stage_order: number;
  occurred_at: string;
}

interface FollowUpData {
  listaA: FollowUpLead[];
  listaB: FollowUpLead[];
  listaC: FollowUpLead[];
  archived: FollowUpLead[];
}

interface FunnelStage {
  id: number;
  name: string;
  order: number;
  count: number;
  previousCount: number;
  conversionFromPrevious: number | null;
  growthRate: number;
}

interface FunnelData {
  stages: FunnelStage[];
  period: Period;
  overallConversionRate: number;
  isMock: boolean;
  needsConfiguration?: boolean;
}

const PERIOD_LABELS: Record<Period, string> = {
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("pt-BR");
}

function GrowthIndicator({ rate }: { rate: number }) {
  if (rate === 0)
    return <span className="text-muted-foreground text-xs">—</span>;
  const isPositive = rate > 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${
        isPositive ? "text-emerald-500" : "text-red-500"
      }`}
    >
      {isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {isPositive ? "+" : ""}
      {rate}%
    </span>
  );
}

// 10 fixed hex colors for each funnel stage
const STAGE_COLORS = [
  "#1A00FF", // 1 Azul escuro
  "#003CFF", // 2 Azul intenso
  "#0080FF", // 3 Azul médio
  "#00CFFF", // 4 Azul claro / ciano
  "#00FFCC", // 5 Verde água
  "#00FF00", // 6 Verde
  "#BFFF00", // 7 Amarelo-esverdeado
  "#FFFF00", // 8 Amarelo
  "#FF9900", // 9 Laranja
  "#FF1A00", // 10 Vermelho
];

function FunnelBar({
  stage,
  maxCount,
  index,
  total,
}: {
  stage: FunnelStage;
  maxCount: number;
  index: number;
  total: number;
}) {
  const widthPercent =
    maxCount > 0 ? Math.max((stage.count / maxCount) * 100, 8) : 8;
  const isLast = index === total - 1;
  const color = STAGE_COLORS[index] ?? STAGE_COLORS[STAGE_COLORS.length - 1];

  return (
    <div className="flex flex-col gap-1">
      {/* Stage card */}
      <div
        className="rounded-xl p-4 border border-border/40"
        style={{ backgroundColor: `${color}15` }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: color }}
            >
              {stage.order}
            </div>
            <span className="font-semibold text-sm text-foreground">
              {stage.name}
            </span>
            {isLast && <Trophy className="h-4 w-4 text-amber-500" />}
          </div>
          <div className="flex items-center gap-3">
            <GrowthIndicator rate={stage.growthRate} />
            <span className="text-xl font-bold text-foreground">
              {formatNumber(stage.count)}
            </span>
          </div>
        </div>

        {/* Bar */}
        <div className="w-full bg-border/30 rounded-full h-3 overflow-hidden">
          <div
            className="h-3 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${widthPercent}%`, backgroundColor: color }}
          />
        </div>

        {/* Conversion from previous period label */}
        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <span>
            Período anterior:{" "}
            <span className="font-medium text-foreground">
              {formatNumber(stage.previousCount)}
            </span>
          </span>
          {stage.conversionFromPrevious !== null && (
            <span>
              Conversão da etapa anterior:{" "}
              <span className="font-semibold text-foreground">
                {stage.conversionFromPrevious}%
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Arrow connector between stages */}
      {!isLast && (
        <div className="flex flex-col items-center py-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ChevronDown className="h-4 w-4 text-muted-foreground/60" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function FunilPage() {
  const [period, setPeriod] = useState<Period>("monthly");
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpData, setFollowUpData] = useState<FollowUpData | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/manychat/funnel?period=${period}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Erro ${res.status}`);
        const data: FunnelData = await res.json();
        setFunnelData(data);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Erro desconhecido");
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [period, refreshKey]);

  const loadFollowUp = useCallback(async () => {
    setFollowUpLoading(true);
    try {
      const res = await fetch("/api/manychat/followup");
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data: FollowUpData = await res.json();
      setFollowUpData(data);
    } catch {
      // silently fail
    } finally {
      setFollowUpLoading(false);
    }
  }, []);

  const handleFollowUpToggle = () => {
    if (!showFollowUp && !followUpData) {
      loadFollowUp();
    }
    setShowFollowUp((v) => !v);
  };

  const handleArchive = async (lead: FollowUpLead, listaOrigem: string) => {
    await fetch("/api/manychat/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriber_id: lead.subscriber_id,
        lista_origem: listaOrigem,
      }),
    });
    loadFollowUp();
  };

  const handleUnarchive = async (lead: FollowUpLead) => {
    await fetch("/api/manychat/archive", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriber_id: lead.subscriber_id }),
    });
    loadFollowUp();
  };

  const handlePeriodChange = (value: string) => {
    setPeriod(value as Period);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Funil de Vendas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Acompanhe a jornada dos seus leads do primeiro ao último contato
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={period} onValueChange={handlePeriodChange}>
            <TabsList>
              <TabsTrigger value="weekly">Semanal</TabsTrigger>
              <TabsTrigger value="monthly">Mensal</TabsTrigger>
              <TabsTrigger value="yearly">Anual</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Mock data notice */}
      {funnelData?.isMock && (
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            <strong>Dados de demonstração.</strong> Configure seu token ManyChat
            no arquivo{" "}
            <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">
              .env.local
            </code>{" "}
            com a variável{" "}
            <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">
              MANYCHAT_API_TOKEN
            </code>{" "}
            para visualizar dados reais.
          </AlertDescription>
        </Alert>
      )}

      {/* Error state */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : funnelData ? (
        <SummaryCards data={funnelData} periodLabel={PERIOD_LABELS[period]} />
      ) : null}

      {/* Funnel Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Etapas do Funil — {PERIOD_LABELS[period]}
          </CardTitle>
          <CardDescription>
            Cada etapa representa uma tag do ManyChat. As barras mostram o
            volume relativo e as setas indicam a taxa de conversão entre etapas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : funnelData && funnelData.stages.length > 0 ? (
            <FunnelStages stages={funnelData.stages} />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma tag encontrada no ManyChat.</p>
              <p className="text-sm mt-1">
                Configure suas tags no ManyChat para visualizar o funil.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stage-to-stage conversion table */}
      {!loading && funnelData && funnelData.stages.length > 1 && (
        <ConversionTable
          stages={funnelData.stages}
          period={PERIOD_LABELS[period]}
        />
      )}

      {/* Follow-Up Toggle + Lists */}
      <div className="flex flex-col gap-4">
        <Button
          variant={showFollowUp ? "default" : "outline"}
          size="sm"
          className="w-fit gap-2"
          onClick={handleFollowUpToggle}
        >
          <ListChecks className="h-4 w-4" />
          Lista de Follow-Up
          {showFollowUp ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </Button>

        {showFollowUp && (
          <FollowUpSection
            data={followUpData}
            loading={followUpLoading}
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived((v) => !v)}
            onArchive={handleArchive}
            onUnarchive={handleUnarchive}
            onRefresh={loadFollowUp}
          />
        )}
      </div>
    </div>
  );
}

function SummaryCards({
  data,
  periodLabel,
}: {
  data: FunnelData;
  periodLabel: string;
}) {
  const firstStage = data.stages[0];
  const lastStage = data.stages[data.stages.length - 1];
  const totalGrowth =
    data.stages.reduce((sum, s) => sum + s.growthRate, 0) / data.stages.length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Total leads (first stage) */}
      <Card className="border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            Entrada no Funil ({periodLabel})
          </CardDescription>
          <CardTitle className="text-3xl font-bold text-blue-600 dark:text-blue-400">
            {formatNumber(firstStage?.count ?? 0)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <GrowthIndicator rate={firstStage?.growthRate ?? 0} />
            <span>vs. período anterior</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {firstStage?.name}
          </p>
        </CardContent>
      </Card>

      {/* Conversions (last stage) */}
      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5 text-amber-500" />
            Conversões ({periodLabel})
          </CardDescription>
          <CardTitle className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatNumber(lastStage?.count ?? 0)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <GrowthIndicator rate={lastStage?.growthRate ?? 0} />
            <span>vs. período anterior</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {lastStage?.name}
          </p>
        </CardContent>
      </Card>

      {/* Overall conversion rate */}
      <Card className="border-purple-200 dark:border-purple-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-transparent dark:from-purple-950/20" />
        <CardHeader className="pb-2 relative">
          <CardDescription className="flex items-center gap-1">
            <ArrowRight className="h-3.5 w-3.5" />
            Taxa de Conversão Geral
          </CardDescription>
          <CardTitle className="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {data.overallConversionRate}%
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <p className="text-xs text-muted-foreground">
            De{" "}
            <span className="font-medium text-foreground">
              {firstStage?.name}
            </span>{" "}
            até{" "}
            <span className="font-medium text-foreground">
              {lastStage?.name}
            </span>
          </p>
          <div className="mt-2">
            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border-0">
              {formatNumber(firstStage?.count ?? 0)} →{" "}
              {formatNumber(lastStage?.count ?? 0)}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FunnelStages({ stages }: { stages: FunnelStage[] }) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="flex flex-col gap-2">
      {stages.map((stage, i) => (
        <FunnelBar
          key={stage.id}
          stage={stage}
          maxCount={maxCount}
          index={i}
          total={stages.length}
        />
      ))}
    </div>
  );
}

// ─── Follow-Up Components ────────────────────────────────────────────────────

function LeadCard({
  lead,
  listLabel,
  onArchive,
  onUnarchive,
  isArchived,
}: {
  lead: FollowUpLead;
  listLabel: string;
  onArchive?: () => void;
  onUnarchive?: () => void;
  isArchived?: boolean;
}) {
  const name = lead.nome ?? `ID: ${lead.subscriber_id}`;
  const hasPhone = !!lead.telefone;
  const hasEmail = !!lead.email;

  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/60 bg-card hover:bg-accent/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{name}</span>
          {lead.quantidade_pares !== null && (
            <Badge variant="secondary" className="text-xs shrink-0">
              {lead.quantidade_pares} pares
            </Badge>
          )}
          <Badge variant="outline" className="text-xs shrink-0">
            {lead.stage_name}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {lead.telefone && (
            <a
              href={`https://wa.me/${lead.telefone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-emerald-600 hover:underline"
            >
              <Phone className="h-3 w-3" />
              {lead.telefone}
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <Mail className="h-3 w-3" />
              {lead.email}
            </a>
          )}
          {!hasPhone && !hasEmail && (
            <span className="text-xs text-muted-foreground">Sem contato</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!isArchived && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            onClick={onArchive}
            title="Marcar como contactado e arquivar"
          >
            <PhoneCall className="h-3 w-3" />
            Contactado
          </Button>
        )}
        {isArchived && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            onClick={onUnarchive}
            title="Desarquivar lead"
          >
            <ArchiveRestore className="h-3 w-3" />
            Desarquivar
          </Button>
        )}
      </div>
    </div>
  );
}

function LeadList({
  title,
  description,
  leads,
  listKey,
  color,
  onArchive,
}: {
  title: string;
  description: string;
  leads: FollowUpLead[];
  listKey: string;
  color: string;
  onArchive: (lead: FollowUpLead, lista: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="border-border/60">
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <CardTitle className="text-base">{title}</CardTitle>
            <Badge
              className="text-xs font-bold"
              style={{ backgroundColor: color, color: "#fff" }}
            >
              {leads.length}
            </Badge>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <CardDescription className="text-xs mt-1">
          {description}
        </CardDescription>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum lead nesta lista
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {leads.map((lead) => (
                <LeadCard
                  key={lead.subscriber_id}
                  lead={lead}
                  listLabel={listKey}
                  onArchive={() => onArchive(lead, listKey)}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function FollowUpSection({
  data,
  loading,
  showArchived,
  onToggleArchived,
  onArchive,
  onUnarchive,
  onRefresh,
}: {
  data: FollowUpData | null;
  loading: boolean;
  showArchived: boolean;
  onToggleArchived: () => void;
  onArchive: (lead: FollowUpLead, lista: string) => void;
  onUnarchive: (lead: FollowUpLead) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Lista de Follow-Up</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showArchived ? "default" : "outline"}
            className="gap-1 text-xs"
            onClick={onToggleArchived}
          >
            <Archive className="h-3.5 w-3.5" />
            Arquivados
            {data && data.archived.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {data.archived.length}
              </Badge>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <>
          <LeadList
            title="Lista A — Alta Prioridade"
            description="Leads com 36 pares ou mais que ainda não solicitaram mockup oficial"
            leads={data.listaA}
            listKey="A"
            color="#1A00FF"
            onArchive={onArchive}
          />
          <LeadList
            title="Lista B — Média Prioridade"
            description="Leads com menos de 36 pares que ainda não solicitaram mockup oficial"
            leads={data.listaB}
            listKey="B"
            color="#FF9900"
            onArchive={onArchive}
          />
          <LeadList
            title="Lista C — Reengajamento"
            description="Leads que só viram modelos e preços e não avançaram"
            leads={data.listaC}
            listKey="C"
            color="#FF1A00"
            onArchive={onArchive}
          />

          {showArchived && (
            <Card className="border-border/40 opacity-80">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Arquivados</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {data.archived.length}
                  </Badge>
                </div>
                <CardDescription className="text-xs mt-1">
                  Leads já contactados. Clique em Desarquivar para devolvê-los à
                  lista original.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {data.archived.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhum lead arquivado
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.archived.map((lead) => (
                      <LeadCard
                        key={lead.subscriber_id}
                        lead={lead}
                        listLabel="archived"
                        isArchived
                        onUnarchive={() => onUnarchive(lead)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum dado disponível</p>
        </div>
      )}
    </div>
  );
}

// ─── Conversion Table ─────────────────────────────────────────────────────────

function ConversionTable({
  stages,
  period,
}: {
  stages: FunnelStage[];
  period: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Taxas de Conversão por Etapa — {period}
        </CardTitle>
        <CardDescription>
          Comparação entre etapas e crescimento em relação ao período anterior
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                  Etapa
                </th>
                <th className="text-right py-2 px-4 text-muted-foreground font-medium">
                  Atual
                </th>
                <th className="text-right py-2 px-4 text-muted-foreground font-medium">
                  Anterior
                </th>
                <th className="text-right py-2 px-4 text-muted-foreground font-medium">
                  Crescimento
                </th>
                <th className="text-right py-2 pl-4 text-muted-foreground font-medium">
                  Conv. da etapa anterior
                </th>
              </tr>
            </thead>
            <tbody>
              {stages.map((stage, i) => (
                <tr key={stage.id} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                        {stage.order}
                      </span>
                      <span className="font-medium">{stage.name}</span>
                      {i === stages.length - 1 && (
                        <Trophy className="h-3.5 w-3.5 text-amber-500" />
                      )}
                    </div>
                  </td>
                  <td className="text-right py-3 px-4 font-semibold">
                    {formatNumber(stage.count)}
                  </td>
                  <td className="text-right py-3 px-4 text-muted-foreground">
                    {formatNumber(stage.previousCount)}
                  </td>
                  <td className="text-right py-3 px-4">
                    <GrowthIndicator rate={stage.growthRate} />
                  </td>
                  <td className="text-right py-3 pl-4">
                    {stage.conversionFromPrevious !== null ? (
                      <Badge variant="secondary" className="font-mono text-xs">
                        {stage.conversionFromPrevious}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
